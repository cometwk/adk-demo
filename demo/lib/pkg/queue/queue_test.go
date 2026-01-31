package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"xorm.io/xorm"
)

// 测试数据库初始化
func initTestDB(t *testing.T) *xorm.Engine {
	// engine, err := orm.NewXormEngine(env.MustString("TEST_DB_DRIVER"), env.MustString("TEST_DB_URL"))
	// require.NoError(t, err, "数据库初始化失败")
	var err error
	orm.InitDefaultDB()
	engine := orm.MustDB()

	// var err error
	// 同步表结构
	// err := engine.Sync2(new(JobQueue), new(JobHistory))
	// require.NoError(t, err, "同步表结构失败")

	// read job_queue.sql and execute it
	sql, err := os.ReadFile("job_queue.sql")
	require.NoError(t, err, "读取 job_queue.sql 失败")
	_, err = engine.Exec(string(sql))
	require.NoError(t, err, "执行 job_queue.sql 失败")

	// 清理测试数据
	_, err = engine.Exec("DELETE FROM job_queue")
	require.NoError(t, err, "清理 job_queue 表失败")

	_, err = engine.Exec("DELETE FROM job_history")
	require.NoError(t, err, "清理 job_history 表失败")

	return engine
}

// 测试客户端创建
func TestNewClient(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	assert.NotNil(t, client)
	assert.Equal(t, engine, client.engine)
}

// 测试入队功能
func TestClient_Enqueue(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	t.Run("基本入队", func(t *testing.T) {
		req := EnqueueRequest{
			QueueName:   "test-queue",
			Priority:    10,
			Payload:     `{"test": "data"}`,
			MaxAttempts: 3,
			Delay:       0,
		}

		jobID, existed, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "入队失败")
		assert.False(t, existed, "不应该标记为已存在")
		assert.Greater(t, jobID, int64(0), "任务ID应该大于0")

		// 验证任务是否正确插入
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		assert.True(t, has, "应该能找到任务")
		assert.Equal(t, req.QueueName, job.QueueName)
		assert.Equal(t, req.Priority, job.Priority)
		assert.Equal(t, req.Payload, job.Payload)
		assert.Equal(t, req.MaxAttempts, job.MaxAttempts)
		assert.Equal(t, 0, job.Attempts)
		assert.Nil(t, job.LeaseUntil)
		assert.Nil(t, job.LockedBy)
	})

	t.Run("幂等性测试", func(t *testing.T) {
		uniqueKey := "unique-test-key"
		req := EnqueueRequest{
			QueueName:   "test-queue",
			Priority:    5,
			UniqueKey:   &uniqueKey,
			Payload:     `{"test": "unique"}`,
			MaxAttempts: 3,
			Delay:       0,
		}

		// 第一次入队
		jobID1, existed1, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "第一次入队失败")
		assert.False(t, existed1, "第一次入队不应该标记为已存在")

		// 第二次入队相同key
		jobID2, existed2, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "第二次入队失败")
		assert.True(t, existed2, "第二次入队应该标记为已存在")
		assert.Equal(t, jobID1, jobID2, "应该返回相同的任务ID")

		// 验证数据库中只有一个任务
		count, err := engine.Where("unique_key = ?", uniqueKey).Count(new(JobQueue))
		require.NoError(t, err, "查询任务数量失败")
		assert.Equal(t, int64(1), count, "应该只有一个任务")
	})

	t.Run("延迟任务", func(t *testing.T) {
		delay := 100 * time.Millisecond
		req := EnqueueRequest{
			QueueName:   "test-queue",
			Priority:    1,
			Payload:     `{"test": "delayed 测试"}`,
			MaxAttempts: 3,
			Delay:       delay,
		}

		beforeEnqueue := time.Now().UTC()
		jobID, existed, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "入队失败")
		assert.False(t, existed)

		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		assert.True(t, has)

		fmt.Printf("job.AvailableAt=%v\n", job.AvailableAt)
		fmt.Printf("beforeEnqueue=%v\n", beforeEnqueue)
		fmt.Printf("delay=%v\n", delay)
		// 验证可用时间是否正确设置
		assert.True(t, job.AvailableAt.After(beforeEnqueue.Add(delay-100*time.Millisecond)), "可用时间应该正确设置")
		assert.True(t, job.AvailableAt.Before(beforeEnqueue.Add(delay+100*time.Millisecond)), "可用时间应该在合理范围内")
	})

	t.Run("默认值测试", func(t *testing.T) {
		req := EnqueueRequest{
			Payload: `{"test": "defaults"}`,
		}

		jobID, existed, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "入队失败")
		assert.False(t, existed)

		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		assert.True(t, has)

		// 验证默认值
		assert.Equal(t, "default", job.QueueName, "队列名应该默认为 default")
		assert.Equal(t, 0, job.Priority, "优先级应该默认为 0")
		assert.Equal(t, 5, job.MaxAttempts, "最大尝试次数应该默认为 5")
	})
}

