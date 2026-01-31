package orm

import (
	"context"
	"fmt"

	"github.com/sirupsen/logrus"
	"xorm.io/xorm/log"
)

type contextKey string

const reqIDKey = contextKey("reqid")
const SKIP_LOG_SQL = "_skip_sql_"

func WithReqID(ctx context.Context, reqID string) context.Context {
	// fmt.Println("WithReqID", ctx, reqID)
	return context.WithValue(ctx, reqIDKey, reqID)
}

func GetReqID(ctx context.Context) string {
	// fmt.Println("GetReqID", ctx, ctx.Value(reqIDKey))
	if v, ok := ctx.Value(reqIDKey).(string); ok {
		return v
	}
	return ""
}

// 将 xorm 的日志适配到 logrus
type XormLogrus struct {
	logger *logrus.Entry
}

var _ log.ContextLogger = &XormLogrus{}

func NewXormLogrus(logger *logrus.Entry) *XormLogrus {
	return &XormLogrus{
		logger: logger,
	}
}

func (x *XormLogrus) BeforeSQL(context log.LogContext) {
}

// only invoked when IsShowSQL is true
func (x *XormLogrus) AfterSQL(context log.LogContext) {
	reqid := GetReqID(context.Ctx)
	if reqid == SKIP_LOG_SQL {
		return
	}

	// 设置每个元素的最大长度
	const maxContentLength = 100

	// 截断每个元素的内容
	truncatedArgs := make([]any, len(context.Args))
	for i, arg := range context.Args {
		// argStr := fmt.Sprintf("%v,%T", arg, arg)
		argStr := fmt.Sprintf("%v", arg)
		if len(argStr) > maxContentLength {
			truncatedArgs[i] = argStr[:maxContentLength] + "..." // 添加省略号表示截断
		} else {
			truncatedArgs[i] = argStr
		}
	}

	x.logger.WithField("reqid", reqid).Debugf("[SQL] %v %v - %v", context.SQL, truncatedArgs, context.ExecuteTime)
}

// 实现 xorm 的 log.Logger 接口
func (x *XormLogrus) Debug(v ...any) {
	x.logger.Debug(v...)
}

func (x *XormLogrus) Debugf(format string, v ...any) {
	x.logger.Debugf(format, v...)
}

func (x *XormLogrus) Error(v ...any) {
	x.logger.Error(v...)
}

func (x *XormLogrus) Errorf(format string, v ...any) {
	x.logger.Errorf(format, v...)
}

func (x *XormLogrus) Info(v ...any) {
	x.logger.Info(v...)
}

func (x *XormLogrus) Infof(format string, v ...any) {
	x.logger.Infof(format, v...)
}

func (x *XormLogrus) Warn(v ...any) {
	x.logger.Warn(v...)
}

func (x *XormLogrus) Warnf(format string, v ...any) {
	x.logger.Warnf(format, v...)
}

func (x *XormLogrus) Level() log.LogLevel {
	switch x.logger.Level {
	case logrus.DebugLevel:
		return log.LOG_DEBUG
	case logrus.InfoLevel:
		return log.LOG_INFO
	case logrus.WarnLevel:
		return log.LOG_WARNING
	case logrus.ErrorLevel:
		return log.LOG_ERR
	default:
		return log.LOG_OFF
	}
}

func (x *XormLogrus) SetLevel(l log.LogLevel) {
	switch l {
	case log.LOG_DEBUG:
		x.logger.Logger.SetLevel(logrus.DebugLevel)
	case log.LOG_INFO:
		x.logger.Logger.SetLevel(logrus.InfoLevel)
	case log.LOG_WARNING:
		x.logger.Logger.SetLevel(logrus.WarnLevel)
	case log.LOG_ERR:
		x.logger.Logger.SetLevel(logrus.ErrorLevel)
	case log.LOG_OFF:
		x.logger.Logger.SetLevel(logrus.PanicLevel)
	}
}

func (x *XormLogrus) ShowSQL(show ...bool) {
	// 这个方法是必需的，但在 logrus 中不需要实现任何功能
}

func (x *XormLogrus) IsShowSQL() bool {
	return true
}
