package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	// "github.com/cometwk/lib/pkg/log"
	log2 "github.com/cometwk/lib/pkg/log"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/queue"
	"github.com/sirupsen/logrus"
	"xorm.io/xorm"
)

var log = logrus.WithField("module", "email")

// TaskPayload 定义任务载荷结构
type TaskPayload struct {
	ID       int    `json:"id"`
	Type     string `json:"type"`
	Message  string `json:"message"`
	Priority int    `json:"priority"`
	Data     any    `json:"data"`
}

// QueueExample 演示队列的完整使用流程
type QueueExample struct {
	client   *queue.Client
	engine   *xorm.Engine
	producer *Producer
	consumer *Consumer
	cancel   context.CancelFunc
	wg       sync.WaitGroup
}

// Producer 任务生产者
type Producer struct {
	client *queue.Client
	ctx    context.Context
}

// Consumer 任务消费者
type Consumer struct {
	workers []*queue.Worker
	ctx     context.Context
}

func initTestDB() *xorm.Engine {
	orm.InitDefaultDB()
	engine := orm.MustDB()
	log2.InitDebug()
	orm.SetLogger(log)

	// read job_queue.sql and execute it
	sql, err := os.ReadFile("../job_queue.sql")
	if err != nil {
		log.Fatalf("读取 job_queue.sql 失败: %v", err)
	}
	_, err = engine.Exec(string(sql))
	if err != nil {
		log.Fatalf("执行 job_queue.sql 失败: %v", err)
	}

	// 清理测试数据
	_, err = engine.Exec("DELETE FROM job_queue")
	if err != nil {
		log.Fatalf("清理 job_queue 表失败: %v", err)
	}

	_, err = engine.Exec("DELETE FROM job_history")
	if err != nil {
		log.Fatalf("清理 job_queue 表失败: %v", err)
	}

	return engine
}

// NewQueueExample 创建队列示例实例
func NewQueueExample() (*QueueExample, error) {
	engine := orm.MustDB()

	// 创建队列客户端
	client := queue.NewClient(engine)

	ctx, cancel := context.WithCancel(context.Background())

	return &QueueExample{
		client:   client,
		engine:   engine,
		producer: &Producer{client: client, ctx: ctx},
		consumer: &Consumer{workers: make([]*queue.Worker, 0), ctx: ctx},
		cancel:   cancel,
	}, nil
}

// StartProducer 启动任务生产者
func (qe *QueueExample) StartProducer(c chan<- os.Signal) {
	qe.wg.Add(1)
	go func() {
		defer qe.wg.Done()
		qe.producer.run()
	}()
}

