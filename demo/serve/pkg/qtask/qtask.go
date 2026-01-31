package qtask

import (
	"container/heap"
	"context"
	"fmt"
	"math"
	"math/rand"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sirupsen/logrus"
)

// ==========================================
// 1. 定义任务结构与 Priority Queue (Heap)
// ==========================================

// Task 代表队列中的一个任务
type Task struct {
	Key        string      `json:"key"`         // UniqueKey
	Payload    interface{} `json:"payload"`     // 实际数据
	RetryCount int         `json:"retry_count"` // 当前重试次数
	NextRun    time.Time   `json:"next_run"`    // 下一次执行时间
	index      int         `json:"-"`           // heap中的索引，用于可能的堆操作（可选，此处用于优化）
}

// TaskInfo 提供给 worker 函数的只读任务信息
type TaskInfo struct {
	Key        string      // 任务唯一标识
	Payload    interface{} // 任务数据
	RetryCount int         // 当前重试次数（只读）
	NextRun    time.Time   // 下次执行时间（只读）
}

// TaskHeap 实现了 heap.Interface，用于按时间排序
type TaskHeap []*Task

func (h TaskHeap) Len() int           { return len(h) }
func (h TaskHeap) Less(i, j int) bool { return h[i].NextRun.Before(h[j].NextRun) } // 最小堆，时间早的在前
func (h TaskHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].index = i
	h[j].index = j
}
func (h *TaskHeap) Push(x interface{}) {
	n := len(*h)
	item := x.(*Task)
	item.index = n
	*h = append(*h, item)
}
func (h *TaskHeap) Pop() interface{} {
	old := *h
	n := len(old)
	item := old[n-1]
	old[n-1] = nil  // 避免内存泄漏
	item.index = -1 // 标记为已移除
	*h = old[0 : n-1]
	return item
}

// ==========================================
// 2. Queue Manager 定义
// ==========================================

// WorkerFunc 自定义执行函数。返回 error 表示失败需要重试
// info 是只读的任务信息副本，避免并发安全问题
type WorkerFunc func(ctx context.Context, info *TaskInfo) error

// RetryStrategy 定义重试后退策略
type RetryStrategy int

const (
	// RetryStrategyExponentialBackoff 指数退避（保持现有默认行为）
	RetryStrategyExponentialBackoff RetryStrategy = iota
	// RetryStrategyFixedInterval 固定间隔重试（无 jitter）
	RetryStrategyFixedInterval
)

type MemoryQueueOption func(*MemoryQueue)

// WithExponentialBackoff 启用指数退避（包含 jitter），并设置 baseBackoff。
// base<=0 将等价于立即重试（NextRun=now）。
func WithExponentialBackoff(base time.Duration) MemoryQueueOption {
	return func(mq *MemoryQueue) {
		mq.retryStrategy = RetryStrategyExponentialBackoff
		mq.baseBackoff = base
	}
}

// WithRetryStrategy 设置重试后退策略（仅在 NewMemoryQueue 创建时生效）。
func WithRetryStrategy(strategy RetryStrategy) MemoryQueueOption {
	return func(mq *MemoryQueue) {
		mq.retryStrategy = strategy
	}
}

// WithFixedIntervalRetry 启用固定间隔重试（无 jitter），并设置 interval。
// interval<=0 将等价于立即重试（NextRun=now）。
func WithFixedIntervalRetry(interval time.Duration) MemoryQueueOption {
	return func(mq *MemoryQueue) {
		mq.retryStrategy = RetryStrategyFixedInterval
		mq.fixedInterval = interval
	}
}

type MemoryQueue struct {
	mu          sync.RWMutex
	tasksMap    map[string]*Task // 用于去重和快速查找
	taskQueue   TaskHeap         // 用于调度
	workerFunc  WorkerFunc
	workerCount int
	maxRetries  int
	baseBackoff time.Duration
	// retryStrategy 控制失败后的下一次调度时间计算方式
	retryStrategy RetryStrategy
	// fixedInterval 为固定间隔重试策略的间隔时间
	fixedInterval time.Duration
	xlog          *logrus.Entry
	rng           *rand.Rand
	queueName     string

	// 内部通信
	readySignal chan struct{} // 当有新任务加入时通知调度器
	stopCh      chan struct{}
	wg          sync.WaitGroup

	// 统计信息
	stats struct {
		processed atomic.Int64
		failed    atomic.Int64
		success   atomic.Int64
	}
}

