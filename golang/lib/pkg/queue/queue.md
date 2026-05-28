
# 设计 V2

 - Riverqueue 风格（租约/可见性超时）
 - 多队列 
 - 优先级 
 - 幂等/去重 
 - 指数退避 
 - 审计/归档

兼容 **Postgres** 与 **MySQL 8+**（分别给出 SQL 差异），并附上核心 API（Enqueue/Dequeue/Ack/Nack/Heartbeat）示例与关键运维点。

---

# 目标与原则

- **简单 & 可索引**：最小必要字段，状态可推导。
- **抢占原子**：`FOR UPDATE SKIP LOCKED`/行锁，避免多 worker 同取同一任务。
- **租约（lease）**：用 `lease_until` + 心跳续租（heartbeat），防止长任务被“误回收”。
- **可见性超时**：类似 SQS 的 `available_at`，失败后延迟可见。
- **幂等/去重**：`unique_key` + 幂等语义，避免重复执行。
- **重试策略**：指数退避 + 抖动（jitter）。
- **审计/归档**：任务完成/失败入历史表（或死信队列），支持排障与报表。
- **多队列/优先级**：支持业务隔离与调度。
    

---

# 一、核心数据模型

## 1.1 任务表（job_queue）

> 状态由 `lease_until / attempts / max_attempts / available_at` 推导，不设显式 status。

**Postgres 版**

```sql
CREATE TABLE job_queue (
  id            BIGSERIAL PRIMARY KEY,
  queue_name    TEXT NOT NULL DEFAULT 'default',
  priority      INT  NOT NULL DEFAULT 0,                 -- 值越大优先级越高
  unique_key    TEXT NULL,                               -- 去重/幂等键（如订单号）
  payload       JSONB NOT NULL,                          -- 任务载荷
  attempts      INT NOT NULL DEFAULT 0,                  -- 已尝试次数
  max_attempts  INT NOT NULL DEFAULT 5,                  -- 最大尝试次数
  available_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- 可见时间（延迟/退避后）
  lease_until   TIMESTAMPTZ NULL,                        -- 租约到期时间（被 worker 锁定时设置）
  locked_by     TEXT NULL,                               -- worker_id（仅持锁期间非空）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 幂等去重（同一队列内 unique_key 唯一；如需跨队列全局唯一可只保留 unique_key）
CREATE UNIQUE INDEX uq_job_queue_unique_key
  ON job_queue (queue_name, unique_key)
  WHERE unique_key IS NOT NULL;

-- 任务选择常用索引
CREATE INDEX idx_job_queue_sched
  ON job_queue (queue_name, available_at, priority DESC, id);

CREATE INDEX idx_job_queue_lease
  ON job_queue (lease_until);

-- updated_at 触发器（可选）
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON job_queue
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**MySQL 8+ 版**

```sql
-- 任务主表，存储待处理和处理中的任务
CREATE TABLE job_queue (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  queue_name    VARCHAR(191) NOT NULL DEFAULT 'default',
  priority      INT NOT NULL DEFAULT 0,                           -- 值越大，优先级越高
  unique_key    VARCHAR(191) NULL,                                -- 幂等键，为 NULL 时表示不进行去重
  payload       JSON NOT NULL,                                    -- 任务载荷
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  available_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), -- 任务可见时间
  lease_until   TIMESTAMP(6) NULL,                                  -- 租约到期时间，为 NULL 表示未被锁定
  locked_by     VARCHAR(191) NULL,                                  -- 持有租约的 worker ID
  created_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

  -- 索引:
  -- 1. 幂等性索引：MySQL 的唯一键允许多个 NULL 值存在。
  UNIQUE KEY uq_job_queue_unique_key (queue_name, unique_key),

  -- 2. 核心调度索引：MySQL 8+ 支持降序索引（DESC）。
  KEY idx_job_queue_scheduling (queue_name, available_at, priority DESC, id ASC),

  -- 3. 租约回收索引
  KEY idx_job_queue_lease_recovery (lease_until)

) ENGINE=InnoDB;