// StartConsumer 启动任务消费者
func (qe *QueueExample) StartConsumer() {
	// 创建任务处理器（事务模式）
	handler := func(ctx context.Context, job *queue.JobQueue) (any, error) {
		// 1. 创建事务
		session := qe.engine.NewSession().Context(ctx)
		defer session.Close()

		err := session.Begin()
		if err != nil {
			return nil, fmt.Errorf("开启事务失败: %w", err)
		}

		// 2. 解析任务载荷
		var task TaskPayload
		if err := json.Unmarshal([]byte(job.Payload), &task); err != nil {
			session.Rollback()
			return nil, fmt.Errorf("解析任务载荷失败: %w", err)
		}

		log.Printf("🔄 开始处理任务: ID=%d, Type=%s, Message=%s", task.ID, task.Type, task.Message)

		// 3. 执行任务处理逻辑
		var result any
		var handlerErr error
		switch task.Type {
		case "email":
			result, handlerErr = qe.handleEmailTask(ctx, task)
		case "image":
			result, handlerErr = qe.handleImageTask(ctx, task)
		case "report":
			result, handlerErr = qe.handleReportTask(ctx, task)
		case "slow":
			result, handlerErr = qe.handleSlowTask(ctx, task)
		case "error":
			result, handlerErr = qe.handleErrorTask(ctx, task)
		default:
			result, handlerErr = qe.handleDefaultTask(ctx, task)
		}

		// 4. 根据处理结果调用 Ack 或 Nack
		if handlerErr != nil {
			// 处理失败，调用 Nack
			errJSON, _ := json.Marshal(map[string]any{"error": handlerErr.Error()})
			nackErr := qe.client.Nack(ctx, session, job, 2, 0.2, errJSON)
			if nackErr != nil {
				session.Rollback()
				return nil, fmt.Errorf("Nack 失败: %w", nackErr)
			}
			// 提交事务（包含 Nack）
			if err := session.Commit(); err != nil {
				return nil, fmt.Errorf("提交事务失败: %w", err)
			}
			return nil, handlerErr
		}

		// 处理成功，调用 Ack
		resultJSON, err := json.Marshal(result)
		if err != nil {
			session.Rollback()
			return nil, fmt.Errorf("序列化结果失败: %w", err)
		}

		err = qe.client.Ack(ctx, session, job, resultJSON)
		if err != nil {
			session.Rollback()
			return nil, fmt.Errorf("Ack 失败: %w", err)
		}

		// 5. 提交事务（包含 Ack）
		if err := session.Commit(); err != nil {
			return nil, fmt.Errorf("提交事务失败: %w", err)
		}

		log.Printf("✅ 任务处理完成: ID=%d, Type=%s", task.ID, task.Type)
		return result, nil
	}

	// 创建2个worker，每个worker有3个并发
	for i := 1; i <= 2; i++ {
		// 配置Worker选项
		options := queue.Options{
			Queues:          []string{"high", "default", "low", "email", "image", "report", "slow", "error"},
			WorkerID:        fmt.Sprintf("example-worker-%d", i),
			Concurrency:     3,
			LeaseSeconds:    30,
			HeartbeatEvery:  10 * time.Second,
			DequeueEvery:    200 * time.Millisecond,
			ShutdownTimeout: 15 * time.Second,
			BaseBackoffSec:  2,
			Jitter:          0.2,
		}

		// 创建Worker
		worker := queue.NewWorker(qe.client, options, handler)
		qe.consumer.workers = append(qe.consumer.workers, worker)

		// 启动Worker
		workerID := i // 捕获循环变量
		qe.wg.Add(1)
		go func(wID int, w *queue.Worker) {
			defer qe.wg.Done()
			log.Printf("🚀 启动Worker %d", wID)
			w.Start()

			// 等待取消信号
			<-qe.consumer.ctx.Done()
			log.Printf("🛑 正在停止Worker %d...", wID)
			w.Stop()
			log.Printf("✅ Worker %d已停止", wID)
		}(workerID, worker)
	}
}

// Stop 停止所有组件
func (qe *QueueExample) Stop() {
	log.Println("🛑 正在停止队列示例...")
	qe.cancel()
	qe.wg.Wait()
	log.Println("✅ 队列示例已停止")
}

// Producer 方法

func (p *Producer) run() {
	log.Println("🚀 启动任务生产者...")

	const Seconds = 2
	ticker := time.NewTicker(Seconds * time.Second)
	defer ticker.Stop()

	taskID := 1

	for i := 0; i < 100; i++ {
		select {
		case <-p.ctx.Done():
			log.Println("✅ 生产者已停止")
			return
		case <-ticker.C:
			// 生产不同类型的任务
			tasks := p.generateTasks(&taskID)
			for _, task := range tasks {
				if err := p.enqueueTask(task); err != nil {
					log.Printf("❌ 入队任务失败: %v", err)
				}
			}
			log.Printf("✅ 生产了 %d 个任务", len(tasks))
		}
	}
}

