package testutil

import (
	"fmt"

	"github.com/sirupsen/logrus"
	"xorm.io/xorm/log"
)

type LogEntry struct {
	SQL  string        // log content or SQL
	Args []interface{} // if it's a SQL, it's the arguments
	Err  error         // SQL executed error
}

func TruncateStringUTF8(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}
func (x *LogEntry) String() string {
	// return fmt.Sprintf("%s Args=%v Err=%v", x.SQL, x.Args, x.Err)
	args := fmt.Sprintf("%v", x.Args)
	err := fmt.Sprintf("%v", x.Err)
	// return fmt.Sprintf("%-50s Args=%-50s Err=%s", TruncateStringUTF8(x.SQL, 50), TruncateStringUTF8(args, 50), TruncateStringUTF8(err, 30))
	return fmt.Sprintf("%s Args=%s Err=%v", x.SQL, args, err)
}

type Logmem interface {
	log.ContextLogger
	Reset()
	DoNotRecord()
	Entries() []LogEntry
	PrintEntries()
}

// 将 xorm 的日志适配到 logrus
type logmem struct {
	logger  *logrus.Entry
	entries []LogEntry
}

type myFormatter struct {
}

func (f *myFormatter) Format(entry *logrus.Entry) ([]byte, error) {
	timestamp := entry.Time.Format("2006-01-02 15:04:05")
	id := entry.Data["id"]
	if id == nil {
		id = ""
	}
	reqid := entry.Data["reqid"]
	if reqid == nil {
		reqid = ""
	}
	msg := fmt.Sprintf("[%s] %s %-6s %s %s\n", timestamp, reqid, entry.Level.String(), id, entry.Message)
	return []byte(msg), nil
}

func NewMyFormatter() logrus.Formatter {
	return &myFormatter{}
}

func NewLogger() Logmem {
	return &logmem{
		logger:  logrus.WithField("module", "xorm"),
		entries: make([]LogEntry, 0),
	}
}

func (x *logmem) Entries() []LogEntry {
	return x.entries
}

func (x *logmem) DoNotRecord() {
	x.entries = nil // 初始化时为 nil，表示不记录日志
}

func (x *logmem) StringSlice() []string {
	strings := []string{}
	for _, entry := range x.entries {
		strings = append(strings, entry.String())
	}
	return strings
}
func (x *logmem) PrintEntries() {
	for _, entry := range x.entries {
		fmt.Println(entry.String())
	}
}

func (x *logmem) Reset() {
	x.entries = []LogEntry{}
}

func (x *logmem) BeforeSQL(ctx log.LogContext) {
	// x.printSQL(ctx, "BeforeSQL")
}

// only invoked when IsShowSQL is true

func (x *logmem) AfterSQL(ctx log.LogContext) {
	if x.entries != nil {
		x.printSQL(ctx, "AfterSQL")
		x.entries = append(x.entries, LogEntry{
			SQL:  ctx.SQL,
			Args: ctx.Args,
			Err:  ctx.Err,
		})
	}
}

func (x *logmem) printSQL(ctx log.LogContext, prefix string) {
	var SessionIDKey = "__xorm_session_id"
	var sessionPart string
	v := ctx.Ctx.Value(SessionIDKey)
	if key, ok := v.(string); ok {
		sessionPart = fmt.Sprintf(" [%s]", key)
	}
	// x.logger.Infof("\n\n%s %s", prefix, sessionPart)
	_ = prefix
	if ctx.ExecuteTime > 0 {
		x.logger.Infof("%s [SQL] %s %v - %v", sessionPart, ctx.SQL, ctx.Args, ctx.ExecuteTime)
	} else {
		x.logger.Infof("%s [SQL] %s %v", sessionPart, ctx.SQL, ctx.Args)
	}
}

// 实现 xorm 的 log.Logger 接口
func (x *logmem) Debug(v ...interface{}) {
	x.logger.Debug(v...)
}

func (x *logmem) Debugf(format string, v ...interface{}) {
	x.logger.Debugf(format, v...)
}

func (x *logmem) Error(v ...interface{}) {
	x.logger.Error(v...)
}

func (x *logmem) Errorf(format string, v ...interface{}) {
	x.logger.Errorf(format, v...)
}

func (x *logmem) Info(v ...interface{}) {
	x.logger.Info(v...)
}

func (x *logmem) Infof(format string, v ...interface{}) {
	x.logger.Infof(format, v...)
}

func (x *logmem) Warn(v ...interface{}) {
	x.logger.Warn(v...)
}

func (x *logmem) Warnf(format string, v ...interface{}) {
	x.logger.Warnf(format, v...)
}

func (x *logmem) Level() log.LogLevel {
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

func (x *logmem) SetLevel(l log.LogLevel) {
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

func (x *logmem) ShowSQL(show ...bool) {
	// 这个方法是必需的，但在 logrus 中不需要实现任何功能
}

func (x *logmem) IsShowSQL() bool {
	return true
}