// NewMemoryQueue 初始化队列
func NewMemoryQueue(logger *logrus.Entry, queueName string, workerCount int, maxRetries int, fn WorkerFunc, opts ...MemoryQueueOption) *MemoryQueue {
	mq := &MemoryQueue{
		tasksMap:    make(map[string]*Task),
		taskQueue:   make(TaskHeap, 0),
		workerFunc:  fn,
		queueName:   queueName,
		workerCount: workerCount,
		maxRetries:  maxRetries,
		baseBackoff: 0,
		// 默认保持现有行为：指数退避 + jitter
		retryStrategy: RetryStrategyExponentialBackoff,
		fixedInterval: 0,
		readySignal:   make(chan struct{}, 1), // 缓冲1避免阻塞
		stopCh:        make(chan struct{}),
		xlog:          logger,
		rng:           rand.New(rand.NewSource(time.Now().UnixNano())),
	}
	for _, opt := range opts {
		if opt != nil {
			opt(mq)
		}
	}
	heap.Init(&mq.taskQueue)
	return mq
}

// ==========================================
// 3. 核心逻辑: 增、删、调度
// ==========================================

// Add 插入任务。支持根据 UniqueKey 去重。
func (mq *MemoryQueue) Add(key string, payload interface{}) error {
	mq.mu.Lock()
	defer mq.mu.Unlock()

	// 1. 去重检测
	if _, exists := mq.tasksMap[key]; exists {
		return fmt.Errorf("task with key %s already exists in %s", key, mq.queueName)
	}

	// 2. 创建任务
	task := &Task{
		Key:        key,
		Payload:    payload,
		RetryCount: 0,
		NextRun:    time.Now(), // 立即执行
	}

	// 3. 存入 Map 和 Heap
	mq.tasksMap[key] = task
	heap.Push(&mq.taskQueue, task)

	// 4. 通知调度器
	mq.notifyDispatcher()
	return nil
}

// Remove 根据 key 删除任务
func (mq *MemoryQueue) Remove(key string) {
	logger := mq.xlog.WithField("reqid", key).WithField("queue", mq.queueName)

	mq.mu.Lock()
	defer mq.mu.Unlock()

	if task, exists := mq.tasksMap[key]; exists {
		// 从 Heap 中移除
		// 注意：heap.Remove 时间复杂度为 O(log n)，需要维护 index
		if task.index != -1 {
			heap.Remove(&mq.taskQueue, task.index)
		}
		delete(mq.tasksMap, key)
		logger.Infof("[Remove] Task %s removed manually in %s.", key, mq.queueName)
	}
}

// notifyDispatcher 非阻塞发送信号
func (mq *MemoryQueue) notifyDispatcher() {
	select {
	case mq.readySignal <- struct{}{}:
	default:
	}
}

// Start 启动 Worker Pool 和 调度器
func (mq *MemoryQueue) Start(ctx context.Context) {
	// 启动 Worker Pool
	// 这里使用一个带缓冲的 channel 作为任务传递管道
	jobChan := make(chan *Task, mq.workerCount)

	for i := 0; i < mq.workerCount; i++ {
		mq.wg.Add(1)
		go mq.workerLoop(ctx, i, jobChan)
	}

	// 启动 Dispatcher (调度器)
	mq.wg.Add(1)
	go mq.dispatcherLoop(ctx, jobChan)
}

// Stop 优雅停止
func (mq *MemoryQueue) Stop() {
	close(mq.stopCh)
	mq.wg.Wait()
}

// ==========================================
// 4. 调度器与 Worker 实现
// ==========================================