func (p *Producer) generateTasks(taskID *int) []TaskPayload {
	tasks := []TaskPayload{
		{
			ID:       *taskID,
			Type:     "email",
			Message:  fmt.Sprintf("发送邮件通知 #%d", *taskID),
			Priority: 10,
			Data:     map[string]any{"to": "user@example.com", "subject": "测试邮件"},
		},
		{
			ID:       *taskID + 1,
			Type:     "image",
			Message:  fmt.Sprintf("处理图片 #%d", *taskID+1),
			Priority: 5,
			Data:     map[string]any{"url": "https://example.com/image.jpg", "resize": "100x100"},
		},
		{
			ID:       *taskID + 2,
			Type:     "report",
			Message:  fmt.Sprintf("生成报告 #%d", *taskID+2),
			Priority: 15,
			Data:     map[string]any{"type": "monthly", "format": "pdf"},
		},
		// {
		// 	ID:       *taskID + 3,
		// 	Type:     "slow",
		// 	Message:  fmt.Sprintf("慢任务 #%d", *taskID+3),
		// 	Priority: 1,
		// 	Data:     map[string]any{"duration": "10s"},
		// },
	}

	// 偶尔添加一些特殊任务
	if *taskID%10 == 0 {
		tasks = append(tasks, TaskPayload{
			ID:       *taskID + 3,
			Type:     "slow",
			Message:  fmt.Sprintf("慢任务 #%d", *taskID+3),
			Priority: 1,
			Data:     map[string]any{"duration": "10s"},
		})
	}

	if *taskID%15 == 0 {
		tasks = append(tasks, TaskPayload{
			ID:       *taskID + 4,
			Type:     "error",
			Message:  fmt.Sprintf("错误任务 #%d", *taskID+4),
			Priority: 20,
			Data:     map[string]any{"simulate_error": true},
		})
	}

	*taskID += len(tasks)
	return tasks
}

func (p *Producer) enqueueTask(task TaskPayload) error {
	payloadBytes, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("序列化任务失败: %w", err)
	}

	// 根据优先级选择队列
	queueName := "default"
	if task.Priority >= 15 {
		queueName = "high"
	} else if task.Priority <= 5 {
		queueName = "low"
	}

	// 采用 type 当队列名称
	queueName = task.Type

	// 对于某些任务类型使用唯一键确保幂等性
	var uniqueKey *string
	if task.Type == "report" {
		key := fmt.Sprintf("report-%s-%d", task.Type, task.ID)
		uniqueKey = &key
	}

	req := queue.EnqueueRequest{
		QueueName:   queueName,
		Priority:    task.Priority,
		UniqueKey:   uniqueKey,
		Payload:     string(payloadBytes),
		MaxAttempts: 3,
		Delay:       0,
	}

	jobID, existed, err := p.client.Enqueue(p.ctx, req)
	if err != nil {
		return fmt.Errorf("入队失败: %w", err)
	}

	if existed {
		log.Printf("📝 任务已存在: ID=%d, JobID=%d, Queue=%s", task.ID, jobID, queueName)
	} else {
		log.Printf("✅ 任务入队成功: ID=%d, JobID=%d, Queue=%s, Priority=%d", task.ID, jobID, queueName, task.Priority)
	}

	return nil
}

// Consumer 任务处理方法

