package bean_test

// import (
// 	"context"
// 	"testing"
// 	"time"

// 	"github.com/cometwk/lib/pkg/bean"
// 	"github.com/cometwk/lib/pkg/intercept"
// 	"github.com/cometwk/lib/pkg/orm"
// 	"github.com/cometwk/lib/pkg/queue"
// 	testmock "github.com/cometwk/lib/pkg/testutil/mock"
// 	"github.com/sirupsen/logrus"
// 	"github.com/stretchr/testify/assert"
// 	"xorm.io/xorm"
// )

// // 测试用的作业载荷结构
// type TestJobPayload struct {
// 	Message  string `json:"message"`
// 	Count    int    `json:"count"`
// 	IsActive bool   `json:"is_active"`
// }

// // 测试用的作业输入结构
// type TestJobInput struct {
// 	UniqueKey *string        `json:"unique_key"`
// 	Payload   TestJobPayload `json:"payload"`
// }

// var testDB *xorm.Engine

// func initTestDB() {
// 	testDB = orm.InitDefaultDB()
// 	// 同步作业队列表
// 	// testDB.Sync2(&queue.JobQueue{})
// 	testDB.SetLogger(orm.NewXormLogrus(logrus.WithField("test", "test")))
// }

// func resetTestDB(t *testing.T) {
// 	session := testDB.NewSession()
// 	defer session.Close()

// 	// 清空作业队列表
// 	_, err := session.Exec("DELETE FROM job_queue")
// 	assert.NoError(t, err)
// }

// func TestRegisterBeanJobNode(t *testing.T) {
// 	initTestDB()

// 	// 创建模拟的 CommandContext
// 	logger := logrus.NewEntry(logrus.New())
// 	mockCtx := testmock.NewMockCommandContext(logger)
// 	mockCtx.On("Logger").Return(logger)
// 	mockCtx.On("SqlSession").Return(testDB.NewSession())

// 	ctx := intercept.WithCommandContext(context.Background(), mockCtx)

// 	// 首先注册 Bean
// 	bean.RegisterBean(bean.BeanNodeInfo{
// 		Bean:        "testJob",
// 		Name:        "testJob",
// 		Description: "测试作业Bean",
// 	})

// 	// 注册测试作业节点
// 	jobConfig := bean.JobConfig{
// 		QueueName:   "test_queue",
// 		Priority:    10,
// 		MaxAttempts: 3,
// 		Delay:       5 * time.Second,
// 	}

// 	bean.RegisterBeanJobNode[TestJobPayload](bean.MethodNodeInfo{
// 		Bean:        "testJob",
// 		Method:      "Enqueue",
// 		Name:        "Enqueue",
// 		Description: "测试作业入队",
// 	}, jobConfig)

// 	t.Run("enqueue_job_success", func(t *testing.T) {
// 		resetTestDB(t)

// 		// 准备测试数据
// 		uniqueKey := "test_unique_key_1"
// 		payload := TestJobPayload{
// 			Message:  "测试作业消息",
// 			Count:    42,
// 			IsActive: true,
// 		}

// 		input := TestJobInput{
// 			UniqueKey: &uniqueKey,
// 			Payload:   payload,
// 		}

// 		// 执行作业入队
// 		output, err := bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.NoError(t, err)
// 		assert.NotNil(t, output)

// 		// 验证输出
// 		jobOutput, ok := output.(map[string]any)
// 		assert.True(t, ok, "输出应该是 map[string]any 类型")
// 		assert.Contains(t, jobOutput, "JobID", "输出应该包含 JobID 字段")

// 		jobID, ok := jobOutput["JobID"].(int64)
// 		assert.True(t, ok, "JobID 应该是 int64 类型")
// 		assert.Greater(t, jobID, int64(0), "作业ID应该大于0")

// 		// 验证数据库中的记录
// 		session := testDB.NewSession()
// 		defer session.Close()

// 		var jobCount int64
// 		jobCount, err = session.Where("id = ?", jobID).Count(queue.JobQueue{})
// 		assert.NoError(t, err)
// 		assert.Equal(t, int64(1), jobCount, "应该只有一条记录")
// 	})

// 	t.Run("enqueue_job_without_unique_key", func(t *testing.T) {
// 		resetTestDB(t)

// 		// 准备测试数据（没有唯一键）
// 		payload := TestJobPayload{
// 			Message:  "无唯一键的作业",
// 			Count:    100,
// 			IsActive: false,
// 		}

// 		input := TestJobInput{
// 			UniqueKey: nil, // 没有唯一键
// 			Payload:   payload,
// 		}

// 		// 执行作业入队
// 		output, err := bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.NoError(t, err)
// 		assert.NotNil(t, output)

// 		// 验证输出
// 		jobOutput, ok := output.(map[string]any)
// 		assert.True(t, ok, "输出应该是 map[string]any 类型")
// 		assert.Contains(t, jobOutput, "JobID", "输出应该包含 JobID 字段")

