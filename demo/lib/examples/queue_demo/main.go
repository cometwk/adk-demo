package main

import (
	"log"
	"os"

	"github.com/cometwk/lib/pkg/queue"
)

func main() {
	// 设置日志格式
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// 设置环境变量（如果没有设置的话）
	if os.Getenv("DB_DRIVER") == "" {
		os.Setenv("DB_DRIVER", "sqlite3")
	}
	if os.Getenv("DB_URL") == "" {
		os.Setenv("DB_URL", "file:queue_example.db?cache=shared&mode=rwc")
	}

	// 运行队列示例
	queue.RunExample()
}
