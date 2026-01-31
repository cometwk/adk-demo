-- DROP TABLE if exists job_queue;
-- DROP TABLE if exists job_history;

-- 任务主表，存储待处理和处理中的任务
CREATE TABLE job_queue (
  id            BIGSERIAL PRIMARY KEY,
  queue_name    TEXT NOT NULL DEFAULT 'default',
  priority      INT NOT NULL DEFAULT 0,                           -- 值越大，优先级越高
  unique_key    TEXT NULL,                                        -- 幂等键，为 NULL 时表示不进行去重
  payload       JSONB NOT NULL,                                   -- 任务载荷
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  available_at  TIMESTAMP NOT NULL DEFAULT NOW(),               -- 任务可见时间（用于延迟执行或指数退避）
  lease_until   TIMESTAMP NULL,                                 -- 租约到期时间，为 NULL 表示未被锁定
  locked_by     TEXT NULL,                                        -- 持有租约的 worker ID
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 索引:
-- 1. 幂等性索引：仅当 unique_key 不为 NULL 时，保证 (queue_name, unique_key) 的唯一性。
CREATE UNIQUE INDEX uq_job_queue_unique_key
  ON job_queue (queue_name, unique_key)
  WHERE unique_key IS NOT NULL;

-- 2. 核心调度索引：Dequeue 操作的关键索引，确保高效地按优先级、可见时间顺序获取任务。
CREATE INDEX idx_job_queue_scheduling
  ON job_queue (queue_name, available_at, priority DESC, id ASC);

-- 3. 租约回收索引：用于快速查找已过期的租约。
CREATE INDEX idx_job_queue_lease_recovery
  ON job_queue (lease_until)
  WHERE lease_until IS NOT NULL;


-- -- 触发器: 自动更新 updated_at 时间戳
-- CREATE OR REPLACE FUNCTION set_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE TRIGGER trg_job_queue_set_updated_at
-- BEFORE UPDATE ON job_queue
-- FOR EACH ROW EXECUTE FUNCTION set_updated_at();



-- 历史表，用于审计、排障和数据分析
CREATE TABLE job_history (
  id            BIGINT PRIMARY KEY,                               -- 来源于 job_queue.id
  queue_name    TEXT NOT NULL,
  priority      INT NOT NULL,
  unique_key    TEXT NULL,
  payload       JSONB NOT NULL,
  result        JSONB NULL,                                       -- 存储成功结果或最终的错误信息
  status_final  TEXT NOT NULL CHECK (status_final IN ('completed', 'dead_letter', 'discarded')), -- 最终状态
  attempts      INT NOT NULL,
  processed_by  TEXT NULL,                                        -- 最后处理该任务的 worker ID
  created_at    TIMESTAMP NOT NULL,                             -- 原始任务的创建时间
  started_at    TIMESTAMP NULL,                                 -- 首次被处理的时间（可选，需在 worker 逻辑中填充）
  finished_at   TIMESTAMP NULL                                  -- 完成或归档的时间，默认 NULL，完成后才设置
);

-- 索引:
-- 用于按队列和完成时间快速查询历史记录
CREATE INDEX idx_job_history_query
  ON job_history (queue_name, finished_at DESC);

-- 用于按最终状态查询，例如查找所有死信任务
CREATE INDEX idx_job_history_status
  ON job_history (status_final);