// 测试出队功能
func TestClient_Dequeue(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	// 准备测试数据
	prepareTestJobs(t, engine)

	t.Run("基本出队", func(t *testing.T) {
		req := DequeueRequest{
			Queues:       []string{"test-queue"},
			LeaseSeconds: 30,
			WorkerID:     "worker-1",
		}

		job, err := client.Dequeue(ctx, req)
		require.NoError(t, err, "出队失败")
		assert.NotNil(t, job, "应该能获取到任务")

		// 验证任务被锁定
		assert.NotNil(t, job.LeaseUntil, "任务应该被锁定")
		assert.Equal(t, "worker-1", *job.LockedBy, "任务应该被正确的worker锁定")
		assert.Equal(t, 1, job.Attempts, "尝试次数应该增加")

		// 验证数据库中的锁定状态
		var lockedJob JobQueue
		has, err := engine.ID(job.ID).Get(&lockedJob)
		require.NoError(t, err, "查询锁定任务失败")
		assert.True(t, has)
		assert.NotNil(t, lockedJob.LeaseUntil)
		assert.Equal(t, "worker-1", *lockedJob.LockedBy)
	})

	t.Run("多队列出队", func(t *testing.T) {
		req := DequeueRequest{
			Queues:       []string{"test-queue", "high-priority"},
			LeaseSeconds: 30,
			WorkerID:     "worker-2",
		}

		job, err := client.Dequeue(ctx, req)
		require.NoError(t, err, "出队失败")
		assert.NotNil(t, job, "应该能获取到任务")

		// 验证任务来自指定的队列之一
		assert.Contains(t, req.Queues, job.QueueName, "任务应该来自指定的队列")
	})

	t.Run("优先级排序", func(t *testing.T) {
		// 创建不同优先级的任务
		highPriorityJob := &JobQueue{
			QueueName:   "priority-test",
			Priority:    100,
			Payload:     `{"priority": "high"}`,
			AvailableAt: time.Now(),
			MaxAttempts: 3,
		}
		_, err := engine.Insert(highPriorityJob)
		require.NoError(t, err, "插入高优先级任务失败")

		lowPriorityJob := &JobQueue{
			QueueName:   "priority-test",
			Priority:    1,
			Payload:     `{"priority": "low"}`,
			AvailableAt: time.Now(),
			MaxAttempts: 3,
		}
		_, err = engine.Insert(lowPriorityJob)
		require.NoError(t, err, "插入低优先级任务失败")

		req := DequeueRequest{
			Queues:       []string{"priority-test"},
			LeaseSeconds: 30,
			WorkerID:     "worker-3",
		}

		job, err := client.Dequeue(ctx, req)
		require.NoError(t, err, "出队失败")
		assert.NotNil(t, job, "应该能获取到任务")

		// 应该优先获取高优先级任务
		assert.Equal(t, 100, job.Priority, "应该优先获取高优先级任务")
	})

	t.Run("无可用任务", func(t *testing.T) {
		req := DequeueRequest{
			Queues:       []string{"empty-queue"},
			LeaseSeconds: 30,
			WorkerID:     "worker-4",
		}

		job, err := client.Dequeue(ctx, req)
		require.NoError(t, err, "出队失败")
		assert.Nil(t, job, "应该返回nil表示没有可用任务")
	})

	t.Run("1. FOR UPDATE SKIP LOCKED 跳过已锁定行测试", func(t *testing.T) {
		// 准备测试数据：插入3个任务
		var jobIDs []int64
		for i := 0; i < 3; i++ {
			job := &JobQueue{
				QueueName:   "skip-locked-test",
				Priority:    0,
				Payload:     fmt.Sprintf(`{"task_id": %d}`, i),
				AvailableAt: time.Now(),
				MaxAttempts: 3,
			}
			_, err := engine.Insert(job)
			require.NoError(t, err, "插入测试任务失败")
			jobIDs = append(jobIDs, job.ID)
		}

		// 第一个 goroutine：手动锁定 id=1 的任务（在事务中）
		lockChan := make(chan bool)     // 通知已锁定
		rollbackChan := make(chan bool) // 通知可以回滚
		doneChan := make(chan bool)     // 通知已完成

		var firstJobID int64
		if len(jobIDs) > 0 {
			firstJobID = jobIDs[0]
		}

		go func() {
			// 开启事务
			session := engine.NewSession()
			defer session.Close()

			err := session.Begin()
			require.NoError(t, err, "开启事务失败")

			// 手动 SELECT ... FOR UPDATE 锁定第一条任务
			var lockedJob JobQueue
			has, err := session.SQL("SELECT * FROM job_queue WHERE id = ? FOR UPDATE", firstJobID).Get(&lockedJob)
			require.NoError(t, err, "锁定任务失败")
			require.True(t, has, "应该能找到任务 id=%d", firstJobID)

			// 通知已锁定
			lockChan <- true

			// 等待回滚信号
			<-rollbackChan

			// 回滚事务，释放锁
			err = session.Rollback()
			require.NoError(t, err, "回滚事务失败")

			doneChan <- true
		}()

		// 等待第一个 goroutine 锁定任务
		<-lockChan

		// 第二个 goroutine：执行 Dequeue，应该跳过 id=1，获取 id=2
		req := DequeueRequest{
			Queues:       []string{"skip-locked-test"},
			LeaseSeconds: 30,
			WorkerID:     "worker-skip-locked",
		}

		job, err := client.Dequeue(ctx, req)
		require.NoError(t, err, "Dequeue 不应该返回错误")
		require.NotNil(t, job, "应该能获取到任务")

		// 验证：获取到的任务应该是 id=2（因为 id=1 被锁定了）
		assert.NotEqual(t, firstJobID, job.ID, "Dequeue 应该跳过被锁定的任务 id=%d，获取到 id=%d", firstJobID, job.ID)
		assert.Equal(t, jobIDs[1], job.ID, "应该获取到第二个任务")
		t.Logf("✅ 成功验证：第一次得到的任务 id=%d", job.ID)

		// 验证任务被正确锁定
		assert.NotNil(t, job.LeaseUntil, "任务应该被锁定")
		assert.NotNil(t, job.LockedBy, "任务应该有 locked_by")
		assert.Equal(t, "worker-skip-locked", *job.LockedBy)

		// 通知第一个 goroutine 可以回滚
		rollbackChan <- true

		// 等待第一个 goroutine 完成回滚
		<-doneChan

		// 先 Ack 刚才获取的任务（id=2），以便后续测试
		session := engine.NewSession().Context(ctx)
		err = session.Begin()
		require.NoError(t, err, "开始事务失败")
		err = client.Ack(ctx, session, job, []byte(`{"result": "success"}`))
		require.NoError(t, err, "Ack 任务失败")
		err = session.Commit()
		require.NoError(t, err, "提交事务失败")
		session.Close()

		// 验证：id=1 的任务现在应该可以被获取了（因为锁已释放）
		req2 := DequeueRequest{
			Queues:       []string{"skip-locked-test"},
			LeaseSeconds: 30,
			WorkerID:     "worker-after-rollback",
		}

		job2, err := client.Dequeue(ctx, req2)
		require.NoError(t, err, "回滚后的 Dequeue 不应该返回错误")
		require.NotNil(t, job2, "应该能获取到任务（之前被锁定的任务现在应该可用）")

		// 验证：应该能获取到 id=1（之前被锁定的）或 id=3
		// 由于 id=2 已被 Ack，现在应该能获取到 id=1 或 id=3
		assert.Contains(t, jobIDs, job2.ID, "应该获取到剩余的任务之一")

		// 如果获取到了 id=1，说明 SKIP LOCKED 正确工作，锁释放后任务可被获取
		if job2.ID == firstJobID {
			t.Logf("✅ 成功验证：回滚后获取到之前被锁定的任务 id=%d", firstJobID)
		} else {
			t.Logf("获取到任务 id=%d（剩余任务之一，之前被锁定的任务 id=%d）", job2.ID, firstJobID)
		}
	})

	t.Run("2. FOR UPDATE SKIP LOCKED 竞争状态测试", func(t *testing.T) {
		// 准备测试数据：创建多个可用任务
		const taskCount = 10
		const workerCount = 5

		for i := 0; i < taskCount; i++ {
			job := &JobQueue{
				QueueName:   "concurrent-test",
				Priority:    0,
				Payload:     fmt.Sprintf(`{"task_id": %d}`, i),
				AvailableAt: time.Now(),
				MaxAttempts: 3,
			}
			_, err := engine.Insert(job)
			require.NoError(t, err, "插入测试任务失败")
		}

		// 使用 channel 收集所有获取到的任务
		jobsChan := make(chan *JobQueue, taskCount)
		errorsChan := make(chan error, workerCount)

		// 使用 WaitGroup 等待所有 goroutine 完成
		var wg sync.WaitGroup
		wg.Add(workerCount)

		// 启动多个 worker 并发获取任务
		for i := 0; i < workerCount; i++ {
			go func(workerID int) {
				defer wg.Done()

				req := DequeueRequest{
					Queues:       []string{"concurrent-test"},
					LeaseSeconds: 30,
					WorkerID:     fmt.Sprintf("concurrent-worker-%d", workerID),
				}

				// 每个 worker 尝试获取多个任务，直到没有可用任务
				for {
					job, err := client.Dequeue(ctx, req)
					if err != nil {
						errorsChan <- err
						return
					}
					if job == nil {
						// 没有更多任务了
						return
					}
					jobsChan <- job
				}
			}(i)
		}

		// 等待所有 worker 完成
		wg.Wait()
		close(jobsChan)
		close(errorsChan)

		// 检查是否有错误
		for err := range errorsChan {
			require.NoError(t, err, "Dequeue 不应该返回错误")
		}

		// 收集所有获取到的任务
		var jobs []*JobQueue
		for job := range jobsChan {
			jobs = append(jobs, job)
		}

		// 验证：所有任务都应该被获取到
		assert.Equal(t, taskCount, len(jobs), "应该获取到所有任务")

		// 验证：每个任务只被一个 worker 获取（没有重复）
		jobIDs := make(map[int64]bool)
		workerIDs := make(map[string]int)
		for _, job := range jobs {
			// 验证任务 ID 唯一
			assert.False(t, jobIDs[job.ID], "任务 ID %d 不应该被重复获取", job.ID)
			jobIDs[job.ID] = true

			// 统计每个 worker 获取的任务数
			if job.LockedBy != nil {
				workerIDs[*job.LockedBy]++
			}

			// 验证任务被正确锁定
			assert.NotNil(t, job.LeaseUntil, "任务应该被锁定")
			assert.NotNil(t, job.LockedBy, "任务应该有 locked_by")
			assert.Equal(t, 1, job.Attempts, "任务尝试次数应该为1")
		}

		// 验证：所有任务都被不同的 worker 获取（任务分布合理）
		t.Logf("任务分布：%v", workerIDs)
		assert.Greater(t, len(workerIDs), 0, "至少应该有一个 worker 获取到任务")

		// 验证：数据库中的任务状态
		for _, job := range jobs {
			var dbJob JobQueue
			has, err := engine.ID(job.ID).Get(&dbJob)
			require.NoError(t, err)
			require.True(t, has, "任务 %d 应该存在于数据库中", job.ID)
			assert.NotNil(t, dbJob.LeaseUntil, "数据库中的任务应该被锁定")
			assert.NotNil(t, dbJob.LockedBy, "数据库中的任务应该有 locked_by")
			assert.Equal(t, job.LockedBy, dbJob.LockedBy, "数据库中的 locked_by 应该匹配")
		}
	})
}

