package queue

import (
	"context"
	"testing"
	"time"
)

// 测试客户端创建
func TestExample(t *testing.T) {
	// 创建带超时的 context，运行 20 秒后自动停止
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// 在 goroutine 中运行示例
	done := make(chan struct{})
	go func() {
		defer close(done)
		RunExample(ctx)
	}()

	// 等待完成或超时
	select {
	case <-done:
		t.Log("✅ 示例运行完成")
	case <-time.After(25 * time.Second):
		t.Log("⏰ 测试超时，但示例可能仍在运行")
		cancel() // 确保取消
	}
}
