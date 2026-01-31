package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/cometwk/lib/pkg/orm"
	"xorm.io/xorm"
)

type (
	// JobHandler 在事务中执行任务
	JobHandler func(ctx context.Context, job *Job) (result any, err error)

	DB interface {
		Dequeue(ctx context.Context, req DequeueRequest) (*Job, error)
		// 事务模式的方法（主要使用）
		Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error
		Nack(ctx context.Context, tx *xorm.Session, job *Job, baseBackoffSeconds int, jitter float64, lastErrJSON []byte) error
		Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (bool, error)
	}

	Options struct {
		Queues          []string
		WorkerID        string
		Concurrency     int           // 子协程池大小, 默认16
		LeaseSeconds    int           // 每次租约时长, 默认30
		HeartbeatEvery  time.Duration // 心跳扫描周期（建议 LeaseSeconds 的 1/3~1/2）, 默认12s
		DequeueEvery    time.Duration // 拉取周期（有余量时才会拉）, 默认100ms
		ShutdownTimeout time.Duration // 优雅退出时最长等待, 默认15s
		BaseBackoffSec  int           // Nack 退避基础秒, 默认2
		Jitter          float64       // 抖动比例 0.2 表示±20%, 默认0.2
	}

	Worker struct {
		db     DB
		opts   Options
		handle JobHandler

		ctx    context.Context
		cancel context.CancelFunc

		// 调度通道
		execCh   chan *execItem // 主 -> worker
		resultCh chan *execDone // worker -> 主

		// inflight 追踪
		mu       sync.Mutex
		inflight map[int64]*inflightMeta
		wg       sync.WaitGroup
	}

	// execItem 携带由主循环创建的 context
	execItem struct {
		job *Job
		ctx context.Context
	}

	execDone struct {
		jobID  int64
		result []byte
		err    error
	}

	inflightMeta struct {
		jobID    int64
		startAt  time.Time
		lastBeat time.Time
		cancel   context.CancelFunc
	}
)

var _ DB = &Client{}

func NewWorker(db DB, opts Options, handler JobHandler) *Worker {
	if opts.Concurrency <= 0 {
		opts.Concurrency = 16
	}
	if opts.LeaseSeconds <= 0 {
		opts.LeaseSeconds = 30
	}
	if opts.HeartbeatEvery <= 0 {
		opts.HeartbeatEvery = time.Duration((opts.LeaseSeconds*4)/10) * time.Second
	}
	if opts.DequeueEvery <= 0 {
		opts.DequeueEvery = 100 * time.Millisecond
	}
	ctx, cancel := context.WithCancel(context.Background())
	// 将 worker ID 作为 reqid 设置到 context 中, 用于数据库打印日志
	ctx = orm.WithReqID(ctx, opts.WorkerID)
	return &Worker{
		db:       db,
		opts:     opts,
		handle:   handler,
		ctx:      ctx,
		cancel:   cancel,
		execCh:   make(chan *execItem, opts.Concurrency),
		resultCh: make(chan *execDone, opts.Concurrency), // 缓冲大小与 Concurrency 相同即可
		inflight: make(map[int64]*inflightMeta),
	}
}

func (w *Worker) Start() {
	// 启动固定大小的 worker 池
	for i := 0; i < w.opts.Concurrency; i++ {
		w.wg.Add(1)
		go w.workerLoop()
	}

	// 主调度循环
	w.wg.Add(1)
	go w.dispatchLoop()
}

func (w *Worker) Stop() {
	// 停止拉取 + 进入优雅关停
	w.cancel()

	done := make(chan struct{})
	go func() {
		w.wg.Wait()
		close(done)
	}()

	timeout := w.opts.ShutdownTimeout
	if timeout == 0 {
		timeout = 15 * time.Second
	}
	select {
	case <-done:
	case <-time.After(timeout):
		log.Printf("[worker] shutdown timed out; forcing exit")
	}
}

