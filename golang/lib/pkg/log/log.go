package log

import (
	"context"
	"os"
	"path"
	"runtime"
	"strconv"

	"github.com/fatih/color"
	"github.com/sirupsen/logrus"
)

// VictoriaLogs: _stream_fields=module,level,feature
const (
	FReqID   = "reqid"   // http request id
	FModule  = "module"  // http request module
	FFeature = "feature" // http request feature
)

// context key for storing logger in context
type ctxKey string

const loggerKey = ctxKey("logger")

// Exported ReqIDKey for orm/log.go compatibility (Unit 2)
const ReqIDKey = ctxKey("reqid")

// baseLogger with default fields for VictoriaLogs compatibility
var baseLogger *logrus.Entry

func init() {
	color.NoColor = false
	baseLogger = logrus.WithFields(logrus.Fields{
		FReqID:   "default",
		FFeature: "default",
		FModule:  "default",
	})
}

// Logger returns a logger from context, or baseLogger if ctx is nil or has no stored logger
func Logger(ctx context.Context) *logrus.Entry {
	if ctx == nil {
		return baseLogger
	}
	if logger, ok := ctx.Value(loggerKey).(*logrus.Entry); ok && logger != nil {
		return logger
	}
	return baseLogger
}

// WithLogger stores a logger in context
func WithLogger(ctx context.Context, logger *logrus.Entry) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, loggerKey, logger)
}

// WithReqID creates a logger with reqid and stores it in context
// Also stores reqid in context.Value(ReqIDKey) for orm/log.go compatibility
func WithReqID(ctx context.Context, reqID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	// Store reqid in context value for GetReqID compatibility
	ctx = context.WithValue(ctx, ReqIDKey, reqID)
	logger := Logger(ctx).WithField(FReqID, reqID)
	return WithLogger(ctx, logger)
}

// GetReqID retrieves reqid from context
func GetReqID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(ReqIDKey).(string); ok {
		return v
	}
	return ""
}

// WithModule creates a logger with module field and stores it in context
// Empty module string falls back to "default"
func WithModule(ctx context.Context, module string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if module == "" {
		module = "default"
	}
	logger := Logger(ctx).WithField("module", module)
	return WithLogger(ctx, logger)
}

// WithFeature creates a logger with feature field and stores it in context
// Empty feature string falls back to "default"
func WithFeature(ctx context.Context, feature string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if feature == "" {
		feature = "default"
	}
	logger := Logger(ctx).WithField("feature", feature)
	return WithLogger(ctx, logger)
}

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
	// if !color.NoColor {
	logrus.AddHook(NewTerminalHook())
	// }
}