// 测试确认功能
func TestClient_Ack(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	// 准备一个被锁定的任务
	jobID := prepareLockedJob(t, engine, "worker-1")

	t.Run("成功确认", func(t *testing.T) {
		// 获取被锁定的任务
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		require.True(t, has, "应该能找到任务")

		result := []byte(`{"status": "success", "data": "processed"}`)
		session := engine.NewSession().Context(ctx)
		err = session.Begin()
		require.NoError(t, err, "开始事务失败")
		err = client.Ack(ctx, session, &job, result)
		require.NoError(t, err, "确认失败")
		err = session.Commit()
		require.NoError(t, err, "提交事务失败")
		session.Close()

		// 验证任务从主队列中删除
		var checkJob JobQueue
		has, err = engine.ID(jobID).Get(&checkJob)
		require.NoError(t, err, "查询任务失败")
		assert.False(t, has, "任务应该从主队列中删除")

		// 验证任务被移到历史表
		var history JobHistory
		has, err = engine.ID(jobID).Get(&history)
		require.NoError(t, err, "查询历史记录失败")
		assert.True(t, has, "任务应该被移到历史表")
		assert.Equal(t, "completed", history.StatusFinal, "状态应该是completed")
		assert.JSONEq(t, string(result), history.Result, "结果应该正确保存")
		assert.Equal(t, "worker-1", *history.ProcessedBy, "处理者应该正确记录")
	})

	t.Run("确认错误的worker", func(t *testing.T) {
		// 准备另一个被锁定的任务
		jobID2 := prepareLockedJob(t, engine, "worker-2")

		// 获取被锁定的任务
		var job JobQueue
		has, err := engine.ID(jobID2).Get(&job)
		require.NoError(t, err, "查询任务失败")
		require.True(t, has, "应该能找到任务")

		// 修改 LockedBy 为错误的 worker，但实际数据库中仍然是 worker-2
		// 这样 Ack 会失败，因为数据库检查会失败
		wrongJob := job
		wrongWorkerID := "worker-1"
		wrongJob.LockedBy = &wrongWorkerID

		session := engine.NewSession().Context(ctx)
		err = session.Begin()
		require.NoError(t, err, "开始事务失败")
		err = client.Ack(ctx, session, &wrongJob, []byte(`{"error": "wrong worker"}`))
		assert.Error(t, err, "应该拒绝错误的worker确认")
		assert.Contains(t, err.Error(), "not locked by worker", "错误信息应该正确")
		session.Rollback()
		session.Close()
	})
}

