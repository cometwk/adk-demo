package main

import (
	"os"

	"github.com/cometwk/base"
	"github.com/cometwk/base/cmd"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/cometwk/serve/biz"
	"github.com/cometwk/serve/pkg/s3"
	"github.com/cometwk/serve/routes/admin"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// // go:embed web/dist
// var dist embed.FS

func main() {

	if len(os.Args) > 1 {
		// 运行工具命令
		cmd.Main()
		return
	}

	initDB()

	server := serve.NewEchoServer(func(engine *echo.Echo) error {
		// // 将 executor 设置到 engine 中，之后每一个 echo handler 都要可以获取和使用
		// engine.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		// 	return func(c echo.Context) error {
		// 		// c.Set("executor", executor)
		// 		return next(c)
		// 	}
		// })

		engine.Use(middleware.CORS())

		group := base.InitEcho(engine)
		admin.AdminAttach(group)

		return nil
	}, nil)

	server.Start()
}

func initDB() {
	// 优先注册任务函数, 否则数据库中的任务无法加载
	// tasks.RegisterTasks()

	// 初始化数据库
	orm.InitDefaultDB()
	base.InitDB()
	biz.InitDB()

	// 初始化 s3
	s3.Init()

}
