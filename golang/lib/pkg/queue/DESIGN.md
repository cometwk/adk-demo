# Queue 设计的方案（最终版）

## 设计目标

参考 River Queue 的设计思路，实现在事务中完成任务的确认，确保业务数据和任务状态在同一事务中提交。



这是一个分布式任务队列的 Worker 实现，采用主从架构设计：主循环负责任务调度、心跳和结果处理，多个 worker goroutine 负责实际任务执行。

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Worker 主结构                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   DB接口     │  │   Options    │  │  JobHandler  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │         dispatchLoop (主循环)         │
        │  ┌──────────┐  ┌──────────┐           │
        │  │ 拉取任务 │  │  心跳    │           │
        │  │ 定时器   │  │ 定时器   │           │
        │  └──────────┘  └──────────┘           │
        └───────────┬──────────────┬────────────┘
                    │              │
                    ▼              ▼
        ┌───────────────────┐  ┌───────────────┐
        │    execCh         │  │   resultCh    │
        │  (任务分发通道)   │  │  (结果通道)   │
        └───────────┬───────┘  └───────┬───────┘
                    │                  │
        ┌───────────┴──────────┐       │
        │                      │       │
        ▼                      ▼       ▼
┌──────────────┐      ┌──────────────┐
│ workerLoop 1 │      │ workerLoop N │
│  (执行任务)  │ ...  │  (执行任务)  │
└──────────────┘      └──────────────┘
```

## 核心设计

### 1. Job 结构独立定义

```go
type Job struct {
    ...
	
	// 标记是否已在事务中完成（不序列化）
	completedInTx bool
}
```

**说明**：
- 添加 `completedInTx` 字段用于标记是否已在事务中完成

### 2. JobHandler 接口（事务模式）

**新的 JobHandler 接口：**
```go
type JobHandler func(ctx context.Context, job *Job) (result any, err error)
```

**特点**：
- 直接传递 `*Job` 对象，包含所有任务信息
- 用户需要自己创建事务，并在事务中调用 `Ack` 或 `Nack`

### 3. DB 接口扩展

```go
type DB interface {
	Dequeue(ctx context.Context, req DequeueRequest) (*Job, error)
	
	// 事务模式的方法（主要使用）
	Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error
	Nack(ctx context.Context, tx *xorm.Session, job *Job, baseBackoffSeconds int, jitter float64, lastErrJSON []byte) error
	
	Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (bool, error)
}
```

## 完整实现方案

### 1. 定义 Job 结构

```go
// Job 独立结构
type Job struct {
	ID          int64      `xorm:"'id' pk autoincr"`
	QueueName   string     `xorm:"'queue_name' VARCHAR(191) NOT NULL DEFAULT 'default'"`
	Priority    int        `xorm:"'priority' INT NOT NULL DEFAULT 0"`
	UniqueKey   *string    `xorm:"'unique_key' VARCHAR(191) NULL"`
	Payload     string     `xorm:"'payload' JSON NOT NULL"`
	Attempts    int        `xorm:"'attempts' INT NOT NULL DEFAULT 0"`
	MaxAttempts int        `xorm:"'max_attempts' INT NOT NULL DEFAULT 5"`
	AvailableAt time.Time  `xorm:"'available_at' TIMESTAMP(6) NOT NULL"`
	LeaseUntil  *time.Time `xorm:"'lease_until' TIMESTAMP(6) NULL"`
	LockedBy    *string    `xorm:"'locked_by' VARCHAR(191) NULL"`
	CreatedAt   time.Time  `xorm:"created TIMESTAMP(6) NOT NULL"`
	UpdatedAt   time.Time  `xorm:"updated TIMESTAMP(6) NOT NULL"`
	
	// 运行时状态标记（不序列化）
	completedInTx bool `xorm:"-"`
}
```

**注意**：`completedInTx` 字段使用 `xorm:"-"` 标记，不序列化到数据库。

### 2. 扩展 DB 接口

```go
type DB interface {
	Dequeue(ctx context.Context, req DequeueRequest) (*Job, error)
	
	// 事务模式的方法（主要使用）
	Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error
	Nack(ctx context.Context, tx *xorm.Session, job *Job, baseBackoffSeconds int, jitter float64, lastErrJSON []byte) error
	
	Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (bool, error)
}
```

### 3. 实现 Ack 和 Nack 方法（事务模式）

```go
// Ack 在事务中完成任务（成功）
func (c *Client) Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error {
	// 检查任务状态
	var jobCheck JobQueue
	has, err := tx.Where("id = ? AND locked_by = ?", job.ID, job.LockedBy).Get(&jobCheck)
	if err != nil {
		return fmt.Errorf("failed to find job to ack: %w", err)
	}
	if !has {
		return fmt.Errorf("job %d not found or not locked by worker %s", job.ID, job.LockedBy)
	}

	// 插入历史记录
	history := JobHistory{
		ID:          job.ID,
		QueueName:   job.QueueName,
		Priority:    job.Priority,
		UniqueKey:   job.UniqueKey,
		Payload:     job.Payload,
		Result:      string(resultJSON),
		StatusFinal: "completed",
		Attempts:    job.Attempts,
		ProcessedBy:  job.LockedBy,
		CreatedAt:   job.CreatedAt,
		StartedAt:   &job.CreatedAt,
		FinishedAt:  time.Now(),
	}

	_, err = session.Insert(&history)
	if err != nil {
		return fmt.Errorf("failed to insert into job_history: %w", err)
	}

	// 删除任务
	_, err = session.ID(job.ID).Delete(&JobQueue{})
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
		return fmt.Errorf("job %d not found or not locked by worker %s", job.ID, job.LockedBy)
	}

	if jobCheck.Attempts >= jobCheck.MaxAttempts {
		// 达到最大次数，移入死信
		return c.moveToDeadLetterInTx(ctx, tx, &jobCheck, job.LockedBy, lastErrJSON)
	}

	// 计算指数退避 + 抖动
	backoff := float64(baseBackoffSeconds) * math.Pow(2, float64(jobCheck.Attempts-1))
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
	if affected, _ := res.RowsAffected(); affected == 0 {
		return fmt.Errorf("nack failed, lock might have been lost for job %d", job.ID)
	}

	// 设置标记，表示已在事务中完成
	job.completedInTx = true

	return nil
}