// 测试拒绝功能
func TestClient_Nack(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	t.Run("基本拒绝", func(t *testing.T) {
		jobID := prepareLockedJob(t, engine, "worker-1")

		// 获取被锁定的任务
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		require.True(t, has, "应该能找到任务")

		session := engine.NewSession().Context(ctx)
		err = session.Begin()
		require.NoError(t, err, "开始事务失败")
		err = client.Nack(ctx, session, &job, 10*60, 0.1, []byte(`{"error": "processing failed"}`))
		require.NoError(t, err, "拒绝失败")
		err = session.Commit()
		require.NoError(t, err, "提交事务失败")
		session.Close()

		// 验证任务被解锁
		var checkJob JobQueue
		has, err = engine.ID(jobID).Get(&checkJob)
		require.NoError(t, err, "查询任务失败")
		assert.True(t, has, "任务应该仍然存在")
		assert.Nil(t, checkJob.LeaseUntil, "任务应该被解锁")
		assert.Nil(t, checkJob.LockedBy, "锁定者应该被清除")
		assert.True(t, checkJob.AvailableAt.After(time.Now()), "可用时间应该被推迟")
	})

	t.Run("达到最大尝试次数", func(t *testing.T) {
		// 准备一个达到最大尝试次数的任务
		jobID := prepareMaxAttemptsJob(t, engine, "worker-1")

		// 获取被锁定的任务
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		require.True(t, has, "应该能找到任务")

		session := engine.NewSession().Context(ctx)
		err = session.Begin()
		require.NoError(t, err, "开始事务失败")
		err = client.Nack(ctx, session, &job, 10, 0.1, []byte(`{"error": "max attempts reached"}`))
		require.NoError(t, err, "拒绝失败")
		err = session.Commit()
		require.NoError(t, err, "提交事务失败")
		session.Close()

		// 验证任务被移到死信队列
		var checkJob JobQueue
		has, err = engine.ID(jobID).Get(&checkJob)
		require.NoError(t, err, "查询任务失败")
		assert.False(t, has, "任务应该从主队列中删除")

		var history JobHistory
		has, err = engine.ID(jobID).Get(&history)
		require.NoError(t, err, "查询历史记录失败")
		assert.True(t, has, "任务应该被移到历史表")
		assert.Equal(t, "dead_letter", history.StatusFinal, "状态应该是dead_letter")
	})
}

