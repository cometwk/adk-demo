-- MySQL 8+
-- 为了方便演示，每次运行前可以清空
DROP TABLE IF EXISTS job_queue;
DROP TABLE IF EXISTS job_history;


-- 任务主表，存储待处理和处理中的任务
CREATE TABLE IF NOT EXISTS job_queue (
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

  -- 2. 核心调度索引：MySQL 8+ 支持降序索引（DESC）。ASC 是默认值，可省略。
  KEY idx_job_queue_scheduling (queue_name, available_at, priority DESC, id),

  -- 3. 租约回收索引：用于快速查找已过期的租约（lease_until IS NOT NULL 的行）
  -- 注意：MySQL 不支持部分索引，所以会索引所有行（包括 NULL）
  KEY idx_job_queue_lease_recovery (lease_until)

) ENGINE=InnoDB;

-- 历史表，用于审计、排障和数据分析
CREATE TABLE IF NOT EXISTS job_history (
  id            BIGINT PRIMARY KEY,                               -- 来源于 job_queue.id
  queue_name    VARCHAR(191) NOT NULL,
  priority      INT NOT NULL,
  unique_key    VARCHAR(191) NULL,
  payload       JSON NOT NULL,
  result        JSON NULL,                                        -- 存储成功结果或最终的错误信息
  -- 使用 ENUM 可以更节省空间并保证数据完整性，VARCHAR 提供了更大的灵活性
  status_final  VARCHAR(20) NOT NULL, -- ENUM('completed', 'dead_letter', 'discarded') 也是一个很好的选择
  attempts      INT NOT NULL,
  processed_by  VARCHAR(191) NULL,                                -- 最后处理该任务的 worker ID
  created_at    TIMESTAMP(6) NOT NULL,                            -- 原始任务的创建时间
  started_at    TIMESTAMP(6) NULL,                                -- 首次被处理的时间
  finished_at   TIMESTAMP(6) NULL, -- 完成或归档的时间

  -- 索引:
  -- 用于按队列和完成时间快速查询历史记录
  KEY idx_job_history_query (queue_name, finished_at DESC),

  -- 用于按最终状态查询
  KEY idx_job_history_status (status_final)

) ENGINE=InnoDB;