// dispatcherLoop 负责从堆中取出到期的任务发送给 worker
func (mq *MemoryQueue) dispatcherLoop(ctx context.Context, jobChan chan<- *Task) {
	defer mq.wg.Done()
	defer close(jobChan)
	defer func() {
		if r := recover(); r != nil {
			mq.xlog.WithFields(logrus.Fields{
				"panic": r,
			}).Errorf("[Queue] dispatcherLoop panic recovered, dispatcher stopped\n%s", string(debug.Stack()))
		}
	}()

	timer := time.NewTimer(0)
	if !timer.Stop() {
		<-timer.C
	}

	for {
		var now time.Time
		var nextTask *Task
		var delay time.Duration

		mq.mu.Lock()
		if mq.taskQueue.Len() > 0 {
			// Peek 堆顶任务
			task := mq.taskQueue[0]
			now = time.Now()
			if task.NextRun.Before(now) || task.NextRun.Equal(now) {
				// 任务已到期，弹出
				nextTask = heap.Pop(&mq.taskQueue).(*Task)
			} else {
				// 任务未到期，计算等待时间
				delay = task.NextRun.Sub(now)
			}
		}
		mq.mu.Unlock()

		if nextTask != nil {
			// 有任务要执行，发送给 Worker
			select {
			case jobChan <- nextTask:
				// 发送成功
			case <-ctx.Done():
				return
			case <-mq.stopCh:
				return
			}
			continue // 继续检查下一个
		}

		// 如果没有可执行任务，或者任务还需要等待
		if delay == 0 {
			delay = time.Hour // 如果队列空了，设置一个长等待，依靠 readySignal 唤醒
		}

		timer.Reset(delay)

		select {
		case <-mq.readySignal: // 有新任务加入，立即唤醒
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
		case <-timer.C: // 等待时间到
		case <-ctx.Done():
			return
		case <-mq.stopCh:
			return
		}
	}
}

// workerLoop 消费者
func (mq *MemoryQueue) workerLoop(ctx context.Context, id int, jobChan <-chan *Task) {
	defer mq.wg.Done()

	for task := range jobChan {
		// 再次检查任务是否已被删除 (Double Check)
		mq.mu.RLock()
		if _, exists := mq.tasksMap[task.Key]; !exists {
			mq.mu.RUnlock()
			continue
		}
		// 创建只读副本，避免并发安全问题
		info := &TaskInfo{
			Key:        task.Key,
			Payload:    task.Payload,
			RetryCount: task.RetryCount,
			NextRun:    task.NextRun,
		}
		mq.mu.RUnlock()

		mq.stats.processed.Add(1)
		// 执行用户自定义函数
		err := mq.callWorkerSafely(ctx, id, task.Key, info)

		if err == nil {
			// --- 成功 ---
			mq.stats.success.Add(1)
			mq.mu.Lock()
			delete(mq.tasksMap, task.Key) // 任务完成，彻底移除
			mq.mu.Unlock()
			// fmt.Printf("[Worker %d] Task %s success.\n", id, task.Key)
			logger := mq.xlog.WithField("reqid", task.Key)
			logger.Warnf("[Queue] Task %s success. Retrying %d/%d in %s.", task.Key, task.RetryCount, mq.maxRetries, mq.queueName)
		} else {
			// --- 失败，处理重试 ---
			mq.stats.failed.Add(1)
			mq.handleRetry(task, err)
		}
	}
}

func (mq *MemoryQueue) callWorkerSafely(ctx context.Context, workerID int, taskKey string, info *TaskInfo) (err error) {
	defer func() {
		if r := recover(); r != nil {
			mq.xlog.WithFields(logrus.Fields{
				"reqid":     taskKey,
				"worker_id": workerID,
				"panic":     r,
			}).Errorf("[Queue] worker panic recovered in %s\n%s", mq.queueName, string(debug.Stack()))
			err = fmt.Errorf("worker panic: %v", r)
		}
	}()
	return mq.workerFunc(ctx, info)
}