// 测试心跳功能
func TestClient_Heartbeat(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	t.Run("成功续租", func(t *testing.T) {
		jobID := prepareLockedJob(t, engine, "worker-1")

		extended, err := client.Heartbeat(ctx, jobID, "worker-1", 60)
		require.NoError(t, err, "心跳失败")
		assert.True(t, extended, "应该成功续租")

		// 验证租约时间被延长
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		assert.True(t, has)
		assert.True(t, job.LeaseUntil.After(time.Now().Add(50*time.Second)), "租约应该被延长")
	})

	t.Run("续租过期任务", func(t *testing.T) {
		// 准备一个过期的任务
		jobID := prepareExpiredJob(t, engine, "worker-1")

		extended, err := client.Heartbeat(ctx, jobID, "worker-1", 60)
		require.NoError(t, err, "心跳失败")
		assert.False(t, extended, "不应该续租过期任务")
	})
}

// 测试租约恢复功能
func TestClient_RecoverExpiredLeases(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	// 准备一些过期的租约
	prepareExpiredLeases(t, engine)

	t.Run("恢复过期租约", func(t *testing.T) {
		recovered, err := client.RecoverExpiredLeases(ctx, 100)
		require.NoError(t, err, "恢复租约失败")
		assert.Greater(t, recovered, int64(0), "应该恢复一些租约")

		// 验证租约被清除
		count, err := engine.Where("lease_until IS NOT NULL").Count(new(JobQueue))
		require.NoError(t, err, "查询锁定任务数量失败")
		assert.Equal(t, int64(0), count, "所有过期租约应该被清除")
	})
}

