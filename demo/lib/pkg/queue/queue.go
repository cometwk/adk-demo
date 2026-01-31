package queue

import (
	"context"
	"fmt"
	"math"
	"math/rand/v2"
	"time"

	"xorm.io/builder"
	"xorm.io/xorm"
)

// RetryError 表示需要重试的错误
type RetryError struct {
	Message string
}

func (e *RetryError) Error() string {
	return e.Message
}

// IsRetryError 检查错误是否为重试错误
func IsRetryError(err error) bool {
	_, ok := err.(*RetryError)
	return ok
}

type JobQueue struct {
	ID          int64      `xorm:"'id' pk autoincr"                   json:"id"`
	QueueName   string     `xorm:"'queue_name' VARCHAR(128) NOT NULL" json:"queue_name"`
	Priority    int        `xorm:"'priority' INT NOT NULL DEFAULT 0"  json:"priority"`        // 值越大，优先级越高
	UniqueKey   *string    `xorm:"'unique_key' VARCHAR(128) NULL"     json:"unique_key"`      // 幂等键，为 NULL 时表示不进行去重
	Payload     string     `xorm:"'payload' JSON NOT NULL"            json:"payload"`         // 任务载荷
	Attempts    int        `xorm:"'attempts' INT NOT NULL DEFAULT 0"  json:"attempts"`        // 尝试次数
	MaxAttempts int        `xorm:"'max_attempts' INT NOT NULL DEFAULT 5" json:"max_attempts"` // 最大尝试次数
	AvailableAt time.Time  `xorm:"'available_at' TIMESTAMP(6) NOT NULL" json:"available_at"`  // 任务可见时间
	LeaseUntil  *time.Time `xorm:"'lease_until' TIMESTAMP(6) NULL"     json:"lease_until"`    // 租约到期时间，为 NULL 表示未被锁定
	LockedBy    *string    `xorm:"'locked_by' VARCHAR(128) NULL"       json:"locked_by"`      // 持有租约的 worker ID
	CreatedAt   time.Time  `xorm:"created TIMESTAMP(6) NOT NULL"       json:"created_at"`
	UpdatedAt   time.Time  `xorm:"updated TIMESTAMP(6) NOT NULL"       json:"updated_at"`

	// 标记是否已在事务中完成（不序列化）
	completedInTx bool `xorm:"-"`
}

type Job = JobQueue

// JobHistory 也同样可以修改
type JobHistory struct {
	ID          int64      `xorm:"'id' pk autoincr"                     json:"id"`
	QueueName   string     `xorm:"'queue_name' VARCHAR(128) NOT NULL"   json:"queue_name"`
	Priority    int        `xorm:"'priority' INT NOT NULL"              json:"priority"`
	UniqueKey   *string    `xorm:"'unique_key' VARCHAR(128) NULL"       json:"unique_key"`
	Payload     string     `xorm:"'payload' JSON NOT NULL"              json:"payload"`
	Result      string     `xorm:"'result' JSON NOT NULL"               json:"result"`
	StatusFinal string     `xorm:"'status_final' VARCHAR(128) NOT NULL" json:"status_final"` // 'pending', 'completed', 'dead_letter', 'discarded' (discard 人工设置)
	Attempts    int        `xorm:"'attempts' INT NOT NULL"              json:"attempts"`
	ProcessedBy *string    `xorm:"'processed_by' VARCHAR(128) NULL"     json:"processed_by"`
	CreatedAt   time.Time  `xorm:"'created_at' TIMESTAMP(6) NOT NULL"   json:"created_at"`
	StartedAt   *time.Time `xorm:"'started_at' TIMESTAMP(6) NULL"       json:"started_at"`
	FinishedAt  *time.Time `xorm:"'finished_at' TIMESTAMP(6) NULL"      json:"finished_at"`
}

// Client 是队列操作的客户端
type Client struct {
	engine *xorm.Engine
}

// NewClient 创建一个新的队列客户端
func NewClient(engine *xorm.Engine) *Client {
	return &Client{engine: engine}
}

// --- 1. Enqueue ---

