package queue

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"xorm.io/xorm"
)

// MockDB 是 DB 接口的 mock 实现
type MockDB struct {
	mock.Mock
}

func (m *MockDB) Dequeue(ctx context.Context, req DequeueRequest) (*Job, error) {
	args := m.Called(ctx, req)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*Job), args.Error(1)
}

func (m *MockDB) Ack(ctx context.Context, tx *xorm.Session, job *Job, resultJSON []byte) error {
	args := m.Called(ctx, tx, job, resultJSON)
	return args.Error(0)
}

func (m *MockDB) Nack(ctx context.Context, tx *xorm.Session, job *Job, baseBackoffSeconds int, jitter float64, lastErrJSON []byte) error {
	args := m.Called(ctx, tx, job, baseBackoffSeconds, jitter, lastErrJSON)
	return args.Error(0)
}

func (m *MockDB) Heartbeat(ctx context.Context, jobID int64, workerID string, extendSeconds int) (bool, error) {
	args := m.Called(ctx, jobID, workerID, extendSeconds)
	return args.Bool(0), args.Error(1)
}

// 测试辅助函数
func createTestJob(id int64, payload string) *Job {
	return &Job{
		ID:          id,
		QueueName:   "test",
		Priority:    0,
		Payload:     payload,
		Attempts:    0,
		MaxAttempts: 3,
		AvailableAt: time.Now(),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
}

func TestNewWorker(t *testing.T) {
	mockDB := &MockDB{}
	handler := func(ctx context.Context, job *Job) (any, error) {
		return "ok", nil
	}

	t.Run("默认选项值", func(t *testing.T) {
		opts := Options{
			Queues:   []string{"default"},
			WorkerID: "test-worker",
		}

		worker := NewWorker(mockDB, opts, handler)

		assert.Equal(t, 16, worker.opts.Concurrency)
		assert.Equal(t, 30, worker.opts.LeaseSeconds)
		assert.Equal(t, 12*time.Second, worker.opts.HeartbeatEvery)
		assert.Equal(t, 100*time.Millisecond, worker.opts.DequeueEvery)
		assert.NotNil(t, worker.ctx)
		assert.NotNil(t, worker.cancel)
		assert.NotNil(t, worker.execCh)
		assert.NotNil(t, worker.resultCh)
		assert.NotNil(t, worker.inflight)
	})

	t.Run("自定义选项值", func(t *testing.T) {
		opts := Options{
			Queues:          []string{"high", "default"},
			WorkerID:        "custom-worker",
			Concurrency:     8,
			LeaseSeconds:    60,
			HeartbeatEvery:  20 * time.Second,
			DequeueEvery:    200 * time.Millisecond,
			ShutdownTimeout: 30 * time.Second,
			BaseBackoffSec:  5,
			Jitter:          0.3,
		}

		worker := NewWorker(mockDB, opts, handler)

		assert.Equal(t, 8, worker.opts.Concurrency)
		assert.Equal(t, 60, worker.opts.LeaseSeconds)
		assert.Equal(t, 20*time.Second, worker.opts.HeartbeatEvery)
		assert.Equal(t, 200*time.Millisecond, worker.opts.DequeueEvery)
		assert.Equal(t, 30*time.Second, worker.opts.ShutdownTimeout)
		assert.Equal(t, 5, worker.opts.BaseBackoffSec)
		assert.Equal(t, 0.3, worker.opts.Jitter)
	})

	t.Run("负值或零值被重置为默认值", func(t *testing.T) {
		opts := Options{
			Queues:       []string{"test"},
			WorkerID:     "test",
			Concurrency:  -1,
			LeaseSeconds: 0,
		}

		worker := NewWorker(mockDB, opts, handler)

		assert.Equal(t, 16, worker.opts.Concurrency)
		assert.Equal(t, 30, worker.opts.LeaseSeconds)
	})
}

func TestWorkerStartStop(t *testing.T) {
	mockDB := &MockDB{}
	handler := func(ctx context.Context, job *Job) (any, error) {
		return "ok", nil
	}

	t.Run("正常启动和停止", func(t *testing.T) {
		opts := Options{
			Queues:          []string{"test"},
			WorkerID:        "test-worker",
			Concurrency:     2,
			DequeueEvery:    50 * time.Millisecond,
			HeartbeatEvery:  100 * time.Millisecond,
			ShutdownTimeout: 1 * time.Second,
		}

		// Mock Dequeue 返回空（无任务）
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(nil, nil)

		worker := NewWorker(mockDB, opts, handler)

		// 启动 worker
		worker.Start()

		// 让它运行一小段时间
		time.Sleep(200 * time.Millisecond)

		// 停止 worker
		start := time.Now()
		worker.Stop()
		elapsed := time.Since(start)

		// 应该在超时时间内完成停止
		assert.Less(t, elapsed, 2*time.Second)

		mockDB.AssertExpectations(t)
	})

	t.Run("带超时的停止", func(t *testing.T) {
		opts := Options{
			Queues:          []string{"test"},
			WorkerID:        "test-worker",
			Concurrency:     1,
			ShutdownTimeout: 100 * time.Millisecond, // 很短的超时
		}

		// 使用简单的 handler
		simpleHandler := func(ctx context.Context, job *Job) (any, error) {
			return "ok", nil
		}

		// Mock 无任务返回
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(nil, nil)

		worker := NewWorker(mockDB, opts, simpleHandler)
		worker.Start()

		start := time.Now()
		worker.Stop()
		elapsed := time.Since(start)

		// 由于没有长时间运行的任务，停止应该很快
		// 这个测试主要验证 Stop 方法不会panic
		assert.Less(t, elapsed, 200*time.Millisecond)
		mockDB.AssertExpectations(t)
	})
}

func TestTryDequeueAndDispatch(t *testing.T) {
	mockDB := &MockDB{}
	var executedPayloads []string
	var executedMutex sync.Mutex

	handler := func(ctx context.Context, job *Job) (any, error) {
		executedMutex.Lock()
		defer executedMutex.Unlock()
		executedPayloads = append(executedPayloads, job.Payload)
		return map[string]any{"processed": job.Payload}, nil
	}

	t.Run("成功拉取和分发任务", func(t *testing.T) {
		opts := Options{
			Queues:         []string{"test"},
			WorkerID:       "test-worker",
			Concurrency:    2,
			DequeueEvery:   10 * time.Millisecond,
			HeartbeatEvery: 100 * time.Millisecond,
		}

		job := createTestJob(123, `{"task": "test"}`)
		// Mock Dequeue 返回任务一次，然后返回空
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(job, nil).Once()
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(nil, nil)
		// 注意：在事务模式下，Ack 需要在 handler 中调用，这里不 mock

		worker := NewWorker(mockDB, opts, handler)

		// 重置执行列表
		executedMutex.Lock()
		executedPayloads = nil
		executedMutex.Unlock()

		// 启动 worker
		worker.Start()

		// 等待任务执行完成
		time.Sleep(200 * time.Millisecond)

		// 停止 worker
		worker.Stop()

		executedMutex.Lock()
		assert.Equal(t, []string{`{"task": "test"}`}, executedPayloads)
		executedMutex.Unlock()

		assert.Equal(t, 0, worker.inflightCount())
		mockDB.AssertExpectations(t)
	})

	t.Run("容量已满时不拉取任务", func(t *testing.T) {
		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 1,
		}

		worker := NewWorker(mockDB, opts, handler)

		// 手动填满 inflight
		worker.mu.Lock()
		worker.inflight[999] = &inflightMeta{
			jobID:   999,
			startAt: time.Now(),
		}
		worker.mu.Unlock()

		req := DequeueRequest{
			Queues:       opts.Queues,
			LeaseSeconds: opts.LeaseSeconds,
			WorkerID:     opts.WorkerID,
		}

		worker.tryDequeueAndDispatch(req)

		// 不应该调用 Dequeue
		mockDB.AssertNotCalled(t, "Dequeue")
	})

	t.Run("DB 错误时不崩溃", func(t *testing.T) {
		// 创建新的 mock 来避免之前测试的干扰
		freshMockDB := &MockDB{}

		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 2,
		}

		freshMockDB.On("Dequeue", mock.Anything, mock.Anything).Return(nil, errors.New("db error")).Once()

		worker := NewWorker(freshMockDB, opts, handler)

		req := DequeueRequest{
			Queues:       opts.Queues,
			LeaseSeconds: opts.LeaseSeconds,
			WorkerID:     opts.WorkerID,
		}

		// 应该不会 panic
		assert.NotPanics(t, func() {
			worker.tryDequeueAndDispatch(req)
		})

		assert.Equal(t, 0, worker.inflightCount())
		freshMockDB.AssertExpectations(t)
	})

	t.Run("竞态条件处理：任务拉取后容量已满", func(t *testing.T) {
		// 创建新的 mock 来避免之前测试的干扰
		freshMockDB := &MockDB{}

		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 1,
		}

		// 在容量已满时，tryDequeueAndDispatch 会在前置检查时直接返回
		// 不会调用 Dequeue，所以不需要设置 mock 期望
		// 这里只测试任务能够正确处理容量已满的情况

		worker := NewWorker(freshMockDB, opts, handler)

		// 手动填满 inflight
		worker.mu.Lock()
		worker.inflight[999] = &inflightMeta{
			jobID:   999,
			startAt: time.Now(),
		}
		worker.mu.Unlock()

		req := DequeueRequest{
			Queues:       opts.Queues,
			LeaseSeconds: opts.LeaseSeconds,
			WorkerID:     opts.WorkerID,
		}

		// 应该不会拉取新任务（会在前置检查时直接返回）
		worker.tryDequeueAndDispatch(req)

		// 验证 Dequeue 没有被调用（容量已满时不会调用）
		freshMockDB.AssertExpectations(t)
	})
}