// 测试死信队列功能
func TestClient_MoveToDeadLetterByID(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	t.Run("手动移到死信队列", func(t *testing.T) {
		// 准备一个普通任务
		jobID := prepareNormalJob(t, engine)

		reason := []byte(`{"reason": "manual operation", "operator": "admin"}`)
		err := client.MoveToDeadLetterByID(ctx, jobID, reason)
		require.NoError(t, err, "移到死信队列失败")

		// 验证任务被移到历史表
		var job JobQueue
		has, err := engine.ID(jobID).Get(&job)
		require.NoError(t, err, "查询任务失败")
		assert.False(t, has, "任务应该从主队列中删除")

		var history JobHistory
		has, err = engine.ID(jobID).Get(&history)
		require.NoError(t, err, "查询历史记录失败")
		assert.True(t, has, "任务应该被移到历史表")
		assert.Equal(t, "dead_letter", history.StatusFinal, "状态应该是dead_letter")
		assert.JSONEq(t, string(reason), history.Result, "原因应该正确保存")
	})
}

// 辅助函数：准备测试任务
func prepareTestJobs(t *testing.T, engine *xorm.Engine) {
	jobs := []JobQueue{
		{
			QueueName:   "test-queue",
			Priority:    10,
			Payload:     `{"test": "job1"}`,
			AvailableAt: time.Now().UTC(),
			MaxAttempts: 5,
		},
		{
			QueueName:   "high-priority",
			Priority:    20,
			Payload:     `{"test": "job2"}`,
			AvailableAt: time.Now(),
			MaxAttempts: 5,
		},
		{
			QueueName:   "test-queue",
			Priority:    5,
			Payload:     `{"test": "job3"}`,
			AvailableAt: time.Now(),
			MaxAttempts: 5,
		},
	}

	for _, job := range jobs {
		_, err := engine.Insert(&job)
		require.NoError(t, err, "插入测试任务失败")
	}
}

