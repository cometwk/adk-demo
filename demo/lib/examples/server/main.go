package main

import (
	"github.com/cometwk/lib/pkg/serve"
	"github.com/labstack/echo/v4"
)

func main() {
	// biz.RegisterBiz()

	server := serve.NewEchoServer(func(engine *echo.Echo) error {
		// 将 executor 设置到 engine 中，之后每一个 echo handler 都要可以获取和使用
		engine.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
			return func(c echo.Context) error {
				// c.Set("executor", executor)
				return next(c)
			}
		})
		return nil
	}, nil)

	server.Start()

}