// moveToDeadLetterInTx 在事务中移入死信队列
func (c *Client) moveToDeadLetterInTx(ctx context.Context, tx *xorm.Session, job *JobQueue, workerID *string, lastErrJSON []byte) error {
	history := JobHistory{
		ID:          job.ID,
		QueueName:   job.QueueName,
		Priority:    job.Priority,
		UniqueKey:   job.UniqueKey,
		Payload:     job.Payload,
		Result:      string(lastErrJSON),
		StatusFinal: "dead_letter",
		Attempts:    job.Attempts,
		ProcessedBy: &workerID,
		CreatedAt:   job.CreatedAt,
		StartedAt:   &job.CreatedAt,
		FinishedAt:  time.Now(),
	}

	_, err := tx.Insert(&history)
	if err != nil {
		return fmt.Errorf("failed to insert into job_history: %w", err)
	}

	_, err = tx.ID(job.ID).Delete(&JobQueue{})
	if err != nil {
		return fmt.Errorf("failed to delete job from job_queue: %w", err)
	}

	return nil
}
```

### 4. 修改 Worker 结构

```go
type Worker struct {
	db     DB
	opts   Options
	handle JobHandler // 统一使用事务模式

	ctx    context.Context
	cancel context.CancelFunc

	execCh   chan *execItem
	resultCh chan *execDone // 保留，用于非事务模式的兜底（可选）

	mu       sync.Mutex
	inflight map[int64]*inflightMeta
	wg       sync.WaitGroup
}
```

### 5. 修改 workerLoop

```go
func (w *Worker) workerLoop() {
	defer w.wg.Done()

	for {
		select {
		case <-w.ctx.Done():
			return
		case item := <-w.execCh:
			if item == nil {
				return
			}
			job := item.job
			jobCtx := item.ctx

			// 执行用户函数（事务模式）
			var res any
			var err error
			func() {
				defer func() {
					if r := recover(); r != nil {
						err = fmt.Errorf("panic: %v", r)
					}
				}()
				
				// 用户需要自己创建 session
				// 用户可以在 Handler 内部创建事务
				res, err = w.handle(jobCtx, job)
			}()

			// 检查是否已在事务中完成
			if job.completedInTx {
				// 已在事务中处理，清理 inflight
				w.mu.Lock()
				if m := w.inflight[job.ID]; m != nil {
					m.cancel()
					delete(w.inflight, job.ID)
				}
				w.mu.Unlock()
				continue
			}

			// 如果没有在事务中完成，可能是用户没有调用 Ack/Nack
			// 这里可以记录日志或采取其他措施
			if err == nil {
				log.Printf("[worker] warning: job %d completed but not acked in transaction", job.ID)
			} else {
				log.Printf("[worker] warning: job %d failed but not nacked in transaction: %v", job.ID, err)
			}

			// 可选：作为兜底，发送到 resultCh（如果需要）
			// 但通常不应该到达这里，因为用户应该在事务中调用 Ack/Nack
		}
	}
}
```

**注意**：`workerLoop` 中需要处理用户没有在事务中调用 `Ack`/`Nack` 的情况。

### 6. 修改 Dequeue 方法

```go
// Dequeue 返回 *Job 而不是 *JobQueue
func (c *Client) Dequeue(ctx context.Context, req DequeueRequest) (*Job, error) {
	// ... 原有逻辑 ...
	
	// 将 JobQueue 转换为 Job
	job := &Job{
		ID:          jobQueue.ID,
		QueueName:   jobQueue.QueueName,
		Priority:    jobQueue.Priority,
		UniqueKey:   jobQueue.UniqueKey,
		Payload:     jobQueue.Payload,
		Attempts:    jobQueue.Attempts,
		MaxAttempts: jobQueue.MaxAttempts,
		AvailableAt: jobQueue.AvailableAt,
		LeaseUntil:  jobQueue.LeaseUntil,
		LockedBy:    jobQueue.LockedBy,
		CreatedAt:   jobQueue.CreatedAt,
		UpdatedAt:   jobQueue.UpdatedAt,
		completedInTx: false, // 初始化标记
	}
	
	return job, nil
}
```

## 用户使用示例

### 基本使用

```go
// 创建 Handler（事务模式）
handler := func(ctx context.Context, job *queue.Job) (any, error) {
	// 1. 用户自己创建事务
	engine := getEngine()
	session := engine.NewSession()
	err := session.Begin()
	if err != nil {
		return nil, err
	}
	defer session.Close()
	
	// 2. 解析 payload
	var payload TaskPayload
	json.Unmarshal([]byte(job.Payload), &payload)
	
	// 3. 执行业务逻辑
	err = doBusinessLogic(session, payload)
	if err != nil {
		session.Rollback()
		return nil, err
	}
	
	// 4. 在同一个事务中完成任务（类似 River Queue）
	resultJSON, _ := json.Marshal(map[string]any{"ok": true})
	err = client.Ack(ctx, session, job, resultJSON)
	if err != nil {
		session.Rollback()
		return nil, err
	}
	
	// 5. 提交事务（包含业务数据和任务完成）
	err = session.Commit()
	if err != nil {
		return nil, err
	}
	
	return map[string]any{"ok": true}, nil
}
```

### 错误处理示例

```go
handler := func(ctx context.Context, job *queue.Job) (any, error) {
	engine := getEngine()
	session := engine.NewSession()
	err := session.Begin()
	if err != nil {
		return nil, err
	}
	defer session.Close()
	
	// 执行业务逻辑
	err = doBusinessLogic(session, payload)
	if err != nil {
		// 在事务中报告错误
		errJSON, _ := json.Marshal(map[string]any{"error": err.Error()})
		nackErr := client.Nack(ctx, session, job, 2, 0.2, errJSON)
		if nackErr != nil {
			session.Rollback()
			return nil, nackErr
		}
		
		// 提交事务（包含业务数据和任务错误状态）
		session.Commit()
		return nil, err
	}
	
	// 成功情况
	resultJSON, _ := json.Marshal(map[string]any{"ok": true})
	err = client.Ack(ctx, session, job, resultJSON)
	if err != nil {
		session.Rollback()
		return nil, err
	}
	
	session.Commit()
	return map[string]any{"ok": true}, nil
}
```

## 需要调整的点总结

### ⚠️ 注意事项

1. **事务管理**：用户需要自己创建和管理事务
2. **错误处理**：确保 Ack/Nack 失败时回滚事务
3. **标记检查**：`workerLoop` 需要检查 `completedInTx` 标记
4. **兜底机制**：考虑用户没有调用 Ack/Nack 的情况

## 总结

这个方案的特点：

1. **Job 结构独立**：不再是 JobQueue 的别名
2. **统一事务模式**：不保持向后兼容，统一使用事务模式
3. **方法名一致**：使用 `Ack` 和 `Nack`，保持与原有命名一致
4. **状态标记**：使用 `Job.completedInTx` 字段标记是否已在事务中完成
5. **参考 River Queue**：设计思路参考 River Queue，但方法名保持与原有一致

这个方案简洁、清晰，完全满足在事务中完成任务的确认需求。