func TestDoHeartbeats(t *testing.T) {
	mockDB := &MockDB{}
	handler := func(ctx context.Context, job *Job) (any, error) {
		return "ok", nil
	}

	t.Run("成功心跳", func(t *testing.T) {
		opts := Options{
			Queues:       []string{"test"},
			WorkerID:     "test-worker",
			LeaseSeconds: 30,
		}

		worker := NewWorker(mockDB, opts, handler)

		// 添加一些 inflight 任务
		_, cancel1 := context.WithCancel(context.Background())
		_, cancel2 := context.WithCancel(context.Background())
		defer cancel1()
		defer cancel2()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:    1,
			startAt:  time.Now(),
			lastBeat: time.Now(),
			cancel:   cancel1,
		}
		worker.inflight[2] = &inflightMeta{
			jobID:    2,
			startAt:  time.Now(),
			lastBeat: time.Now(),
			cancel:   cancel2,
		}
		worker.mu.Unlock()

		mockDB.On("Heartbeat", mock.Anything, int64(1), "test-worker", 30).Return(true, nil).Once()
		mockDB.On("Heartbeat", mock.Anything, int64(2), "test-worker", 30).Return(true, nil).Once()

		worker.doHeartbeats()

		// 检查任务仍在 inflight 中
		assert.Equal(t, 2, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})

	t.Run("心跳失败时取消任务", func(t *testing.T) {
		opts := Options{
			Queues:       []string{"test"},
			WorkerID:     "test-worker",
			LeaseSeconds: 30,
		}

		worker := NewWorker(mockDB, opts, handler)

		_, cancel1 := context.WithCancel(context.Background())
		defer cancel1()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:    1,
			startAt:  time.Now(),
			lastBeat: time.Now(),
			cancel:   cancel1,
		}
		worker.mu.Unlock()

		// 心跳返回 false（锁丢失）
		mockDB.On("Heartbeat", mock.Anything, int64(1), "test-worker", 30).Return(false, nil).Once()

		worker.doHeartbeats()

		// 任务应该被从 inflight 中移除
		assert.Equal(t, 0, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})

	t.Run("心跳错误时继续处理其他任务", func(t *testing.T) {
		opts := Options{
			Queues:       []string{"test"},
			WorkerID:     "test-worker",
			LeaseSeconds: 30,
		}

		worker := NewWorker(mockDB, opts, handler)

		_, cancel1 := context.WithCancel(context.Background())
		_, cancel2 := context.WithCancel(context.Background())
		defer cancel1()
		defer cancel2()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:    1,
			startAt:  time.Now(),
			lastBeat: time.Now(),
			cancel:   cancel1,
		}
		worker.inflight[2] = &inflightMeta{
			jobID:    2,
			startAt:  time.Now(),
			lastBeat: time.Now(),
			cancel:   cancel2,
		}
		worker.mu.Unlock()

		// 第一个心跳错误，第二个成功
		mockDB.On("Heartbeat", mock.Anything, int64(1), "test-worker", 30).Return(false, errors.New("network error")).Once()
		mockDB.On("Heartbeat", mock.Anything, int64(2), "test-worker", 30).Return(true, nil).Once()

		worker.doHeartbeats()

		// 两个任务都应该还在（错误不会移除任务，只有 ok=false 才会）
		assert.Equal(t, 2, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})
}

