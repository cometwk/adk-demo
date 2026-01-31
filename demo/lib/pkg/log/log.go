package log

import (
	"os"
	"path"
	"runtime"
	"strconv"

	"github.com/fatih/color"
	"github.com/sirupsen/logrus"
)

// type contextKey string

// const reqIDKey = contextKey("reqid")

// func WithReqID(ctx context.Context, reqID string) context.Context {
// 	// fmt.Println("WithReqID", ctx, reqID)
// 	return context.WithValue(ctx, reqIDKey, reqID)
// }

// func GetReqID(ctx context.Context) string {
// 	// fmt.Println("GetReqID", ctx, ctx.Value(reqIDKey))
// 	if v, ok := ctx.Value(reqIDKey).(string); ok {
// 		return v
// 	}
// 	return ""
// }

// FIELD:
//  - reqid: 请求ID
//  - id: 流程实例ID
//  - app: 应用名称
//  - module: 模块名称

func InitDebug() {
	initlog(false)
}

func InitDebugNoColor() {
	initlog(true)
}

func initlog(c bool) {
	color.NoColor = c
	logrus.SetLevel(logrus.DebugLevel)
	logrus.SetReportCaller(true)
	logrus.SetFormatter(&logrus.JSONFormatter{
		CallerPrettyfier: func(f *runtime.Frame) (function string, file string) {
			function = path.Base(f.Function)
			file = path.Base(f.File) + ":" + strconv.Itoa(f.Line)
			return
		},
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyMsg: "message",
		},
	})
	nullFile, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0)
	if err != nil {
		logrus.Fatalf("无法打开 /dev/null: %v", err)
	}
	logrus.SetOutput(nullFile)
	logrus.AddHook(NewTerminalHook())
}