```

> **推导状态**
> 
> - **待处理**：`lease_until IS NULL` 且 `available_at <= now()` 且 `attempts < max_attempts`
>     
> - **处理中**：`lease_until > now()`
>     
> - **可重试**：`lease_until IS NULL` 且 `available_at > now()`
>     
> - **死信候选**：`attempts >= max_attempts`（迁出到 DLQ）
>     

---

## 1.2 历史表（job_history）

> 完成/最终失败（或显式丢弃）落历史，保留审计信息与耗时。

```sql
-- Postgres/MySQL 结构类似
CREATE TABLE job_history (
  id            BIGINT PRIMARY KEY,           -- 与 job_queue.id 一致（或另起主键并冗余 job_id）
  queue_name    TEXT NOT NULL,
  priority      INT NOT NULL,
  unique_key    TEXT NULL,
  payload  JSONB NOT NULL,
  result        JSONB NULL,                   -- 成功结果/最终错误
  status_final  TEXT NOT NULL,                -- 'completed' | 'dead_letter' | 'discarded'
  attempts      INT NOT NULL,
  processed_by  TEXT NULL,                    -- 最后处理的 worker_id
  created_at    TIMESTAMPTZ NOT NULL,
  started_at    TIMESTAMPTZ NULL,             -- 第一次被租用时间
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_history_qtime ON job_history (queue_name, finished_at);
```

## 1.3 死信表（job_dead_letter）（可选）

> 也可直接复用 `job_history(status_final='dead_letter')` 作为死信。

```sql
CREATE TABLE job_dead_letter (
  id           BIGINT PRIMARY KEY,
  queue_name   TEXT NOT NULL,
  unique_key   TEXT NULL,
  payload JSONB NOT NULL,
  last_error   JSONB NOT NULL,
  attempts     INT NOT NULL,
  failed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# 二、核心流程与 SQL

## 2.1 Enqueue（带去重/幂等）

- 有 `unique_key`：用 UPSERT，已存在则直接返回已有任务 id（避免重复投递）。
    
- 可设置 `delay_seconds`：写 `available_at = now() + delay`。
    

**Postgres**

```sql
INSERT INTO job_queue (queue_name, priority, unique_key, payload, max_attempts, available_at)
VALUES ($1, $2, $3, $4::jsonb, $5, NOW() + ($6 || ' seconds')::interval)
ON CONFLICT (queue_name, unique_key)
DO NOTHING
RETURNING id;
```

> 若 `RETURNING` 无行，说明已存在；需要再 `SELECT id FROM job_queue WHERE queue_name=$1 AND unique_key=$3;`

**MySQL**

```sql
INSERT INTO job_queue (queue_name, priority, unique_key, payload, max_attempts, available_at)
VALUES (?, ?, ?, CAST(? AS JSON), ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6)))
ON DUPLICATE KEY UPDATE id = id; -- 空更新占位
```

> 然后 `SELECT id FROM job_queue WHERE queue_name=? AND unique_key=?;`

---

## 2.2 Dequeue（原子加锁 + 租约 + 优先级 + 多队列）

- 仅选择**未持锁**且**可见**的任务。
- 携带 worker 的 `lease_seconds` 参数；
  - 设置 `lease_until = now()+lease_seconds`、`locked_by = worker_id`、`attempts = attempts+1`。
- **重要**：用 `ORDER BY priority DESC, available_at ASC, id ASC`，公平且偏向高优先。
    

**Postgres 和 MYSQL 采用统一逻辑**

**MySQL（两步法：SELECT ... FOR UPDATE SKIP LOCKED + UPDATE）**

> MySQL 8.0.1+ 支持 `FOR UPDATE SKIP LOCKED`（InnoDB 引擎），推荐使用此方案：
> 1. 先 SELECT 并锁定 ID（使用 SKIP LOCKED 跳过已锁行）
> 2. 再 UPDATE 设置租约

```sql
-- 第一步：查找并锁定任务 ID（在事务内）
SELECT id
FROM job_queue
WHERE queue_name IN (?)               -- 多队列，逗号拼接或使用预编译数组扩展
  AND lease_until IS NULL
  AND available_at <= CURRENT_TIMESTAMP(6)
  AND attempts < max_attempts
ORDER BY priority DESC, available_at ASC, id ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- 第二步：更新租约信息（添加条件检查，防御性编程）
UPDATE job_queue
SET lease_until = TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6)),
    locked_by   = ?,
    attempts    = attempts + 1
WHERE id = ?  -- 使用第一步获取的 ID
  AND lease_until IS NULL 
  AND attempts < max_attempts;  -- 确保任务状态仍然满足条件

-- 检查受影响行数，如果为 0 说明任务状态已改变（不应该发生，但检查以提高健壮性）
-- 如果 affected == 0，应该返回错误

-- 第三步：获取完整的任务数据
SELECT * FROM job_queue WHERE id = ?;
```

> **锁机制说明**：
> 
> 1. **这是悲观锁（Pessimistic Lock）**：
>    - `FOR UPDATE SKIP LOCKED` 在 SELECT 时就获取行锁
>    - 锁会持续到事务结束（COMMIT 或 ROLLBACK）
>    - 检查受影响行数**不是乐观锁**，而是防御性检查
> 
> 2. **两个 Session 不会同时选择同一条记录**：
>    - Session A 执行 `SELECT ... FOR UPDATE SKIP LOCKED`，锁定 id=1
>    - Session B 执行 `SELECT ... FOR UPDATE SKIP LOCKED`，**会跳过已锁定的 id=1**，自动选择下一个可用的行（如 id=2）
>    - 这是 `SKIP LOCKED` 的核心特性：**自动跳过已锁定的行，避免冲突**
> 
> 3. **为什么还要检查受影响行数？**
>    - 虽然 `FOR UPDATE` 已经锁定了行，理论上状态不会改变
>    - 但检查行数可以：
>      - 防止边界情况（虽然不应该发生）
>      - 提供更好的错误诊断
>      - 提高代码健壮性（防御性编程）
> 
> **优势**：
> - `SKIP LOCKED` 自动跳过已锁定的行，无需重试逻辑
> - 与 PostgreSQL 行为一致，代码维护更简单
> - 在事务内完成，保证原子性
> - **保证并发安全**：多个 worker 不会获取同一任务
> 
> **注意**：需要 MySQL 8.0.1+ 和 InnoDB 引擎。如果使用 MySQL 8.0.19+，也可以考虑单条 `UPDATE ... ORDER BY ... LIMIT 1` 方案（但无法直接返回更新后的完整行）。

---

## 2.3 Ack（成功确认，转历史并删除）

> 保证“**先归档，后删除**”在同一事务内完成，避免中间失败丢数据。

**通用伪 SQL（事务内）**

```sql
-- 1) 插入历史
INSERT INTO job_history (id, queue_name, priority, unique_key, payload,
                         result, status_final, attempts, processed_by,
                         created_at, started_at, finished_at)
SELECT id, queue_name, priority, unique_key, payload,
       $result::jsonb, 'completed', attempts, $worker_id,
       created_at,
       NULLIF(least(created_at, lease_until), created_at), -- 如需记录开始处理时间，可在首次租用时补充
       NOW()
FROM job_queue
WHERE id = $id AND locked_by = $worker_id;

-- 2) 删除原任务
DELETE FROM job_queue WHERE id = $id AND locked_by = $worker_id;
```

---

## 2.4 Nack（失败，释放锁并延迟重试：指数退避 + 抖动）

> backoff 公式示例：`delay = base * 2^(attempts-1)`，再乘 `rand(0.8~1.2)` 抖动。

**Postgres**

```sql
WITH j AS (
  SELECT attempts FROM job_queue WHERE id=$1 AND locked_by=$2
)
UPDATE job_queue
SET lease_until = NULL,
    locked_by   = NULL,
    available_at = NOW()
      + make_interval(secs => GREATEST(1, ROUND($3 * pow(2, j.attempts-1) * (1 + ($4 * (random()-0.5)*2)))))
FROM j
WHERE id=$1 AND locked_by=$2;
```

**MySQL**

```sql
UPDATE job_queue
SET lease_until = NULL,
    locked_by   = NULL,
    available_at = TIMESTAMPADD(
      SECOND,
      GREATEST(1, ROUND(? * POW(2, attempts-1) * (1 + (? * (RAND()-0.5)*2)))),
      CURRENT_TIMESTAMP(6)
    )
WHERE id=? AND locked_by=?;
```

---

## 2.5 Heartbeat（心跳续租）

> 长任务周期性续租，避免 lease 到期被其他 worker 抢走。

```sql
UPDATE job_queue
SET lease_until = TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6)) -- 或 NOW() + interval
WHERE id = ? AND locked_by = ? AND lease_until > CURRENT_TIMESTAMP(6);
```

---

## 2.6 租约到期回收（**无需**外部 cron，内联回收）

> 在 **Dequeue** 语句中只挑 `lease_until IS NULL` 的；  
> 同时可以提供一个“**软回收**”API：把过期租约行释放为可见（可在低频后台运行或在取任务前先跑一遍）。

```sql
UPDATE job_queue
SET lease_until = NULL,
    locked_by   = NULL,
    available_at = LEAST(available_at, CURRENT_TIMESTAMP(6))
WHERE lease_until IS NOT NULL
  AND lease_until <= CURRENT_TIMESTAMP(6)
LIMIT 1000; -- 批量回收，防止长事务
```

> **为何仍建议保留？**
> 
> 1. 大量 worker 崩溃时能加速回收；2) 非关键路径运行，降低 Dequeue 负担。
>     

---

## 2.7 死信（达到最大重试）

> 两种做法：  
> a) 由 Dequeue 筛选时就不再取到（自然“沉底”），再由后台搬运到死信/历史；  
> b) 在 Nack 时若 `attempts+1 >= max_attempts` 直接搬运。