// EnqueueRequest 定义了入队请求
type EnqueueRequest struct {
	QueueName   string        // 队列名称
	Priority    int           // 值越大，优先级越高
	UniqueKey   *string       // 幂等键，为 NULL 时表示不进行去重
	Payload     string        // 任务载荷，JSON 字符串
	MaxAttempts int           // 最大尝试次数
	Delay       time.Duration // 延迟时间，任务可见时间 = 当前时间 + 延迟时间
}

// Enqueue 将一个新任务加入队列，并处理幂等性
func (c *Client) Enqueue(ctx context.Context, req EnqueueRequest) (jobID int64, existed bool, err error) {
	session := c.engine.NewSession().Context(ctx)
	return Insert(session, req)
}

// Enqueue 将一个新任务加入队列，并处理幂等性
// 使用 UPSERT 方案：有 unique_key 时用 ON CONFLICT/ON DUPLICATE KEY，已存在则返回已有任务 id
func Insert(session *xorm.Session, req EnqueueRequest) (jobID int64, existed bool, err error) {
	// 确保 Delay 不为负数
	delay := max(req.Delay, 0)

	job := &JobQueue{
		QueueName:   req.QueueName,
		Priority:    req.Priority,
		UniqueKey:   req.UniqueKey, // 直接赋值指针
		Payload:     req.Payload,
		MaxAttempts: req.MaxAttempts,
		AvailableAt: time.Now().Add(delay).UTC(),
	}

	if job.MaxAttempts <= 0 {
		job.MaxAttempts = 5 // 默认值
	}
	if job.QueueName == "" {
		job.QueueName = "default" // 默认值
	}

	// 如果没有 unique_key，直接插入
	if req.UniqueKey == nil {
		affected, err := session.Insert(job)
		if err != nil {
			return 0, false, fmt.Errorf("enqueue failed: %w", err)
		}
		if affected == 0 {
			return 0, false, fmt.Errorf("failed to insert job")
		}
		// 同时插入 history 记录
		history := JobHistory{
			ID:          job.ID,
			QueueName:   job.QueueName,
			Priority:    job.Priority,
			UniqueKey:   job.UniqueKey,
			Payload:     job.Payload,
			Result:      "{}", // 初始为空 JSON
			StatusFinal: "pending",
			Attempts:    0,
			ProcessedBy: nil,
			CreatedAt:   job.CreatedAt,
			StartedAt:   nil,
			FinishedAt:  nil,
		}
		_, err = session.Insert(&history)
		if err != nil {
			return 0, false, fmt.Errorf("failed to insert job_history: %w", err)
		}
		return job.ID, false, nil
	}

	// 有 unique_key 时，使用 UPSERT 方案
	driverName := session.Engine().DriverName()

	if driverName == "postgres" || driverName == "pgx" {
		// Postgres: 使用 ON CONFLICT ... DO NOTHING RETURNING id
		delaySeconds := int(delay.Seconds())

		// 构建 UPSERT SQL
		sql := `INSERT INTO job_queue (queue_name, priority, unique_key, payload, max_attempts, available_at)
		        VALUES (?, ?, ?, ?::jsonb, ?, NOW() + (? || ' seconds')::interval)
		        ON CONFLICT (queue_name, unique_key)
		        DO NOTHING
		        RETURNING id`

		var insertedID int64
		has, err := session.SQL(sql,
			job.QueueName,
			job.Priority,
			job.UniqueKey,
			job.Payload,
			job.MaxAttempts,
			delaySeconds,
		).Get(&insertedID)

		if err != nil {
			return 0, false, fmt.Errorf("enqueue failed: %w", err)
		}

		if !has {
			// RETURNING 无行，说明已存在，需要查询已有任务 id
			var existingJob JobQueue
			found, err := session.Where("queue_name = ? AND unique_key = ?", job.QueueName, job.UniqueKey).Get(&existingJob)
			if err != nil {
				return 0, false, fmt.Errorf("failed to query existing job: %w", err)
			}
			if !found {
				return 0, false, fmt.Errorf("job not found after conflict")
			}
			return existingJob.ID, true, nil
		}

		// 新插入的任务，同时插入 history 记录
		now := time.Now().UTC()
		history := JobHistory{
			ID:          insertedID,
			QueueName:   job.QueueName,
			Priority:    job.Priority,
			UniqueKey:   job.UniqueKey,
			Payload:     job.Payload,
			Result:      "{}", // 初始为空 JSON
			StatusFinal: "pending",
			Attempts:    0,
			ProcessedBy: nil,
			CreatedAt:   now,
			StartedAt:   nil,
			FinishedAt:  nil,
		}
		_, err = session.Insert(&history)
		if err != nil {
			return 0, false, fmt.Errorf("failed to insert job_history: %w", err)
		}

		return insertedID, false, nil
	} else {
		// MySQL: 使用 ON DUPLICATE KEY UPDATE id = id
		delaySeconds := int(delay.Seconds())

		// 构建 UPSERT SQL
		sql := `INSERT INTO job_queue (queue_name, priority, unique_key, payload, max_attempts, available_at)
		        VALUES (?, ?, ?, CAST(? AS JSON), ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6)))
		        ON DUPLICATE KEY UPDATE id = id`

		res, err := session.Exec(sql,
			job.QueueName,
			job.Priority,
			job.UniqueKey,
			job.Payload,
			job.MaxAttempts,
			delaySeconds,
		)

		if err != nil {
			return 0, false, fmt.Errorf("enqueue failed: %w", err)
		}

		// 检查受影响的行数
		// INSERT: affected = 1（新插入）
		// ON DUPLICATE KEY UPDATE: affected = 2（已存在，执行了更新）
		affected, err := res.RowsAffected()
		if err != nil {
			return 0, false, fmt.Errorf("failed to get rows affected: %w", err)
		}

		// 查询任务 id（无论是否新插入或已存在）
		var existingJob JobQueue
		found, err := session.Where("queue_name = ? AND unique_key = ?", job.QueueName, job.UniqueKey).Get(&existingJob)
		if err != nil {
			return 0, false, fmt.Errorf("failed to query job after insert: %w", err)
		}
		if !found {
			return 0, false, fmt.Errorf("job not found after insert")
		}

		// 根据受影响行数判断：affected == 1 表示新插入，affected == 2 表示已存在
		if affected == 1 {
			// 新插入的任务，同时插入 history 记录
			history := JobHistory{
				ID:          existingJob.ID,
				QueueName:   existingJob.QueueName,
				Priority:    existingJob.Priority,
				UniqueKey:   existingJob.UniqueKey,
				Payload:     existingJob.Payload,
				Result:      "{}", // 初始为空 JSON
				StatusFinal: "pending",
				Attempts:    0,
				ProcessedBy: nil,
				CreatedAt:   existingJob.CreatedAt,
				StartedAt:   nil,
				FinishedAt:  nil,
			}
			_, err = session.Insert(&history)
			if err != nil {
				return 0, false, fmt.Errorf("failed to insert job_history: %w", err)
			}
			return existingJob.ID, false, nil // 新插入
		} else {
			return existingJob.ID, true, nil // 已存在
		}
	}
}

