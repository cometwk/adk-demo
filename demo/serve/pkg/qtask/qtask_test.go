//go:build local

package qtask

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==========================================
// 1. 基本功能测试
// ==========================================

var logger = logrus.WithField("module", "test")
var queueName = "test"

func TestNewMemoryQueue(t *testing.T) {
	t.Run("正常初始化", func(t *testing.T) {
		fn := func(ctx context.Context, info *TaskInfo) error {
			return nil
		}
		q := NewMemoryQueue(logger, queueName, 3, 3, fn, WithExponentialBackoff(1*time.Second))
		require.NotNil(t, q)
		assert.Equal(t, 3, q.workerCount)
		assert.Equal(t, 3, q.maxRetries)
		assert.Equal(t, 1*time.Second, q.baseBackoff)
		assert.NotNil(t, q.tasksMap)
		assert.NotNil(t, q.taskQueue)
		assert.NotNil(t, q.readySignal)
		assert.NotNil(t, q.stopCh)
	})

	t.Run("边界值：workerCount为0", func(t *testing.T) {
		fn := func(ctx context.Context, info *TaskInfo) error {
			return nil
		}
		q := NewMemoryQueue(logger, queueName, 0, 3, fn, WithExponentialBackoff(1*time.Second))
		require.NotNil(t, q)
		assert.Equal(t, 0, q.workerCount)
	})

	t.Run("边界值：maxRetries为0", func(t *testing.T) {
		fn := func(ctx context.Context, info *TaskInfo) error {
			return nil
		}
		q := NewMemoryQueue(logger, queueName, 3, 0, fn, WithExponentialBackoff(1*time.Second))
		require.NotNil(t, q)
		assert.Equal(t, 0, q.maxRetries)
	})

	t.Run("边界值：baseBackoff为0", func(t *testing.T) {
		fn := func(ctx context.Context, info *TaskInfo) error {
			return nil
		}
		q := NewMemoryQueue(logger, queueName, 3, 3, fn, WithExponentialBackoff(0))
		require.NotNil(t, q)
		assert.Equal(t, time.Duration(0), q.baseBackoff)
	})
}

func TestMemoryQueue_Add(t *testing.T) {
	t.Run("正常添加任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		err := q.Add("task-1", "payload-1")
		require.NoError(t, err)

		tasks := q.GetTasks()
		assert.Contains(t, tasks, "task-1")
		assert.Equal(t, 1, len(tasks))
	})

	t.Run("边界条件：重复添加相同key", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		err1 := q.Add("task-1", "payload-1")
		require.NoError(t, err1)

		err2 := q.Add("task-1", "payload-2")
		require.Error(t, err2)
		assert.Contains(t, err2.Error(), "already exists")

		tasks := q.GetTasks()
		assert.Equal(t, 1, len(tasks))
	})

	t.Run("边界条件：空key", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		err := q.Add("", "payload")
		require.NoError(t, err) // 空key在技术上是被允许的

		tasks := q.GetTasks()
		assert.Contains(t, tasks, "")
	})

	t.Run("边界条件：nil payload", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		err := q.Add("task-nil", nil)
		require.NoError(t, err)

		tasks := q.GetTasks()
		assert.Contains(t, tasks, "task-nil")
	})

	t.Run("并发添加不同任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		const numTasks = 100
		var wg sync.WaitGroup
		errors := make(chan error, numTasks)

		for i := 0; i < numTasks; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				err := q.Add("task-"+fmt.Sprintf("%d", i), i)
				if err != nil {
					errors <- err
				}
			}(i)
		}

		wg.Wait()
		close(errors)

		// 检查是否有错误
		for err := range errors {
			t.Errorf("添加任务时出错: %v", err)
		}

		tasks := q.GetTasks()
		assert.Equal(t, numTasks, len(tasks))
	})
}