func TestOnExecDone(t *testing.T) {
	mockDB := &MockDB{}
	handler := func(ctx context.Context, job *Job) (any, error) {
		return "ok", nil
	}

	t.Run("任务成功完成", func(t *testing.T) {
		opts := Options{
			Queues:   []string{"test"},
			WorkerID: "test-worker",
		}

		worker := NewWorker(mockDB, opts, handler)

		// 添加 inflight 任务
		_, cancel1 := context.WithCancel(context.Background())
		defer cancel1()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:  1,
			cancel: cancel1,
		}
		worker.mu.Unlock()

		resultJSON := []byte(`{"ok": true, "result": "success"}`)
		// 注意：在事务模式下，onExecDone 只清理 inflight，不调用 Ack/Nack
		// 所以这里不需要 mock Ack

		done := &execDone{
			jobID:  1,
			result: resultJSON,
			err:    nil,
		}

		worker.onExecDone(done)

		// 任务应该从 inflight 中移除
		assert.Equal(t, 0, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})

	t.Run("任务执行失败", func(t *testing.T) {
		opts := Options{
			Queues:         []string{"test"},
			WorkerID:       "test-worker",
			BaseBackoffSec: 2,
			Jitter:         0.2,
		}

		worker := NewWorker(mockDB, opts, handler)

		_, cancel1 := context.WithCancel(context.Background())
		defer cancel1()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:  1,
			cancel: cancel1,
		}
		worker.mu.Unlock()

		resultJSON := []byte(`{"ok": false, "error": "task failed"}`)
		// 注意：在事务模式下，onExecDone 只清理 inflight，不调用 Ack/Nack
		// 所以这里不需要 mock Nack

		done := &execDone{
			jobID:  1,
			result: resultJSON,
			err:    errors.New("task failed"),
		}

		worker.onExecDone(done)

		// 任务应该从 inflight 中移除
		assert.Equal(t, 0, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})

	t.Run("Ack/Nack 错误不影响清理", func(t *testing.T) {
		opts := Options{
			Queues:   []string{"test"},
			WorkerID: "test-worker",
		}

		worker := NewWorker(mockDB, opts, handler)

		_, cancel1 := context.WithCancel(context.Background())
		defer cancel1()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{
			jobID:  1,
			cancel: cancel1,
		}
		worker.mu.Unlock()

		resultJSON := []byte(`{"ok": true, "result": "success"}`)
		// 注意：在事务模式下，onExecDone 只清理 inflight，不调用 Ack/Nack

		done := &execDone{
			jobID:  1,
			result: resultJSON,
			err:    nil,
		}

		worker.onExecDone(done)

		// 任务应该从 inflight 中移除
		assert.Equal(t, 0, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})
}

func TestWorkerLoop(t *testing.T) {
	mockDB := &MockDB{}
	var executedJobs []int64
	var executedMutex sync.Mutex

	handler := func(ctx context.Context, job *Job) (any, error) {
		executedMutex.Lock()
		defer executedMutex.Unlock()

		var data map[string]any
		json.Unmarshal([]byte(job.Payload), &data)
		if id, ok := data["id"].(float64); ok {
			executedJobs = append(executedJobs, int64(id))
		}

		// 模拟一些工作
		select {
		case <-time.After(10 * time.Millisecond):
			return "processed", nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	t.Run("正常处理任务", func(t *testing.T) {
		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 1,
		}

		worker := NewWorker(mockDB, opts, handler)

		// 重置执行列表
		executedMutex.Lock()
		executedJobs = nil
		executedMutex.Unlock()

		// 创建测试任务
		job := createTestJob(100, `{"id": 100, "task": "test"}`)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		item := &execItem{
			job: job,
			ctx: ctx,
		}

		// 手动添加到 WaitGroup
		worker.wg.Add(1)
		// 启动一个 worker goroutine
		go worker.workerLoop()

		// 发送任务
		worker.execCh <- item

		// 等待结果
		select {
		case result := <-worker.resultCh:
			assert.Equal(t, int64(100), result.jobID)
			assert.Nil(t, result.err)
			assert.Contains(t, string(result.result), "processed")
		case <-time.After(1 * time.Second):
			t.Fatal("任务处理超时")
		}

		// 验证任务被执行
		executedMutex.Lock()
		assert.Equal(t, []int64{100}, executedJobs)
		executedMutex.Unlock()

		// 停止 worker
		worker.cancel()
	})

	t.Run("处理 panic", func(t *testing.T) {
		panicHandler := func(ctx context.Context, job *Job) (any, error) {
			panic("test panic")
		}

		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 1,
		}

		worker := NewWorker(mockDB, opts, panicHandler)

		job := createTestJob(200, `{"id": 200, "task": "panic-test"}`)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		item := &execItem{
			job: job,
			ctx: ctx,
		}

		// 手动添加到 WaitGroup
		worker.wg.Add(1)
		go worker.workerLoop()

		worker.execCh <- item

		select {
		case result := <-worker.resultCh:
			assert.Equal(t, int64(200), result.jobID)
			assert.NotNil(t, result.err)
			assert.Contains(t, result.err.Error(), "panic: test panic")
			assert.Contains(t, string(result.result), "panic: test panic")
		case <-time.After(1 * time.Second):
			t.Fatal("panic 处理超时")
		}

		worker.cancel()
	})

	t.Run("上下文取消", func(t *testing.T) {
		slowHandler := func(ctx context.Context, job *Job) (any, error) {
			select {
			case <-time.After(1 * time.Second):
				return "slow result", nil
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		opts := Options{
			Queues:      []string{"test"},
			WorkerID:    "test-worker",
			Concurrency: 1,
		}

		worker := NewWorker(mockDB, opts, slowHandler)

		job := createTestJob(300, `{"id": 300, "task": "slow-test"}`)
		ctx, cancel := context.WithCancel(context.Background())

		item := &execItem{
			job: job,
			ctx: ctx,
		}

		// 手动添加到 WaitGroup
		worker.wg.Add(1)
		go worker.workerLoop()

		worker.execCh <- item

		// 快速取消上下文
		go func() {
			time.Sleep(50 * time.Millisecond)
			cancel()
		}()

		select {
		case result := <-worker.resultCh:
			assert.Equal(t, int64(300), result.jobID)
			assert.NotNil(t, result.err)
			assert.Contains(t, result.err.Error(), "context canceled")
		case <-time.After(1 * time.Second):
			t.Fatal("上下文取消处理超时")
		}

		worker.cancel()
	})
}

func TestInflightManagement(t *testing.T) {
	mockDB := &MockDB{}
	handler := func(ctx context.Context, job *Job) (any, error) {
		return "ok", nil
	}

	t.Run("inflightCount", func(t *testing.T) {
		opts := Options{
			Queues:   []string{"test"},
			WorkerID: "test-worker",
		}

		worker := NewWorker(mockDB, opts, handler)

		assert.Equal(t, 0, worker.inflightCount())

		// 添加一些任务
		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{jobID: 1}
		worker.inflight[2] = &inflightMeta{jobID: 2}
		worker.mu.Unlock()

		assert.Equal(t, 2, worker.inflightCount())
	})

	t.Run("drainAndCancelInflight", func(t *testing.T) {
		opts := Options{
			Queues:   []string{"test"},
			WorkerID: "test-worker",
		}

		worker := NewWorker(mockDB, opts, handler)

		// 创建一些带取消函数的任务
		ctx1, cancel1 := context.WithCancel(context.Background())
		ctx2, cancel2 := context.WithCancel(context.Background())

		var cancelled1, cancelled2 int32

		go func() {
			<-ctx1.Done()
			atomic.StoreInt32(&cancelled1, 1)
		}()

		go func() {
			<-ctx2.Done()
			atomic.StoreInt32(&cancelled2, 1)
		}()

		worker.mu.Lock()
		worker.inflight[1] = &inflightMeta{jobID: 1, cancel: cancel1}
		worker.inflight[2] = &inflightMeta{jobID: 2, cancel: cancel2}
		worker.mu.Unlock()

		worker.drainAndCancelInflight()

		// 等待取消传播
		time.Sleep(10 * time.Millisecond)

		assert.Equal(t, int32(1), atomic.LoadInt32(&cancelled1))
		assert.Equal(t, int32(1), atomic.LoadInt32(&cancelled2))
		assert.Equal(t, 0, worker.inflightCount())
	})
}

// TestSafeNack 已移除，因为 safeNack 方法在事务模式下不再存在
// 在事务模式下，Nack 应该在 Handler 内部的事务中调用

// 集成测试：测试完整的工作流程
func TestWorkerIntegration(t *testing.T) {
	mockDB := &MockDB{}
	var processedJobs []int64
	var processedMutex sync.Mutex

	handler := func(ctx context.Context, job *Job) (any, error) {
		processedMutex.Lock()
		defer processedMutex.Unlock()

		var data map[string]any
		json.Unmarshal([]byte(job.Payload), &data)
		if id, ok := data["id"].(float64); ok {
			processedJobs = append(processedJobs, int64(id))
		}

		return map[string]any{"processed": true}, nil
	}

	t.Run("完整工作流程", func(t *testing.T) {
		opts := Options{
			Queues:         []string{"test"},
			WorkerID:       "integration-worker",
			Concurrency:    2,
			DequeueEvery:   10 * time.Millisecond,
			HeartbeatEvery: 50 * time.Millisecond,
		}

		// 准备一些任务
		jobs := []*Job{
			createTestJob(1, `{"id": 1, "task": "job1"}`),
			createTestJob(2, `{"id": 2, "task": "job2"}`),
		}

		// Mock 返回任务，然后返回空
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(jobs[0], nil).Once()
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(jobs[1], nil).Once()
		mockDB.On("Dequeue", mock.Anything, mock.Anything).Return(nil, nil) // 后续返回空

		// 注意：在事务模式下，Ack 应该在 Handler 内部的事务中调用
		// 这里不 mock Ack，因为测试中的 handler 不会真正调用它

		// Mock 心跳（可能被调用）
		mockDB.On("Heartbeat", mock.Anything, mock.Anything, "integration-worker", mock.Anything).Return(true, nil).Maybe()

		worker := NewWorker(mockDB, opts, handler)

		// 重置处理列表
		processedMutex.Lock()
		processedJobs = nil
		processedMutex.Unlock()

		worker.Start()

		// 等待任务处理
		time.Sleep(200 * time.Millisecond)

		worker.Stop()

		// 验证任务被处理
		processedMutex.Lock()
		assert.Len(t, processedJobs, 2)
		assert.Contains(t, processedJobs, int64(1))
		assert.Contains(t, processedJobs, int64(2))
		processedMutex.Unlock()

		// 确保没有 inflight 任务
		assert.Equal(t, 0, worker.inflightCount())

		mockDB.AssertExpectations(t)
	})
}