// --- 2. Dequeue ---

// DequeueRequest 定义了出队请求
type DequeueRequest struct {
	Queues       []string
	LeaseSeconds int
	WorkerID     string
}

// Dequeue 原子地从一个或多个队列中获取一个任务并锁定它
func (c *Client) Dequeue(ctx context.Context, req DequeueRequest) (*JobQueue, error) {
	var jobID int64
	var jobQueue JobQueue

	queues := make([]interface{}, len(req.Queues))
	for i, v := range req.Queues {
		queues[i] = v
	}

	session := c.engine.NewSession().Context(ctx)
	err := session.Begin()
	if err != nil {
		return nil, fmt.Errorf("dequeue transaction failed: %w", err)
	}

	defer session.Close()

	// Postgres 9.5+ 和 MySQL 8.0.1+ 都支持 FOR UPDATE SKIP LOCKED
	// 使用统一的实现，builder.Dialect 会根据数据库类型自动选择正确的 SQL 方言
	// 使用更宽松的时间比较，避免时间精度问题
	// 允许任务在1秒内可用
	availableTime := time.Now().UTC().Add(+1 * time.Second)

	selectSQL, args, err := builder.Dialect(c.engine.DriverName()).
		Select("id").
		From("job_queue").
		Where(builder.In("queue_name", queues...)).
		And(builder.Lte{"available_at": availableTime}).
		And(builder.Expr("lease_until is null and attempts < max_attempts")).
		OrderBy("priority DESC, available_at ASC, id ASC").
		Limit(1).
		ToSQL()
	if err != nil {
		return nil, fmt.Errorf("failed to build select sql: %w", err)
	}

	// SKIP LOCKED 会跳过已锁定的行，自动选择下一个可用任务，无需重试逻辑
	selectSQL += " FOR UPDATE SKIP LOCKED"

	has, err := session.SQL(selectSQL, args...).Get(&jobID)
	if err != nil {
		return nil, err
	}
	if !has {
		return nil, nil // 没有可用的任务
	}

	leaseUntil := time.Now().Add(time.Duration(req.LeaseSeconds) * time.Second)

	// UPDATE 时添加条件检查，确保任务状态仍然满足条件（防御性编程）
	// 虽然 SELECT FOR UPDATE 已经锁定了行，理论上状态不会改变，
	// 但添加条件检查可以提高健壮性，防止边界情况
	updateSQL := `UPDATE job_queue 
	              SET lease_until = ?, locked_by = ?, attempts = attempts + 1 
				  WHERE id = ? 
				    AND lease_until IS NULL 
				    AND attempts < max_attempts`

	res, err := session.Exec(updateSQL, &leaseUntil, &req.WorkerID, jobID)
	if err != nil {
		return nil, err
	}

	// 检查受影响的行数，如果为 0 说明任务状态已改变（不应该发生）
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to get rows affected: %w", err)
	}
	if affected == 0 {
		// 虽然 SELECT FOR UPDATE 已经锁定了行，但为了健壮性，检查这种情况
		return nil, fmt.Errorf("task %d state changed between SELECT and UPDATE", jobID)
	}

	// 获取完整的任务信息
	has, err = session.ID(jobID).Get(&jobQueue)
	if err != nil {
		return nil, err
	}
	if !has {
		// 几乎不可能发生，因为我们锁定了行
		return nil, fmt.Errorf("could not find job with id %d after locking", jobID)
	}

	err = session.Commit()
	if err != nil {
		return nil, fmt.Errorf("dequeue commit failed: %w", err)
	}

	// 初始化 completedInTx 标记
	jobQueue.completedInTx = false

	return &jobQueue, nil

}

