package bean

// import (
// 	"context"
// 	"encoding/json"
// 	"fmt"
// 	"time"

// 	"github.com/cometwk/lib/pkg/intercept"
// 	"github.com/cometwk/lib/pkg/queue"
// )

// type JobConfig struct {
// 	QueueName   string        // 队列名称
// 	Priority    int           // 值越大，优先级越高
// 	MaxAttempts int           // 最大尝试次数
// 	Delay       time.Duration // 延迟生效时间，默认 0 表示立即生效
// }

// type JobInput[T comparable] struct {
// 	UniqueKey *string `json:"unique_key"` // 幂等键，为 NULL 时表示不进行去重
// 	Payload   T       `json:"payload"`
// }

// type JobOutput struct {
// 	JobID int64 `json:"job_id"`
// }

// func RegisterBeanJobNode[T comparable](info MethodNodeInfo, opts JobConfig) {
// 	method := func(ctx context.Context, input JobInput[T]) (*JobOutput, error) {
// 		c := intercept.CommandContextFrom(ctx)
// 		session := c.SqlSession() // 同一个事务中

// 		req := queue.EnqueueRequest{
// 			QueueName:   opts.QueueName,
// 			Priority:    opts.Priority,
// 			MaxAttempts: opts.MaxAttempts,
// 			Delay:       opts.Delay,
// 			UniqueKey:   input.UniqueKey,
// 		}

// 		// payload to json string
// 		payload, err := json.Marshal(input.Payload)
// 		if err != nil {
// 			return nil, err
// 		}
// 		req.Payload = string(payload)

// 		jobID, existed, err := queue.Insert(session, req)
// 		if err != nil {
// 			return nil, err
// 		}
// 		if existed {
// 			return nil, fmt.Errorf("job already exists: %d", jobID)
// 		}
// 		return &JobOutput{JobID: jobID}, nil
// 	}
// 	RegisterNode(info, method)
// }
