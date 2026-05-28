package orm

import (
	"context"
	"fmt"

	pkglog "github.com/lucky-byte/lib/pkg/log"
	"github.com/sirupsen/logrus"
	xormlog "xorm.io/xorm/log"
)

// SKIP_LOG_SQL is a special reqid value that skips SQL logging
const SKIP_LOG_SQL = "_skip_sql_"

// WithReqID stores the request ID in context.
// Delegates to log package for unified context key management.
func WithReqID(ctx context.Context, reqID string) context.Context {
	return pkglog.WithReqID(ctx, reqID)
}

// GetReqID retrieves the request ID from context.
// Delegates to log package for unified context key management.
func GetReqID(ctx context.Context) string {
	return pkglog.GetReqID(ctx)
}

// 将 xorm 的日志适配到 logrus
type XormLogrus struct {
	logger *logrus.Entry // 只用于判断 level
}

var _ xormlog.ContextLogger = &XormLogrus{}

func NewXormLogrus(logger *logrus.Entry) *XormLogrus {
	return &XormLogrus{
		logger: logger,
	}
}

func (x *XormLogrus) BeforeSQL(context xormlog.LogContext) {
}

// only invoked when IsShowSQL is true
func (x *XormLogrus) AfterSQL(context xormlog.LogContext) {
	if x.logger.Logger.Level < logrus.DebugLevel {
		// 如果日志级别不是 DebugLevel，则不打印 SQL
		return
	}

	reqid := GetReqID(context.Ctx)
	if reqid == SKIP_LOG_SQL {
		// session 设置不打印 SQL 日志
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

	xlog := pkglog.Logger(context.Ctx)
	xlog.Debugf("[SQL] %v %v - %v", context.SQL, truncatedArgs, context.ExecuteTime)
	// x.logger.WithField("reqid", reqid).Debugf("[SQL] %v %v - %v", context.SQL, truncatedArgs, context.ExecuteTime)
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

func (x *XormLogrus) Level() xormlog.LogLevel {
	switch x.logger.Level {
	case logrus.DebugLevel:
		return xormlog.LOG_DEBUG
	case logrus.InfoLevel:
		return xormlog.LOG_INFO
	case logrus.WarnLevel:
		return xormlog.LOG_WARNING
	case logrus.ErrorLevel:
		return xormlog.LOG_ERR
	default:
		return xormlog.LOG_OFF
	}
}

func (x *XormLogrus) SetLevel(l xormlog.LogLevel) {
	switch l {
	case xormlog.LOG_DEBUG:
		x.logger.Logger.SetLevel(logrus.DebugLevel)
	case xormlog.LOG_INFO:
		x.logger.Logger.SetLevel(logrus.InfoLevel)
	case xormlog.LOG_WARNING:
		x.logger.Logger.SetLevel(logrus.WarnLevel)
	case xormlog.LOG_ERR:
		x.logger.Logger.SetLevel(logrus.ErrorLevel)
	case xormlog.LOG_OFF:
		x.logger.Logger.SetLevel(logrus.PanicLevel)
	}
}

func (x *XormLogrus) ShowSQL(show ...bool) {
	// 这个方法是必需的，但在 logrus 中不需要实现任何功能
}

func (x *XormLogrus) IsShowSQL() bool {
	return true
}
