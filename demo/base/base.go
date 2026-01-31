package base

import (
	"context"
	"fmt"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/event"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/base/model"
	"github.com/cometwk/base/route/admin"
	"github.com/cometwk/base/route/login"
	"github.com/cometwk/base/route/public"
	"github.com/cometwk/lib/pkg/env"
	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

func InitDB() {
	model.InitModels()
	logrus.AddHook(event.NewEventHook(event.FormatJson))

	if env.String("TASK_DIR", "") != "" {
		logrus.Info("启动任务调度")
		if err := task.Startup(); err != nil {
			logrus.WithError(err).Error("启动任务调度失败")
		}
	} else {
		logrus.Info("未配置 TASK_DIR 环境变量，不启动任务调度")
	}
}

func InitEcho(engine *echo.Echo) *echo.Group {
	publicGroup := engine.Group("")
	public.Attach(publicGroup)

	// 根据 Echo 官方最佳实践，使用 Group 限制中间件作用域
	loginGroup := engine.Group("/login")
	loginGroup.Use(ctx.Middleware())
	login.Attach(loginGroup)

	adminGroup := engine.Group("/admin")
	adminGroup.Use(ctx.Middleware())
	adminGroup.Use(auth.Authentication)
	admin.Attach(adminGroup)
	return adminGroup
}

// 输出 event log
const (
	LevelTodo     = 0
	LevelInfo     = 1
	LevelWarn     = 2
	LevelError    = 3
	LevelSecurity = 4
)

func EventLogf(level int, title, format string, args ...interface{}) {
	event.Add(level, title, fmt.Sprintf(format, args...))
}

func EventLog(level int, title, message string) {
	event.Add(level, title, message)
}

// RegisterTaskFunc 注册任务函数
//
//	func testsql(ctx context.Context) {
//		session := orm.MustSession(ctx)
//		defer session.Close()
//		session.Exec("SELECT 1")
//	}
//	RegisterTaskFunc("测试SQL函数", "testsql", testsql)
func RegisterTaskFunc(desc, name string, fn func(ctx context.Context)) {
	task.Funcs = append(task.Funcs, &task.FuncEntry{Name: desc, Path: name, Func: fn})
	logrus.Infof("注册任务函数: %s, %s", desc, name)
}