func (w *Worker) dispatchLoop() {
	defer w.wg.Done()

	hbTicker := time.NewTicker(w.opts.HeartbeatEvery)
	defer hbTicker.Stop()

	deqTicker := time.NewTicker(w.opts.DequeueEvery)
	defer deqTicker.Stop()

	req := DequeueRequest{
		Queues:       w.opts.Queues,
		LeaseSeconds: w.opts.LeaseSeconds,
		WorkerID:     w.opts.WorkerID,
	}

	for {
		select {
		case <-w.ctx.Done():
			w.drainAndCancelInflight()
			return

		case <-hbTicker.C:
			w.doHeartbeats()

		case <-deqTicker.C:
			// 【修改】移除此处的并发检查，逻辑已移入 tryDequeueAndDispatch，使其更具原子性
			w.tryDequeueAndDispatch(req)

		case d := <-w.resultCh:
			// 收到 worker 执行完的结果（兜底情况）
			// 正常情况下，任务应该在事务中完成，这里只是兜底
			w.onExecDone(d)
		}
	}
}

// workerLoop 执行用户函数（事务模式）
func (w *Worker) workerLoop() {
	defer w.wg.Done()

	for {
		select {
		case <-w.ctx.Done():
			return
		case item := <-w.execCh:
			if item == nil {
				// 理论上不会发生，除非 Start/Stop 逻辑改变
				return
			}
			job := item.job
			jobCtx := item.ctx

			// 执行用户函数（事务模式）
			// 注意：用户需要自己创建事务，并在事务中调用 Ack 或 Nack
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
			var resultJSON []byte
			if err == nil {
				resultJSON, _ = json.Marshal(map[string]any{
					"ok":     true,
					"result": res,
				})
			} else {
				resultJSON, _ = json.Marshal(map[string]any{
					"ok":    false,
					"error": err.Error(),
				})
			}

			select {
			case w.resultCh <- &execDone{jobID: job.ID, result: resultJSON, err: err}:
			case <-w.ctx.Done():
				// Worker 正在关闭，结果可能无法发送。
				// 这是可接受的，因为任务会因心跳停止而最终超时并由其他 worker 处理。
				return
			}
		}
	}
}

// 【修改】重构此函数以修复竞态条件
func (w *Worker) tryDequeueAndDispatch(req DequeueRequest) {
	// 1. 【前置检查】在进行 DB 调用前，快速检查容量。
	// 这是一种优化，避免在 worker 已满时进行不必要的数据库查询。
	if w.inflightCount() >= w.opts.Concurrency {
		return
	}

	// 2. 从数据库拉取任务
	ctx, cancel := context.WithTimeout(w.ctx, 3*time.Second)
	defer cancel()

	// 设置不打印 SQL 日志, 避免日志风暴
	ctx = orm.WithReqID(ctx, orm.SKIP_LOG_SQL)

	job, err := w.db.Dequeue(ctx, req)
	if err != nil {
		// 常见：无任务时返回 nil,nil 或特定 ErrNoJob；这里简单忽略错误/空
		return
	}
	if job == nil {
		return
	}

	// 3. 为任务创建独立的上下文和元数据
	jobCtx, jobCancel := context.WithCancel(w.ctx)
	meta := &inflightMeta{
		jobID:    job.ID,
		startAt:  time.Now(),
		lastBeat: time.Now(),
		cancel:   jobCancel,
	}

	// 4. 【核心修复】加锁，进行最终的容量检查并原子性地注册 inflight 状态
	w.mu.Lock()
	if len(w.inflight) >= w.opts.Concurrency {
		w.mu.Unlock()
		// 这是一个边缘情况：在前置检查和当前之间，worker 池已满。
		// 由于我们已经注册了 inflight，任务会被分发，但可能因为容量问题无法处理
		// 这种情况下，任务会通过心跳机制超时，或者等待 worker 有空闲
		// 暂时不处理，让任务正常分发
		jobCancel()
		// 注意：这里不立即 Nack，因为任务已经在 inflight 中
		// 如果确实需要立即 Nack，需要 Worker 有 engine 引用，或者 DB 提供非事务模式的 Nack
		log.Printf("[worker] warning: worker capacity filled during dequeue for job %d", job.ID)
		return
	}
	// 注册成功，任务正式被接管
	w.inflight[job.ID] = meta
	w.mu.Unlock()

	// 5. 将任务和其上下文分发给子协程池
	select {
	case w.execCh <- &execItem{job: job, ctx: jobCtx}:
	case <-w.ctx.Done():
		// 如果 worker 在此时关闭，我们已经注册了 inflight，
		// drainAndCancelInflight 会负责取消它。
	}
}

