package main

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/lucky-byte/demo/biz"
	"github.com/lucky-byte/demo/routes/demo"
	library "github.com/lucky-byte/demo/routes/library"
	"github.com/lucky-byte/lib/pkg/orm"
	"github.com/lucky-byte/lib/pkg/serve"
)

// // go:embed web/dist
// var dist embed.FS

func main() {

	initDB()

	server := serve.NewEchoServer(func(engine *echo.Echo) error {
		engine.Use(middleware.CORS())

		// group := base.InitEcho(engine)
		group := engine.Group("/admin")

		demo.Attach(group)
		library.Attach(group)

		return nil
	}, nil)

	server.Start()
}

func initDB() {
	// 优先注册任务函数, 否则数据库中的任务无法加载
	// tasks.RegisterTasks()

	// 初始化数据库
	orm.InitDefaultDB()
	// base.InitDB()
	biz.InitDB()

	// 初始化 s3
	// s3.Init()

}