// 		jobID, ok := jobOutput["JobID"].(int64)
// 		assert.True(t, ok, "JobID 应该是 int64 类型")
// 		assert.Greater(t, jobID, int64(0), "作业ID应该大于0")
// 	})

// 	t.Run("enqueue_duplicate_job", func(t *testing.T) {
// 		resetTestDB(t)

// 		// 准备测试数据
// 		uniqueKey := "duplicate_key"
// 		payload := TestJobPayload{
// 			Message:  "重复的作业",
// 			Count:    1,
// 			IsActive: true,
// 		}

// 		input := TestJobInput{
// 			UniqueKey: &uniqueKey,
// 			Payload:   payload,
// 		}

// 		// 第一次入队
// 		output1, err := bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.NoError(t, err)
// 		assert.NotNil(t, output1)

// 		// 第二次入队（应该失败，因为唯一键重复）
// 		_, err = bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.Error(t, err, "重复的唯一键应该导致错误")
// 		assert.Contains(t, err.Error(), "job already exists", "错误消息应该包含 'job already exists'")
// 	})

// 	t.Run("enqueue_job_with_delay", func(t *testing.T) {
// 		resetTestDB(t)

// 		// 准备测试数据
// 		uniqueKey := "delayed_job"
// 		payload := TestJobPayload{
// 			Message:  "延迟作业",
// 			Count:    999,
// 			IsActive: true,
// 		}

// 		input := TestJobInput{
// 			UniqueKey: &uniqueKey,
// 			Payload:   payload,
// 		}

// 		// 记录开始时间
// 		startTime := time.Now()

// 		// 执行作业入队
// 		output, err := bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.NoError(t, err)
// 		assert.NotNil(t, output)

// 		// 验证输出
// 		jobOutput, ok := output.(map[string]any)
// 		assert.True(t, ok, "输出应该是 map[string]any 类型")
// 		assert.Contains(t, jobOutput, "JobID", "输出应该包含 JobID 字段")

// 		jobID, ok := jobOutput["JobID"].(int64)
// 		assert.True(t, ok, "JobID 应该是 int64 类型")

// 		// 验证数据库中的记录
// 		session := testDB.NewSession()
// 		defer session.Close()

// 		var job queue.JobQueue

// 		has, err := session.Where("id = ?", jobID).Get(&job)
// 		assert.NoError(t, err)
// 		assert.True(t, has, "作业应该存在于数据库中")

// 		// 验证延迟时间设置
// 		expectedAvailableAt := startTime.Add(5 * time.Second)
// 		assert.True(t, job.AvailableAt.After(expectedAvailableAt.Add(-time.Second)),
// 			"可用时间应该接近预期延迟时间")
// 		assert.True(t, job.AvailableAt.Before(expectedAvailableAt.Add(time.Second)),
// 			"可用时间不应该超过预期延迟时间太多")

// 		// 验证其他字段
// 		assert.Equal(t, "test_queue", job.QueueName)
// 		assert.Equal(t, 10, job.Priority)
// 		assert.Equal(t, 3, job.MaxAttempts)
// 		assert.Equal(t, uniqueKey, *job.UniqueKey)
// 	})

// 	t.Run("enqueue_job_with_high_priority", func(t *testing.T) {
// 		resetTestDB(t)

// 		// 准备测试数据
// 		uniqueKey := "high_priority_job"
// 		payload := TestJobPayload{
// 			Message:  "高优先级作业",
// 			Count:    777,
// 			IsActive: true,
// 		}

// 		input := TestJobInput{
// 			UniqueKey: &uniqueKey,
// 			Payload:   payload,
// 		}

// 		// 执行作业入队
// 		output, err := bean.RunNode(ctx, "testJob", "Enqueue", input)
// 		assert.NoError(t, err)
// 		assert.NotNil(t, output)

// 		// 验证输出
// 		jobOutput, ok := output.(map[string]any)
// 		assert.True(t, ok, "输出应该是 map[string]any 类型")
// 		assert.Contains(t, jobOutput, "JobID", "输出应该包含 JobID 字段")

// 		jobID, ok := jobOutput["JobID"].(int64)
// 		assert.True(t, ok, "JobID 应该是 int64 类型")

// 		// 验证数据库中的记录
// 		session := testDB.NewSession()
// 		defer session.Close()

// 		var job queue.JobQueue

// 		has, err := session.Where("id = ?", jobID).Get(&job)
// 		assert.NoError(t, err)
// 		assert.True(t, has, "作业应该存在于数据库中")

// 		// 验证优先级设置
// 		assert.Equal(t, 10, job.Priority, "优先级应该设置为10")
// 		assert.Equal(t, 3, job.MaxAttempts, "最大尝试次数应该设置为3")
// 	})
// }