// 辅助函数：准备被锁定的任务
func prepareLockedJob(t *testing.T, engine *xorm.Engine, workerID string) int64 {
	job := &JobQueue{
		QueueName:   "test-queue",
		Priority:    10,
		Payload:     `{"test": "locked"}`,
		AvailableAt: time.Now(),
		LeaseUntil:  &[]time.Time{time.Now().Add(30 * time.Second)}[0],
		LockedBy:    &workerID,
		Attempts:    1,
		MaxAttempts: 5,
	}

	_, err := engine.Insert(job)
	require.NoError(t, err, "插入锁定任务失败")
	return job.ID
}

// 辅助函数：准备达到最大尝试次数的任务
func prepareMaxAttemptsJob(t *testing.T, engine *xorm.Engine, workerID string) int64 {
	job := &JobQueue{
		QueueName:   "test-queue",
		Priority:    10,
		Payload:     `{"test": "max-attempts"}`,
		AvailableAt: time.Now(),
		LeaseUntil:  &[]time.Time{time.Now().Add(30 * time.Second)}[0],
		LockedBy:    &workerID,
		Attempts:    5,
		MaxAttempts: 5,
	}

	_, err := engine.Insert(job)
	require.NoError(t, err, "插入最大尝试次数任务失败")
	return job.ID
}

// 辅助函数：准备过期的任务
func prepareExpiredJob(t *testing.T, engine *xorm.Engine, workerID string) int64 {
	expiredTime := time.Now().Add(-10 * time.Second)
	job := &JobQueue{
		QueueName:   "test-queue",
		Priority:    10,
		Payload:     `{"test": "expired"}`,
		AvailableAt: time.Now(),
		LeaseUntil:  &expiredTime,
		LockedBy:    &workerID,
		Attempts:    1,
	}

	_, err := engine.Insert(job)
	require.NoError(t, err, "插入过期任务失败")
	return job.ID
}

// 辅助函数：准备过期的租约
func prepareExpiredLeases(t *testing.T, engine *xorm.Engine) {
	expiredTime := time.Now().Add(-10 * time.Second)
	workerID := "worker-1"

	jobs := []JobQueue{
		{
			QueueName:   "test-queue",
			Priority:    10,
			Payload:     `{"test": "expired-lease-1"}`,
			AvailableAt: time.Now(),
			LeaseUntil:  &expiredTime,
			LockedBy:    &workerID,
		},
		{
			QueueName:   "test-queue",
			Priority:    5,
			Payload:     `{"test": "expired-lease-2"}`,
			AvailableAt: time.Now(),
			LeaseUntil:  &expiredTime,
			LockedBy:    &workerID,
		},
	}

	for _, job := range jobs {
		_, err := engine.Insert(&job)
		require.NoError(t, err, "插入过期租约任务失败")
	}
}

// 辅助函数：准备普通任务
func prepareNormalJob(t *testing.T, engine *xorm.Engine) int64 {
	job := &JobQueue{
		QueueName:   "test-queue",
		Priority:    10,
		Payload:     `{"test": "normal"}`,
		AvailableAt: time.Now(),
	}

	_, err := engine.Insert(job)
	require.NoError(t, err, "插入普通任务失败")
	return job.ID
}