// handleRetry 处理指数退避重试逻辑
func (mq *MemoryQueue) handleRetry(task *Task, err error) {
	logger := mq.xlog.WithField("reqid", task.Key)

	mq.mu.Lock()
	defer mq.mu.Unlock()

	// 再次确认任务未被手动删除
	if _, exists := mq.tasksMap[task.Key]; !exists {
		return
	}

	if task.RetryCount >= mq.maxRetries {
		// 超过最大重试次数，删除任务
		logger.Warnf("[Queue] Task %s reached max retries (%d). Dropping. Last Err: %v", task.Key, mq.maxRetries, err)
		delete(mq.tasksMap, task.Key)
		return
	}

	var backoff time.Duration
	switch mq.retryStrategy {
	case RetryStrategyFixedInterval:
		// 固定间隔重试（无 jitter）
		backoff = mq.fixedInterval
		if backoff < 0 {
			backoff = 0
		}
	case RetryStrategyExponentialBackoff:
		fallthrough
	default:
		// 计算指数退避时间: base * 2^retry
		expBackoff := mq.baseBackoff * time.Duration(math.Pow(2, float64(task.RetryCount)))
		// jitter: 在指数退避基础上增加随机抖动，避免同一时刻集中重试（thundering herd）
		// 这里采用“正向 jitter”，范围为 [0, expBackoff/2)，保证不小于原有 backoff。
		var jitter time.Duration
		if expBackoff > 0 {
			jitterRange := expBackoff / 2
			if jitterRange > 0 {
				jitter = time.Duration(mq.rng.Int63n(int64(jitterRange)))
			}
		}
		backoff = expBackoff + jitter
	}
	task.RetryCount++
	task.NextRun = time.Now().Add(backoff)

	logger.Warnf("[Queue] Task %s failed (%v). Retrying %d/%d in %v", task.Key, err, task.RetryCount, mq.maxRetries, backoff)

	// 重新推回堆中等待调度
	heap.Push(&mq.taskQueue, task)

	// [Fix] 必须通知 Dispatcher，因为此时 Dispatcher 可能因为队列空了正在长休眠 (time.Hour)。
	// 如果不通知，它不会知道有一个新的（重试）任务进来了，也不会重置 Timer。
	mq.notifyDispatcher()
}

// ==========================================
// 5. 查询与统计
// ==========================================

// Snapshot 返回当前任务列表快照
func (mq *MemoryQueue) GetTasks() []string {
	mq.mu.RLock()
	defer mq.mu.RUnlock()
	keys := make([]string, 0, len(mq.tasksMap))
	for k := range mq.tasksMap {
		keys = append(keys, k)
	}
	return keys
}

func (mq *MemoryQueue) GetPendingCount() int {
	mq.mu.RLock()
	defer mq.mu.RUnlock()
	return len(mq.tasksMap)
}

// Stats 返回统计信息
func (mq *MemoryQueue) Stats() string {
	mq.mu.RLock()
	pending := len(mq.tasksMap)
	mq.mu.RUnlock()

	return fmt.Sprintf(
		"Pending: %d | Processed: %d | Success: %d | Failed: %d",
		pending,
		mq.stats.processed.Load(),
		mq.stats.success.Load(),
		mq.stats.failed.Load(),
	)
}

type Info struct {
	Processed int        `json:"processed"` // 已处理的任务数
	Pending   int        `json:"pending"`   // 待处理的任务数
	Success   int        `json:"success"`   // 成功的任务数
	Failed    int        `json:"failed"`    // 失败的任务数
	Tasks     []TaskInfo `json:"tasks"`     // 当前任务的ID列表
}

func (mq *MemoryQueue) StatsInfo() *Info {
	mq.mu.RLock()
	defer mq.mu.RUnlock()

	totalPending := len(mq.tasksMap)

	// 1. 确定返回数量，最多 100 条
	limit := 100
	if totalPending < limit {
		limit = totalPending
	}

	// 2. 预分配容量，避免循环中频繁扩容
	taskInfos := make([]TaskInfo, 0, limit)

	count := 0
	for _, v := range mq.tasksMap {
		// 3. 达到 100 条则停止
		if count >= limit {
			break
		}

		taskInfos = append(taskInfos, TaskInfo{
			Key:        v.Key,
			Payload:    v.Payload, // 注意：Payload 依然是引用，确保业务层不修改它
			RetryCount: v.RetryCount,
			NextRun:    v.NextRun,
		})
		count++
	}

	return &Info{
		Pending:   totalPending,
		Processed: int(mq.stats.processed.Load()),
		Success:   int(mq.stats.success.Load()),
		Failed:    int(mq.stats.failed.Load()),
		Tasks:     taskInfos,
	}

}