**搬运到历史作为 dead_letter：**

```sql
-- 事务内
INSERT INTO job_history (id, queue_name, priority, unique_key, payload,
                         result, status_final, attempts, processed_by,
                         created_at, started_at, finished_at)
SELECT id, queue_name, priority, unique_key, payload,
       jsonb_build_object('error', $error_json), 'dead_letter', attempts, $worker_id,
       created_at, NULL, NOW()
FROM job_queue
WHERE id=$id;

DELETE FROM job_queue WHERE id=$id;
```

---

# 三、Worker 侧接口（Go 伪代码）

> 重点是**单条事务**包住选取+加锁（PG 最佳）；MySQL 使用 `UPDATE … ORDER BY … LIMIT 1`。

```go
type DequeueRequest struct {
  Queues       []string
  LeaseSeconds int
  WorkerID     string
}

type Job struct {
  ID          int64
  QueueName   string
  Priority    int
  UniqueKey   *string
  Data        []byte
  Attempts    int
  MaxAttempts int
  AvailableAt time.Time
  LeaseUntil  *time.Time
  LockedBy    *string
}

// ENQUEUE
func Enqueue(ctx context.Context, q string, prio int, unique *string, data []byte, maxAtt int, delay time.Duration) (id int64, existed bool, err error)

// DEQUEUE（带超时）
func Dequeue(ctx context.Context, req DequeueRequest) (*Job, error)

// ACK
func Ack(ctx context.Context, jobID int64, workerID string, resultJSON []byte) error

// NACK（失败退避）
func Nack(ctx context.Context, jobID int64, workerID string, baseBackoffSeconds int, jitter float64, lastErrJSON []byte) error

// HEARTBEAT（续租）
func Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (ok bool, err error)
```