func (w *Worker) doHeartbeats() {
	extend := w.opts.LeaseSeconds
	now := time.Now()

	// 快速复制一份 keys，避免长时间持锁，这是很好的实践
	w.mu.Lock()
	ids := make([]int64, 0, len(w.inflight))
	for jid := range w.inflight {
		ids = append(ids, jid)
	}
	w.mu.Unlock()

	for _, jid := range ids {
		select {
		case <-w.ctx.Done():
			return
		default:
		}
		ok, err := w.db.Heartbeat(w.ctx, jid, w.opts.WorkerID, extend)
		if err != nil {
			log.Printf("[worker] heartbeat err job=%d: %v", jid, err)
			continue
		}
		if !ok {
			// 续租失败（如锁丢失/租约过期），主动取消本地执行
			log.Printf("[worker] heartbeat not ok; cancel local job=%d", jid)
			w.mu.Lock()
			if m := w.inflight[jid]; m != nil {
				m.cancel()
				delete(w.inflight, jid)
			}
			w.mu.Unlock()
			continue
		}

		// 更新最后心跳时间
		w.mu.Lock()
		if m := w.inflight[jid]; m != nil {
			m.lastBeat = now
		}
		w.mu.Unlock()
	}
}

func (w *Worker) onExecDone(d *execDone) {
	// 兜底情况：如果任务没有在事务中完成，这里处理
	// 注意：由于我们移除了非事务模式的 Ack/Nack，这个方法现在主要用于记录日志
	// 实际使用时，应该确保任务在事务中完成
	if d.err == nil {
		log.Printf("[worker] warning: job %d completed but not acked in transaction (fallback)", d.jobID)
	} else {
		log.Printf("[worker] warning: job %d failed but not nacked in transaction (fallback): %v", d.jobID, d.err)
	}

	w.mu.Lock()
	if m := w.inflight[d.jobID]; m != nil {
		m.cancel() // 双保险：确保 jobCtx 被取消
		delete(w.inflight, d.jobID)
	}
	w.mu.Unlock()
}

// 注意：safeNack 已移除，因为现在使用事务模式
// 如果需要立即 Nack，需要在 Handler 中处理，或者 DB 提供非事务模式的 Nack

func (w *Worker) inflightCount() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.inflight)
}

func (w *Worker) drainAndCancelInflight() {
	w.mu.Lock()
	defer w.mu.Unlock()
	log.Printf("[worker] draining, cancelling %d inflight jobs", len(w.inflight))
	for _, m := range w.inflight {
		m.cancel()
	}
	// 清空 map 不是必须的，因为 worker 即将退出，但这是个好习惯
	w.inflight = make(map[int64]*inflightMeta)
}

/*
// 使用方式（示例）
db := NewClient(engine) // 你基于上面 SQL 的实现
handler := func(ctx context.Context, payload []byte) (any, error) {
	// 你的业务逻辑（尽量幂等）
	log.Printf("handling job, payload: %s", string(payload))
	// 可在 ctx.Done() 时尽快中断可重入操作
	select {
	case <-time.After(2 * time.Second):
		// 模拟工作
	case <-ctx.Done():
		log.Printf("job cancelled: %v", ctx.Err())
		return nil, ctx.Err()
	}
	return map[string]any{"echo": string(payload)}, nil
}

w := NewWorker(db, Options{
	Queues:          []string{"high", "default"},
	WorkerID:        "worker-1",
	Concurrency:     16,
	LeaseSeconds:    30,
	HeartbeatEvery:  12 * time.Second,
	DequeueEvery:    100 * time.Millisecond,
	BaseBackoffSec:  2,
	Jitter:          0.2,
	ShutdownTimeout: 20 * time.Second,
}, handler)

w.Start()
// ...
// 收到退出信号时：
w.Stop()
*/