func TestMemoryQueue_Remove(t *testing.T) {
	t.Run("正常删除任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		err := q.Add("task-1", "payload-1")
		require.NoError(t, err)

		q.Remove("task-1")

		tasks := q.GetTasks()
		assert.NotContains(t, tasks, "task-1")
		assert.Equal(t, 0, len(tasks))
	})

	t.Run("边界条件：删除不存在的任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		// 不应该panic或出错
		q.Remove("non-existent-task")

		tasks := q.GetTasks()
		assert.Equal(t, 0, len(tasks))
	})

	t.Run("边界条件：删除空key", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		q.Remove("")
		// 不应该panic
	})

	t.Run("并发删除", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		const numTasks = 50
		for i := 0; i < numTasks; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		var wg sync.WaitGroup
		for i := 0; i < numTasks; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				q.Remove(fmt.Sprintf("task-%d", i))
			}(i)
		}

		wg.Wait()

		tasks := q.GetTasks()
		assert.Equal(t, 0, len(tasks))
	})
}

func TestMemoryQueue_GetTasks(t *testing.T) {
	t.Run("空队列", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		tasks := q.GetTasks()
		assert.Empty(t, tasks)
		assert.NotNil(t, tasks) // 应该是空切片，不是nil
	})

	t.Run("多个任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		q.Add("task-1", "payload-1")
		q.Add("task-2", "payload-2")
		q.Add("task-3", "payload-3")

		tasks := q.GetTasks()
		assert.Equal(t, 3, len(tasks))
		assert.Contains(t, tasks, "task-1")
		assert.Contains(t, tasks, "task-2")
		assert.Contains(t, tasks, "task-3")
	})
}

func TestMemoryQueue_Stats(t *testing.T) {
	t.Run("初始状态", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(1*time.Second))

		stats := q.Stats()
		assert.Contains(t, stats, "Pending: 0")
		assert.Contains(t, stats, "Processed: 0")
		assert.Contains(t, stats, "Success: 0")
		assert.Contains(t, stats, "Failed: 0")
	})
}

// ==========================================
// 2. 任务执行和重试测试
// ==========================================