> 建议：
> 
> - 任务处理时**本地幂等**（如接入业务侧“去重幂等表/日志”）。
>     
> - Dequeue 返回后即刻记录 `started_at`（可在 job_queue 增一列 `first_locked_at`，仅第一次加锁时写入）。
>     

---

# 四、运维与可观测性

- **监控指标**
    
    - `ready_count`（按队列/优先级分布）
        
    - `inflight_count`（lease 中）
        
    - `dead_letter_count`
        
    - `p99 dequeue latency` / `p99 ack time`
        
    - `attempts histogram`、`success/failed rate`
        
- **清理与归档**
    
    - `job_history` 可按 `finished_at` 分区/分表，定期冷存。
        
- **容量与索引**
    
    - 热路径索引：`(queue_name, available_at, priority, id)`；  
        若队列很多，考虑**分表/分区**（按 queue 分表或 hash 分片）。
        
- **时钟一致性**
    
    - 所有节点尽量 NTP 对时；否则 `available_at/lease_until` 需适度冗余（如延长 lease）。
        
- **幂等落地**
    
    - 对“关键副作用”（扣款、库存）务必业务侧落一张 `idempotency` 表：  
        `idempotency_key`（可用 `unique_key + action`）唯一，保证重试/回放不重复执行。
        

---

# 五、可选增强

- **速率限制（Rate Limit）**  
    为队列增配表 `queue_config(rate_per_sec, concurrency_limit, max_lease_secs, base_backoff, jitter)`，在 worker 端或取数 SQL 前置限流。
    
- **批处理**  
    在 Dequeue 中 `LIMIT N`（PG 可用 `UPDATE ... FROM cte` 批量加锁返回），配合批量 Ack/Nack，提高吞吐。
    
- **任务超大载荷**  
    仅存引用（如对象存储 key），避免热表 Bloat。
    
- **租约丢失保护**  
    Heartbeat 失败时，worker 应**自杀/放弃**该任务（避免“双写”）。
    

---

# 六、对比你的原简化设计的关键修复

- ✅ **删除即完成 → 归档后删除**：保审计与幂等核对
    
- ✅ **单字段锁 → 明确租约 lease + 心跳**：长任务不误回收
    
- ✅ **固定 30s 延迟 → 指数退避 + 抖动**：避免雪崩
    
- ✅ **单队列 → 多队列 + 优先级**：调度可控
    
- ✅ **外部 cron 恢复 → 内联逻辑 + 软回收**：减少外部依赖
    
- ✅ **无去重 → unique_key + 幂等表**：避免重复副作用
    