// --- 事务模式的 Ack 和 Nack ---

// Ack 在事务中完成任务（成功）
func (c *Client) Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error {
	// 检查任务状态
	var jobCheck JobQueue
	has, err := tx.Where("id = ? AND locked_by = ?", job.ID, job.LockedBy).Get(&jobCheck)
	if err != nil {
		return fmt.Errorf("failed to find job to ack: %w", err)
	}
	if !has {
		lockedBy := "nil"
		if job.LockedBy != nil {
			lockedBy = *job.LockedBy
		}
		return fmt.Errorf("job %d not found or not locked by worker %s", job.ID, lockedBy)
	}

	// 更新历史记录
	now := time.Now().UTC()
	// 如果 history 中 started_at 为空，则设置为当前时间（首次处理时间）
	// 否则保持原值不变
	updateSQL := `UPDATE job_history 
	              SET result = ?, 
	                  status_final = 'completed',
	                  attempts = ?,
	                  processed_by = ?,
	                  started_at = COALESCE(started_at, ?),
	                  finished_at = ?
	              WHERE id = ?`

	_, err = tx.Exec(updateSQL,
		string(resultJSON),
		job.Attempts,
		job.LockedBy,
		now, // 如果 started_at 为 NULL，则设置为当前时间
		now, // finished_at
		job.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update job_history: %w", err)
	}

	// 删除任务
	_, err = tx.ID(job.ID).Delete(&JobQueue{})
	if err != nil {
		return fmt.Errorf("failed to delete job from job_queue: %w", err)
	}

	// 设置标记，表示已在事务中完成
	job.completedInTx = true

	return nil
}