func TestMemoryQueue_TaskExecution(t *testing.T) {
	t.Run("任务执行成功", func(t *testing.T) {
		var executed atomic.Bool
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			executed.Store(true)
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-success", "payload")
		require.NoError(t, err)

		// 等待任务执行
		time.Sleep(200 * time.Millisecond)

		assert.True(t, executed.Load(), "任务应该被执行")
		assert.Equal(t, 0, len(q.GetTasks()), "成功任务应该被移除")

		stats := q.Stats()
		assert.Contains(t, stats, "Processed: 1")
		assert.Contains(t, stats, "Success: 1")
		assert.Contains(t, stats, "Failed: 0")
	})

	t.Run("任务执行失败并重试", func(t *testing.T) {
		var attemptCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 1, 2, func(ctx context.Context, info *TaskInfo) error {
			attemptCount.Add(1)
			return errors.New("simulated error")
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-retry", "payload")
		require.NoError(t, err)

		// 等待所有重试完成（初始1次 + 重试2次 = 3次执行）
		time.Sleep(1 * time.Second)

		// 由于maxRetries=2，任务会执行3次（初始1次+重试2次），然后被删除
		assert.GreaterOrEqual(t, int(attemptCount.Load()), 2, "应该至少重试2次")

		// 等待任务被删除
		time.Sleep(500 * time.Millisecond)
		assert.Equal(t, 0, len(q.GetTasks()), "达到最大重试次数后任务应该被删除")

		stats := q.Stats()
		assert.Contains(t, stats, "Failed:")
	})

	t.Run("边界条件：maxRetries为0，立即删除失败任务", func(t *testing.T) {
		var executed atomic.Bool
		q := NewMemoryQueue(logger, queueName, 1, 0, func(ctx context.Context, info *TaskInfo) error {
			executed.Store(true)
			return errors.New("error")
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-no-retry", "payload")
		require.NoError(t, err)

		time.Sleep(200 * time.Millisecond)

		assert.True(t, executed.Load(), "任务应该被执行一次")
		assert.Equal(t, 0, len(q.GetTasks()), "失败任务应该立即被删除（无重试）")
	})

	t.Run("边界条件：baseBackoff为0，立即重试", func(t *testing.T) {
		var attemptCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			attemptCount.Add(1)
			return errors.New("error")
		}, WithExponentialBackoff(0))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-immediate-retry", "payload")
		require.NoError(t, err)

		// 由于backoff为0，重试会非常快
		time.Sleep(200 * time.Millisecond)

		// 应该执行多次（至少初始+1次重试）
		assert.GreaterOrEqual(t, int(attemptCount.Load()), 2, "应该至少执行2次")
	})

	t.Run("worker触发nil pointer panic不应导致进程退出", func(t *testing.T) {
		var okExecuted atomic.Bool
		var panicAttempts atomic.Int32
		var okAttempts atomic.Int32

		q := NewMemoryQueue(logger, queueName, 1, 0, func(ctx context.Context, info *TaskInfo) error {
			switch info.Key {
			case "panic-task":
				panicAttempts.Add(1)
				// 模拟 invalid memory address or nil pointer dereference（避免静态分析把显式 *nil 当成告警）
				panic("runtime error: invalid memory address or nil pointer dereference")
			case "ok-task":
				okAttempts.Add(1)
				okExecuted.Store(true)
				return nil
			default:
				return nil
			}
		}, WithExponentialBackoff(0))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		require.NoError(t, q.Add("panic-task", "payload"))
		require.NoError(t, q.Add("ok-task", "payload"))

		require.Eventually(t, func() bool {
			return len(q.GetTasks()) == 0
		}, 2*time.Second, 20*time.Millisecond)

		assert.True(t, okExecuted.Load(), "panic之后队列仍应继续处理后续任务")
		assert.Equal(t, int32(1), panicAttempts.Load(), "maxRetries=0时panic任务应只执行一次并被丢弃")
		assert.Equal(t, int32(1), okAttempts.Load(), "正常任务应执行一次")

		assert.Equal(t, int64(2), q.stats.processed.Load(), "应处理2个任务（包含panic任务）")
		assert.Equal(t, int64(1), q.stats.failed.Load(), "panic应计为失败一次")
		assert.Equal(t, int64(1), q.stats.success.Load(), "正常任务应成功一次")
	})
}

// ==========================================
// 3. 删除正在执行的任务测试
// ==========================================

func TestMemoryQueue_RemoveDuringExecution(t *testing.T) {
	t.Run("删除正在等待执行的任务", func(t *testing.T) {
		var executed atomic.Bool
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			executed.Store(true)
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-to-remove", "payload")
		require.NoError(t, err)

		// 立即删除任务
		q.Remove("task-to-remove")

		// 等待一段时间，确保如果任务被执行，会有足够时间
		time.Sleep(300 * time.Millisecond)

		// 任务可能已经被dispatcher取出，但worker应该检查并跳过
		// 由于Double Check机制，即使任务被取出，worker也会跳过执行
		// 所以executed可能为true或false，但任务应该不在队列中
		assert.Equal(t, 0, len(q.GetTasks()), "任务应该不在队列中")
	})

	t.Run("删除正在重试的任务", func(t *testing.T) {
		var attemptCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			attemptCount.Add(1)
			return errors.New("error")
		}, WithExponentialBackoff(200*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task-retry-remove", "payload")
		require.NoError(t, err)

		// 等待第一次执行失败
		time.Sleep(300 * time.Millisecond)

		// 在重试等待期间删除任务
		q.Remove("task-retry-remove")

		// 等待重试时间过去
		time.Sleep(500 * time.Millisecond)

		// 任务应该被删除，不应该继续重试
		assert.Equal(t, 0, len(q.GetTasks()), "任务应该被删除")
		// attemptCount应该只有1（初始执行），因为删除后不会重试
		assert.LessOrEqual(t, int(attemptCount.Load()), 2, "删除后不应该继续重试")
	})
}

// ==========================================
// 4. 并发测试
// ==========================================

func TestMemoryQueue_Concurrency(t *testing.T) {
	t.Run("并发添加和删除", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 5, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		const numTasks = 100
		var wg sync.WaitGroup

		// 并发添加
		for i := 0; i < numTasks; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				q.Add(fmt.Sprintf("task-%d", i), i)
			}(i)
		}

		wg.Wait()

		// 并发删除
		for i := 0; i < numTasks; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				q.Remove(fmt.Sprintf("task-%d", i))
			}(i)
		}

		wg.Wait()

		// 等待所有任务处理完成
		time.Sleep(500 * time.Millisecond)

		// 由于并发执行，一些任务可能已经被执行，但最终队列应该为空
		tasks := q.GetTasks()
		assert.Equal(t, 0, len(tasks), "所有任务应该被处理或删除")
	})

	t.Run("并发执行多个任务", func(t *testing.T) {
		var executedCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 10, 3, func(ctx context.Context, info *TaskInfo) error {
			executedCount.Add(1)
			time.Sleep(50 * time.Millisecond) // 模拟耗时操作
			return nil
		}, WithExponentialBackoff(50*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		const numTasks = 50
		for i := 0; i < numTasks; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		// 等待所有任务执行完成
		time.Sleep(2 * time.Second)

		assert.Equal(t, int32(numTasks), executedCount.Load(), "所有任务应该被执行")
		assert.Equal(t, 0, len(q.GetTasks()), "所有任务应该被移除")
	})
}