func (qe *QueueExample) handleEmailTask(ctx context.Context, task TaskPayload) (any, error) {
	// 模拟发送邮件
	log.Printf("📧 发送邮件: %s", task.Message)

	select {
	case <-time.After(500 * time.Millisecond):
		return map[string]any{
			"status":    "sent",
			"timestamp": time.Now(),
			"recipient": task.Data,
		}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (qe *QueueExample) handleImageTask(ctx context.Context, task TaskPayload) (any, error) {
	// 模拟图片处理
	log.Printf("🖼️ 处理图片: %s", task.Message)

	select {
	case <-time.After(1 * time.Second):
		return map[string]any{
			"status":     "processed",
			"timestamp":  time.Now(),
			"image_info": task.Data,
		}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (qe *QueueExample) handleReportTask(ctx context.Context, task TaskPayload) (any, error) {
	// 模拟生成报告
	log.Printf("📊 生成报告: %s", task.Message)

	select {
	case <-time.After(2 * time.Second):
		return map[string]any{
			"status":      "generated",
			"timestamp":   time.Now(),
			"report_path": fmt.Sprintf("/reports/report_%d.pdf", task.ID),
			"metadata":    task.Data,
		}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (qe *QueueExample) handleSlowTask(ctx context.Context, task TaskPayload) (any, error) {
	// 模拟长时间运行的任务
	log.Printf("🐌 执行慢任务: %s", task.Message)

	// 使用心跳机制处理长时间任务
	duration := 10 * time.Second
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	start := time.Now()
	for elapsed := time.Duration(0); elapsed < duration; elapsed = time.Since(start) {
		select {
		case <-ctx.Done():
			log.Printf("❌ 慢任务被取消: %s", task.Message)
			return nil, ctx.Err()
		case <-ticker.C:
			progress := float64(elapsed) / float64(duration) * 100
			log.Printf("⏳ 慢任务进度: %.1f%% - %s", progress, task.Message)
		}
	}

	return map[string]any{
		"status":    "completed",
		"timestamp": time.Now(),
		"duration":  duration.String(),
	}, nil
}

func (qe *QueueExample) handleErrorTask(ctx context.Context, task TaskPayload) (any, error) {
	// 模拟错误任务
	log.Printf("💥 执行错误任务: %s", task.Message)

	select {
	case <-time.After(200 * time.Millisecond):
		return nil, fmt.Errorf("模拟任务执行失败: %s", task.Message)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (qe *QueueExample) handleDefaultTask(ctx context.Context, task TaskPayload) (any, error) {
	// 默认任务处理
	log.Printf("🔧 处理默认任务: %s", task.Message)

	select {
	case <-time.After(300 * time.Millisecond):
		return map[string]any{
			"status":    "processed",
			"timestamp": time.Now(),
			"type":      task.Type,
		}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// 监控和状态查询功能

// GetQueueStats 获取队列统计信息
func (qe *QueueExample) GetQueueStats(ctx context.Context) (map[string]any, error) {
	engine := qe.engine

	// 获取各队列的任务数量
	queueStats := make(map[string]int64)
	queues := []string{"high", "default", "low"}

	for _, q := range queues {
		count, err := engine.Context(ctx).Where("queue_name = ?", q).Count(new(queue.JobQueue))
		if err != nil {
			return nil, fmt.Errorf("查询队列 %s 统计失败: %w", q, err)
		}
		queueStats[q] = count
	}

	// 获取总任务数
	totalJobs, err := engine.Context(ctx).Count(new(queue.JobQueue))
	if err != nil {
		return nil, fmt.Errorf("查询总任务数失败: %w", err)
	}

	// 获取锁定任务数
	lockedJobs, err := engine.Context(ctx).Where("lease_until IS NOT NULL").Count(new(queue.JobQueue))
	if err != nil {
		return nil, fmt.Errorf("查询锁定任务数失败: %w", err)
	}

	// 获取历史任务统计
	completedJobs, err := engine.Context(ctx).Where("status_final = ?", "completed").Count(new(queue.JobHistory))
	if err != nil {
		return nil, fmt.Errorf("查询完成任务数失败: %w", err)
	}

	deadLetterJobs, err := engine.Context(ctx).Where("status_final = ?", "dead_letter").Count(new(queue.JobHistory))
	if err != nil {
		return nil, fmt.Errorf("查询死信任务数失败: %w", err)
	}

	return map[string]any{
		"queue_stats":      queueStats,
		"total_jobs":       totalJobs,
		"locked_jobs":      lockedJobs,
		"completed_jobs":   completedJobs,
		"dead_letter_jobs": deadLetterJobs,
		"timestamp":        time.Now(),
	}, nil
}

// PrintStats 打印队列统计信息
func (qe *QueueExample) PrintStats() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	stats, err := qe.GetQueueStats(ctx)
	if err != nil {
		log.Printf("❌ 获取统计信息失败: %v", err)
		return
	}

	log.Println("📊 ===== 队列统计信息 =====")
	if queueStats, ok := stats["queue_stats"].(map[string]int64); ok {
		for queue, count := range queueStats {
			log.Printf("📦 队列 %s: %d 个任务", queue, count)
		}
	}
	log.Printf("📈 总任务数: %v", stats["total_jobs"])
	log.Printf("🔒 锁定任务数: %v", stats["locked_jobs"])
	log.Printf("✅ 完成任务数: %v", stats["completed_jobs"])
	log.Printf("💀 死信任务数: %v", stats["dead_letter_jobs"])
	log.Println("📊 ========================")
}

// StartStatsMonitor 启动统计监控
func (qe *QueueExample) StartStatsMonitor() {
	qe.wg.Add(1)
	go func() {
		defer qe.wg.Done()

		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-qe.consumer.ctx.Done():
				return
			case <-ticker.C:
				qe.PrintStats()
			}
		}
	}()
}

// StartCleaner 启动过期任务清理器
func (qe *QueueExample) StartCleaner() {
	qe.wg.Add(1)
	go func() {
		defer qe.wg.Done()

		// 每 5 秒检查一次，方便测试观察效果
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		log.Println("🧹 启动过期任务清理器...")

		// 设置不打印 SQL 日志, 避免日志风暴
		ctx := orm.WithReqID(context.Background(), orm.SKIP_LOG_SQL)

		for {
			select {
			case <-qe.consumer.ctx.Done():
				log.Println("🛑 清理器已停止")
				return
			case <-ticker.C:
				affected, err := qe.client.RecoverExpiredLeases(ctx, 100)
				if err != nil {
					log.Printf("❌ 恢复过期租约失败: %v", err)
				} else if affected > 0 {
					log.Printf("♻️ 成功恢复了 %d 个过期任务", affected)
				}
			}
		}
	}()
}

// 主函数演示

type ExampleOptions struct {
	Consumer bool
	Producer bool
	Stats    bool
	Cleaner  bool
}

// RunExample 运行完整示例
// 如果提供了 context，会在 context 取消时停止；否则等待系统信号
func RunExample(ctx context.Context, options ExampleOptions) {
	log2.InitDebug()
	orm.SetLogger(log)

	example, err := NewQueueExample()
	if err != nil {
		log.Fatalf("❌ 创建队列示例失败: %v", err)
	}

	// 设置优雅关闭
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// 启动组件
	if options.Producer {
		example.StartProducer(sigChan)
	}
	if options.Consumer {
		example.StartConsumer()
	}
	if options.Cleaner {
		example.StartCleaner()
	}
	if options.Stats {
		example.StartStatsMonitor()
	}

	log.Println("✅ 所有组件已启动，按 Ctrl+C 停止...")

	// 等待停止信号
	var cancelChan <-chan struct{}
	if ctx != nil {
		cancelChan = ctx.Done()
	}

	if cancelChan != nil {
		// 测试模式：等待 context 取消或信号
		select {
		case <-sigChan:
			log.Println("📨 收到系统信号，准备停止...")
		case <-cancelChan:
			log.Println("📨 Context 已取消，准备停止...")
		}
	} else {
		// 生产模式：只等待信号
		<-sigChan
		log.Println("📨 收到系统信号，准备停止...")
	}

	// 优雅关闭
	example.Stop()

	// 最终统计
	log.Println("📊 最终统计信息:")
	example.PrintStats()

	log.Println("🎭 队列演示结束")
}

// func main() {
// 	example, err := NewQueueExample()
// 	if err != nil {
// 		log.Fatalf("❌ 创建队列示例失败: %v", err)
// 	}
// 	RunExample(context.Background(), example)
// }