// Nack 在事务中报告任务失败
func (c *Client) Nack(ctx context.Context, tx *xorm.Session, job *Job, baseBackoffSeconds int, jitterFactor float64, lastErrJSON []byte) error {
	// 检查任务状态
	var jobCheck JobQueue
	has, err := tx.Where("id = ? AND locked_by = ?", job.ID, job.LockedBy).Get(&jobCheck)
	if err != nil {
		return fmt.Errorf("failed to find job to nack: %w", err)
	}
	if !has {
		lockedBy := "nil"
		if job.LockedBy != nil {
			lockedBy = *job.LockedBy
		}
		return fmt.Errorf("job %d not found or not locked by worker %s", job.ID, lockedBy)
	}

	if jobCheck.Attempts >= jobCheck.MaxAttempts {
		// 达到最大次数，移入死信
		return c.moveToDeadLetterInTx(ctx, tx, &jobCheck, job.LockedBy, lastErrJSON)
	}

	// 计算指数退避 + 抖动
	// 注意：当 attempts=0 时，使用 baseBackoffSeconds（2^0 = 1）
	// attempts=1 时使用 baseBackoffSeconds * 2^0 = baseBackoffSeconds
	// attempts=2 时使用 baseBackoffSeconds * 2^1 = baseBackoffSeconds * 2
	attemptPower := max(jobCheck.Attempts, 1)
	backoff := float64(baseBackoffSeconds) * math.Pow(2, float64(attemptPower-1))
	jitter := backoff * jitterFactor * (rand.Float64()*2 - 1)
	delaySeconds := math.Max(1, backoff+jitter)

	newAvailableAt := time.Now().Add(time.Duration(delaySeconds) * time.Second)

	updateSQL := `UPDATE job_queue 
	              SET lease_until = NULL, locked_by = NULL, available_at = ? 
				  WHERE id = ? AND locked_by = ?`

	res, err := tx.Exec(updateSQL, newAvailableAt, job.ID, job.LockedBy)
	if err != nil {
		return fmt.Errorf("failed to update job for nack: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected for nack: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("nack failed, lock might have been lost for job %d", job.ID)
	}

	// 更新历史记录，记录错误信息
	now := time.Now().UTC()
	historyUpdateSQL := `UPDATE job_history 
	                     SET result = ?,
	                         attempts = ?,
	                         processed_by = ?,
	                         started_at = COALESCE(started_at, ?)
	                     WHERE id = ?`

	_, err = tx.Exec(historyUpdateSQL,
		string(lastErrJSON),
		jobCheck.Attempts, // attempts 在 Dequeue 时已经 +1，所以这里使用当前值即可
		job.LockedBy,
		now, // 如果 started_at 为 NULL，则设置为当前时间
		job.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update job_history for nack: %w", err)
	}

	// 设置标记，表示已在事务中完成
	job.completedInTx = true

	return nil
}

// moveToDeadLetterInTx 在事务中移入死信队列
func (c *Client) moveToDeadLetterInTx(ctx context.Context, tx *xorm.Session, job *JobQueue, workerID *string, lastErrJSON []byte) error {
	// 更新历史记录，标记为死信
	now := time.Now().UTC()
	updateSQL := `UPDATE job_history 
	              SET result = ?,
	                  status_final = 'dead_letter',
	                  attempts = ?,
	                  processed_by = ?,
	                  started_at = COALESCE(started_at, ?),
	                  finished_at = ?
	              WHERE id = ?`

	_, err := tx.Exec(updateSQL,
		string(lastErrJSON),
		job.Attempts,
		workerID,
		now, // 如果 started_at 为 NULL，则设置为当前时间
		now, // finished_at
		job.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update job_history for dead letter: %w", err)
	}

	_, err = tx.ID(job.ID).Delete(&JobQueue{})
	if err != nil {
		return fmt.Errorf("failed to delete job from job_queue: %w", err)
	}

	return nil
}

// --- 5. Heartbeat ---

// Heartbeat 为一个长任务续租，防止其租约过期被其他 worker 抢占
func (c *Client) Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (bool, error) {
	newLeaseUntil := time.Now().Add(time.Duration(extendSeconds) * time.Second)

	// `lease_until > ?` 作为一个乐观锁，防止为一个已经过期的租约续期
	sql := `UPDATE job_queue SET lease_until = ?
	        WHERE id = ? AND locked_by = ? AND lease_until > ?`

	res, err := c.engine.Context(ctx).Exec(sql, newLeaseUntil, jobID, workerID, time.Now())
	if err != nil {
		return false, fmt.Errorf("heartbeat update failed: %w", err)
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("failed to get rows affected for heartbeat: %w", err)
	}

	return affected > 0, nil
}

// --- 6. RecoverExpiredLeases (运维API) ---

// RecoverExpiredLeases 清理并释放已过期的租约，使其可被重新调度
func (c *Client) RecoverExpiredLeases(ctx context.Context, limit int) (int64, error) {
	if limit <= 0 {
		limit = 1000 // 默认值
	}

	// 使用 JOIN 方式，兼容 PostgreSQL、MySQL 和 SQLite
	// MySQL 不支持在 IN 子查询中使用 LIMIT，所以使用 JOIN
	sql := `UPDATE job_queue j1
	        INNER JOIN (
				SELECT id FROM job_queue 
				WHERE lease_until IS NOT NULL AND lease_until <= ?
				LIMIT ?
			) j2 ON j1.id = j2.id
			SET j1.lease_until = NULL, j1.locked_by = NULL`

	res, err := c.engine.Context(ctx).Exec(sql, time.Now(), limit)
	if err != nil {
		return 0, fmt.Errorf("failed to recover expired leases: %w", err)
	}

	return res.RowsAffected()
}

// --- 7. MoveToDeadLetterByID (运维API) ---

// moveToDeadLetter 是一个辅助函数，用于将任务移至历史表并标记为'dead_letter'
func (c *Client) moveToDeadLetter(ctx context.Context, session *xorm.Session, job *JobQueue, workerID string, errJSON []byte) error {
	if session == nil {
		return fmt.Errorf("session is nil")
	}

	// 在内部事务中完成
	err := session.Begin()
	if err != nil {
		return fmt.Errorf("moveToDeadLetter transaction failed: %w", err)
	}

	defer session.Close()

	// 更新历史记录，标记为死信
	// 如果 history 不存在（旧版本任务），则插入
	now := time.Now().UTC()
	updateSQL := `UPDATE job_history 
	              SET result = ?,
	                  status_final = 'dead_letter',
	                  attempts = ?,
	                  processed_by = ?,
	                  started_at = COALESCE(started_at, ?),
	                  finished_at = ?
	              WHERE id = ?`

	res, err := session.Exec(updateSQL,
		string(errJSON),
		job.Attempts,
		&workerID,
		now, // 如果 started_at 为 NULL，则设置为当前时间
		now, // finished_at
		job.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update job_history for dead letter: %w", err)
	}

	// 如果更新没有影响任何行，说明 history 不存在，需要插入（兼容旧版本任务）
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if affected == 0 {
		// History 不存在，插入新记录（兼容旧版本任务）
		history := JobHistory{
			ID:          job.ID,
			QueueName:   job.QueueName,
			Priority:    job.Priority,
			UniqueKey:   job.UniqueKey,
			Payload:     job.Payload,
			Result:      string(errJSON),
			StatusFinal: "dead_letter",
			Attempts:    job.Attempts,
			ProcessedBy: &workerID,
			CreatedAt:   job.CreatedAt,
			StartedAt:   nil,
			FinishedAt:  &now,
		}
		_, err = session.Insert(&history)
		if err != nil {
			return fmt.Errorf("failed to insert into job_history for dead letter: %w", err)
		}
	}

	_, err = session.ID(job.ID).Delete(&JobQueue{})
	if err != nil {
		return fmt.Errorf("failed to delete dead letter job from job_queue: %w", err)
	}

	err = session.Commit()
	if err != nil {
		return fmt.Errorf("move to dead letter commit failed: %w", err)
	}

	return nil
}

// MoveToDeadLetterByID 手动将一个任务移入死信队列
func (c *Client) MoveToDeadLetterByID(ctx context.Context, jobID int64, reasonJSON []byte) error {
	var job JobQueue
	session := c.engine.NewSession().Context(ctx)

	has, err := session.ID(jobID).Get(&job)
	if err != nil {
		return fmt.Errorf("failed to find job %d: %w", jobID, err)
	}
	if !has {
		return fmt.Errorf("job %d not found", jobID)
	}

	// 调用内部的移动逻辑
	return c.moveToDeadLetter(ctx, session, &job, "manual_operator", reasonJSON)
}