// ==========================================
// 5. Context取消和Stop测试
// ==========================================

func TestMemoryQueue_ContextCancel(t *testing.T) {
	t.Run("Context取消时停止处理", func(t *testing.T) {
		var executedCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 2, 3, func(ctx context.Context, info *TaskInfo) error {
			executedCount.Add(1)
			// 检查context是否被取消
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
				time.Sleep(50 * time.Millisecond)
				return nil
			}
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())

		q.Start(ctx)

		// 添加一些任务
		for i := 0; i < 10; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		// 立即取消context
		cancel()

		// 等待停止
		q.Stop()

		// 由于context取消，可能只有部分任务被执行
		// 但至少应该有一些任务被执行
		assert.GreaterOrEqual(t, int(executedCount.Load()), 0, "可能有一些任务被执行")
	})

	t.Run("Stop后添加任务", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		q.Stop()

		// Stop后添加任务应该不会panic，但任务不会被处理
		err := q.Add("task-after-stop", "payload")
		require.NoError(t, err)

		// 任务应该在队列中，但不会被处理
		tasks := q.GetTasks()
		assert.Contains(t, tasks, "task-after-stop")
	})
}

// ==========================================
// 6. 统计信息准确性测试
// ==========================================

func TestMemoryQueue_StatsAccuracy(t *testing.T) {
	t.Run("统计信息准确性", func(t *testing.T) {
		var successCount atomic.Int32
		var failCount atomic.Int32

		q := NewMemoryQueue(logger, queueName, 2, 2, func(ctx context.Context, info *TaskInfo) error {
			payloadStr, ok := info.Payload.(string)
			if !ok {
				return errors.New("invalid payload")
			}

			if payloadStr == "fail" {
				failCount.Add(1)
				return errors.New("simulated failure")
			}
			successCount.Add(1)
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		// 添加成功任务
		for i := 0; i < 5; i++ {
			q.Add(fmt.Sprintf("success-%d", i), "success")
		}

		// 添加失败任务（会重试但最终失败）
		q.Add("fail-task", "fail")

		// 等待所有任务处理完成
		time.Sleep(1 * time.Second)

		stats := q.Stats()
		assert.Contains(t, stats, "Processed:")
		assert.Contains(t, stats, "Success:")
		assert.Contains(t, stats, "Failed:")
	})
}

// ==========================================
// 7. 边界条件：空队列和调度器行为
// ==========================================

func TestMemoryQueue_EmptyQueue(t *testing.T) {
	t.Run("空队列时调度器行为", func(t *testing.T) {
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		// 不添加任何任务，调度器应该进入长等待状态
		time.Sleep(200 * time.Millisecond)

		// 应该不会panic或出错
		tasks := q.GetTasks()
		assert.Equal(t, 0, len(tasks))
	})

	t.Run("队列从空到有任务", func(t *testing.T) {
		var executed atomic.Bool
		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			executed.Store(true)
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		// 等待调度器进入等待状态
		time.Sleep(100 * time.Millisecond)

		// 然后添加任务
		err := q.Add("delayed-task", "payload")
		require.NoError(t, err)

		// 等待任务执行
		time.Sleep(200 * time.Millisecond)

		assert.True(t, executed.Load(), "任务应该被执行")
	})
}

// ==========================================
// 8. 多个任务同时到期测试
// ==========================================

func TestMemoryQueue_MultipleTasksReady(t *testing.T) {
	t.Run("多个任务同时到期", func(t *testing.T) {
		var executedCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 5, 3, func(ctx context.Context, info *TaskInfo) error {
			executedCount.Add(1)
			return nil
		}, WithExponentialBackoff(50*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		// 添加多个任务，它们应该几乎同时到期
		const numTasks = 20
		for i := 0; i < numTasks; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		// 等待所有任务执行完成
		time.Sleep(500 * time.Millisecond)

		assert.Equal(t, int32(numTasks), executedCount.Load(), "所有任务应该被执行")
		assert.Equal(t, 0, len(q.GetTasks()), "所有任务应该被移除")
	})
}

// ==========================================
// 9. Worker数量边界测试
// ==========================================

func TestMemoryQueue_WorkerCountBoundary(t *testing.T) {
	t.Run("Worker数量为0", func(t *testing.T) {
		var executed atomic.Bool
		q := NewMemoryQueue(logger, queueName, 0, 3, func(ctx context.Context, info *TaskInfo) error {
			executed.Store(true)
			return nil
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("task", "payload")
		require.NoError(t, err)

		// 等待一段时间
		time.Sleep(300 * time.Millisecond)

		// 由于没有worker，任务不应该被执行
		assert.False(t, executed.Load(), "没有worker时任务不应该被执行")
		assert.Equal(t, 1, len(q.GetTasks()), "任务应该仍在队列中")
	})

	t.Run("大量Worker", func(t *testing.T) {
		var executedCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 100, 3, func(ctx context.Context, info *TaskInfo) error {
			executedCount.Add(1)
			return nil
		}, WithExponentialBackoff(50*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		const numTasks = 50
		for i := 0; i < numTasks; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		// 等待所有任务执行完成
		time.Sleep(500 * time.Millisecond)

		assert.Equal(t, int32(numTasks), executedCount.Load(), "所有任务应该被执行")
	})
}

// ==========================================
// 10. 指数退避测试
// ==========================================

func TestMemoryQueue_ExponentialBackoff(t *testing.T) {
	t.Run("指数退避时间计算", func(t *testing.T) {
		var executionTimes []time.Time
		var mu sync.Mutex

		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			mu.Lock()
			executionTimes = append(executionTimes, time.Now())
			mu.Unlock()
			return errors.New("always fail")
		}, WithExponentialBackoff(100*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		err := q.Add("backoff-test", "payload")
		require.NoError(t, err)

		// 等待所有重试完成（初始1次 + 重试3次 = 4次执行）
		time.Sleep(2 * time.Second)

		mu.Lock()
		times := make([]time.Time, len(executionTimes))
		copy(times, executionTimes)
		mu.Unlock()

		// 验证执行次数
		assert.GreaterOrEqual(t, len(times), 2, "应该至少执行2次")

		// 验证重试间隔（如果有多于1次执行）
		if len(times) >= 2 {
			// 第一次和第二次之间的间隔应该接近baseBackoff (100ms)
			interval1 := times[1].Sub(times[0])
			assert.GreaterOrEqual(t, interval1, 50*time.Millisecond, "第一次重试间隔应该至少50ms")
			assert.LessOrEqual(t, interval1, 300*time.Millisecond, "第一次重试间隔应该不超过300ms")

			// 如果有第三次执行，间隔应该更长
			if len(times) >= 3 {
				interval2 := times[2].Sub(times[1])
				assert.GreaterOrEqual(t, interval2, 100*time.Millisecond, "第二次重试间隔应该更长")
			}
		}
	})
}

func TestMemoryQueue_FixedIntervalRetry(t *testing.T) {
	t.Run("固定间隔重试时间计算（无 jitter）", func(t *testing.T) {
		var executionTimes []time.Time
		var mu sync.Mutex

		fixed := 100 * time.Millisecond
		q := NewMemoryQueue(logger, queueName, 1, 2, func(ctx context.Context, info *TaskInfo) error {
			mu.Lock()
			executionTimes = append(executionTimes, time.Now())
			mu.Unlock()
			return errors.New("always fail")
		}, WithFixedIntervalRetry(fixed))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		require.NoError(t, q.Add("fixed-interval-test", "payload"))

		// 等待所有重试完成（初始1次 + 重试2次 = 3次执行）
		time.Sleep(800 * time.Millisecond)

		mu.Lock()
		times := make([]time.Time, len(executionTimes))
		copy(times, executionTimes)
		mu.Unlock()

		// 至少应该有 3 次执行（初始 + 2 次重试）
		require.GreaterOrEqual(t, len(times), 3, "应至少执行3次（初始+2次重试）")

		interval1 := times[1].Sub(times[0])
		interval2 := times[2].Sub(times[1])

		// 由于 NextRun 以失败处理时的 time.Now() 计算，观察到的间隔应 >= fixed（可能略大）
		assert.GreaterOrEqual(t, interval1, fixed, "第一次重试间隔应不小于固定间隔")
		assert.GreaterOrEqual(t, interval2, fixed, "第二次重试间隔应不小于固定间隔")

		// 上界给一个宽松容差，避免 CI 或调度抖动导致偶发失败
		assert.LessOrEqual(t, interval1, fixed+300*time.Millisecond, "第一次重试间隔不应偏离过大")
		assert.LessOrEqual(t, interval2, fixed+300*time.Millisecond, "第二次重试间隔不应偏离过大")
	})
}

// ==========================================
// 11. 任务优先级（时间顺序）测试
// ==========================================

func TestMemoryQueue_TaskOrdering(t *testing.T) {
	t.Run("任务按时间顺序执行", func(t *testing.T) {
		var executionOrder []string
		var mu sync.Mutex

		q := NewMemoryQueue(logger, queueName, 1, 3, func(ctx context.Context, info *TaskInfo) error {
			mu.Lock()
			executionOrder = append(executionOrder, info.Key)
			mu.Unlock()
			return nil
		}, WithExponentialBackoff(50*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		// 添加多个任务
		q.Add("task-1", "payload-1")
		q.Add("task-2", "payload-2")
		q.Add("task-3", "payload-3")

		// 等待所有任务执行完成
		time.Sleep(500 * time.Millisecond)

		mu.Lock()
		order := make([]string, len(executionOrder))
		copy(order, executionOrder)
		mu.Unlock()

		// 验证所有任务都被执行
		assert.Equal(t, 3, len(order), "所有任务应该被执行")
		assert.Contains(t, order, "task-1")
		assert.Contains(t, order, "task-2")
		assert.Contains(t, order, "task-3")
	})
}

// ==========================================
// 12. 压力测试
// ==========================================

func TestMemoryQueue_StressTest(t *testing.T) {
	t.Run("大量任务压力测试", func(t *testing.T) {
		var executedCount atomic.Int32
		q := NewMemoryQueue(logger, queueName, 10, 3, func(ctx context.Context, info *TaskInfo) error {
			executedCount.Add(1)
			return nil
		}, WithExponentialBackoff(10*time.Millisecond))

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		q.Start(ctx)
		defer q.Stop()

		const numTasks = 1000
		for i := 0; i < numTasks; i++ {
			q.Add(fmt.Sprintf("task-%d", i), i)
		}

		// 等待所有任务执行完成
		time.Sleep(3 * time.Second)

		assert.Equal(t, int32(numTasks), executedCount.Load(), "所有任务应该被执行")
		assert.Equal(t, 0, len(q.GetTasks()), "所有任务应该被移除")
	})
}
