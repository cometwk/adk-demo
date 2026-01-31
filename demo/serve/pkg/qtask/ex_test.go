//go:build local

package qtask

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

func TestEx0(t *testing.T) {
	queueName := "ex0"
	logger := logrus.WithField("module", "ex0").WithField("queue", queueName)
	// 定义一个模拟任务：如果 payload 是 "fail"，则故意报错
	myWorker := func(ctx context.Context, info *TaskInfo) error {
		str, _ := info.Payload.(string)
		fmt.Printf("-> Executing %s (Payload: %s, RetryCount: %d)\n", info.Key, str, info.RetryCount)

		if str == "fail" {
			return errors.New("simulated error")
		}
		if str == "unstable" {
			// 模拟偶尔失败，利用时间戳奇偶
			if time.Now().UnixNano()%2 == 0 {
				return errors.New("random glitch")
			}
		}
		time.Sleep(100 * time.Millisecond) // 模拟耗时
		return nil
	}

	// 初始化：3个Worker，最大重试3次，基础退避1秒
	q := NewMemoryQueue(logger, queueName, 3, 3, myWorker, WithExponentialBackoff(1*time.Second))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 启动队列
	q.Start(ctx)

	// 1. 正常任务
	// q.Add("task-1", "normal")
	// q.Add("task-2", "normal")

	// 2. 失败重试任务 (指数退避演示)
	// 这个任务会重试 3 次，间隔分别是 1s, 2s, 4s，最后被删除
	q.Add("task-fail", "fail")

	// // 3. 去重演示
	// err := q.Add("task-1", "duplicate")
	// if err != nil {
	// 	fmt.Printf("[Test] Add duplicate task-1: %v\n", err)
	// }

	// // 4. 删除演示
	// q.Add("task-del", "normal")
	// q.Remove("task-del") // 立即删除，不应被执行

	// 监控循环
	go func() {
		for i := 0; i < 10; i++ {
			time.Sleep(1 * time.Second)
			// 返回统计信息，和当前任务的ID列表
			fmt.Println("--- Stats:", q.Stats(), "---") // 返回统计信息
			fmt.Println("Current Tasks:", q.GetTasks()) // 返回当前任务的ID列表
		}
		cancel() // 结束测试
		q.Stop()
	}()

	// 阻塞等待结束
	<-ctx.Done()
	time.Sleep(1 * time.Second) // 等待最后的日志输出
	fmt.Println("Done.")

}

func TestEx1(t *testing.T) {
	queueName := "ex1"
	logger := logrus.WithField("module", "ex1").WithField("queue", queueName)
	// 定义一个模拟任务：如果 payload 是 "fail"，则故意报错
	myWorker := func(ctx context.Context, info *TaskInfo) error {
		str, _ := info.Payload.(string)
		fmt.Printf("-> Executing %s (Payload: %s, RetryCount: %d)\n", info.Key, str, info.RetryCount)

		if str == "fail" {
			return errors.New("simulated error")
		}
		if str == "unstable" {
			// 模拟偶尔失败，利用时间戳奇偶
			if time.Now().UnixNano()%2 == 0 {
				return errors.New("random glitch")
			}
		}
		time.Sleep(100 * time.Millisecond) // 模拟耗时
		return nil
	}

	// 初始化：3个Worker，最大重试3次，基础退避1秒
	q := NewMemoryQueue(logger, queueName, 3, 3, myWorker, WithExponentialBackoff(1*time.Second))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 启动队列
	q.Start(ctx)

	// 1. 正常任务
	q.Add("task-1", "normal")
	q.Add("task-2", "normal")

	// 2. 失败重试任务 (指数退避演示)
	// 这个任务会重试 3 次，间隔分别是 1s, 2s, 4s，最后被删除
	q.Add("task-fail", "fail")

	// 3. 去重演示
	err := q.Add("task-1", "duplicate")
	if err != nil {
		fmt.Printf("[Test] Add duplicate task-1: %v\n", err)
	}

	// 4. 删除演示
	q.Add("task-del", "normal")
	q.Remove("task-del") // 立即删除，不应被执行

	// 监控循环
	go func() {
		for i := 0; i < 10; i++ {
			time.Sleep(1 * time.Second)
			// 返回统计信息，和当前任务的ID列表
			fmt.Println("--- Stats:", q.Stats(), "---") // 返回统计信息
			fmt.Println("Current Tasks:", q.GetTasks()) // 返回当前任务的ID列表
		}
		cancel() // 结束测试
		q.Stop()
	}()

	// 阻塞等待结束
	<-ctx.Done()
	time.Sleep(1 * time.Second) // 等待最后的日志输出
	fmt.Println("Done.")
}