// 测试JSON序列化
func TestJobQueue_JSONSerialization(t *testing.T) {
	now := time.Now()
	uniqueKey := "test-key"
	workerID := "worker-1"

	job := &JobQueue{
		ID:          123,
		QueueName:   "test-queue",
		Priority:    10,
		UniqueKey:   &uniqueKey,
		Payload:     `{"test": "data"}`,
		Attempts:    1,
		MaxAttempts: 3,
		AvailableAt: now,
		LeaseUntil:  &now,
		LockedBy:    &workerID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// 测试序列化
	data, err := json.Marshal(job)
	require.NoError(t, err, "JSON序列化失败")

	// 测试反序列化
	var decodedJob JobQueue
	err = json.Unmarshal(data, &decodedJob)
	require.NoError(t, err, "JSON反序列化失败")

	// 验证字段
	assert.Equal(t, job.ID, decodedJob.ID)
	assert.Equal(t, job.QueueName, decodedJob.QueueName)
	assert.Equal(t, job.Priority, decodedJob.Priority)
	assert.Equal(t, job.UniqueKey, decodedJob.UniqueKey)
	assert.Equal(t, job.Payload, decodedJob.Payload)
	assert.Equal(t, job.Attempts, decodedJob.Attempts)
	assert.Equal(t, job.MaxAttempts, decodedJob.MaxAttempts)
}

// 测试并发安全性
func TestClient_Concurrency(t *testing.T) {
	engine := initTestDB(t)
	defer engine.Close()

	client := NewClient(engine)
	ctx := context.Background()

	// 准备多个任务
	for i := 0; i < 10; i++ {
		req := EnqueueRequest{
			QueueName:   "concurrency-test",
			Priority:    i,
			Payload:     `{"index": ` + string(rune(i+'0')) + `}`,
			MaxAttempts: 5,
		}
		_, _, err := client.Enqueue(ctx, req)
		require.NoError(t, err, "入队失败")
	}

	// 并发出队
	workerCount := 5
	results := make(chan *JobQueue, 10) // 缓冲区足够大以容纳所有任务
	errors := make(chan error, workerCount)
	done := make(chan bool, workerCount)

	for i := 0; i < workerCount; i++ {
		go func(workerID string) {
			defer func() {
				fmt.Printf("\nworker %s exit.\n\n", workerID)
			}()
			// 每个 worker 尝试取多个任务，直到取不到为止
			for {
				req := DequeueRequest{
					Queues:       []string{"concurrency-test"},
					LeaseSeconds: 30,
					WorkerID:     workerID,
				}

				job, err := client.Dequeue(ctx, req)
				if err != nil {
					if IsRetryError(err) {
						continue
					}
					errors <- err
					return
				}
				if job != nil {
					results <- job
				} else {
					// 取不到任务是正常情况，正常退出
					done <- true
					return
				}
			}
		}("worker-" + string(rune(i+'0')))
	}

	// 收集结果，直到所有 worker 完成或超时
	receivedJobs := 0
	receivedErrors := 0
	completedWorkers := 0

	// 先等待所有 worker 完成
	for completedWorkers < workerCount {
		select {
		case job := <-results:
			assert.NotNil(t, job, "应该收到任务")
			receivedJobs++
		case err := <-errors:
			assert.NoError(t, err, "不应该有错误")
			receivedErrors++
			completedWorkers++
		case <-done:
			completedWorkers++
		case <-time.After(5 * time.Second):
			t.Fatal("测试超时：等待 worker 完成")
		}
	}

	// 继续读取剩余的任务，直到超时或读取完所有任务
	timeout := time.After(2 * time.Second)
readLoop:
	for receivedJobs < 10 {
		select {
		case job := <-results:
			assert.NotNil(t, job, "应该收到任务")
			receivedJobs++
		case <-timeout:
			// 超时，停止读取
			break readLoop
		}
	}

	// 验证结果
	assert.Greater(t, receivedJobs, 0, "应该有一些worker成功获取任务")
	assert.Equal(t, receivedJobs, 10, "应该收到所有10个任务")
	assert.Equal(t, receivedErrors, 0, "不应该有错误")
	// fmt.Printf("receivedJobs=%d receivedErrors=%d\n", receivedJobs, receivedErrors)
	// time.Sleep(10 * time.Second)
}

func TestRetryError(t *testing.T) {
	// 测试 RetryError 的创建和错误信息
	retryErr := &RetryError{Message: "测试重试错误"}
	if retryErr.Error() != "测试重试错误" {
		t.Errorf("期望错误信息为 '测试重试错误'，但得到 '%s'", retryErr.Error())
	}

	// 测试 IsRetryError 函数
	if !IsRetryError(retryErr) {
		t.Error("IsRetryError 应该返回 true")
	}

	// 测试非重试错误
	normalErr := fmt.Errorf("普通错误")
	if IsRetryError(normalErr) {
		t.Error("IsRetryError 应该返回 false")
	}

	// 测试 nil 错误
	if IsRetryError(nil) {
		t.Error("IsRetryError 对 nil 应该返回 false")
	}
}
