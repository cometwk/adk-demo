package serve

import (
	"io"

	echoLog "github.com/labstack/gommon/log"
	"github.com/sirupsen/logrus"
)

// 创建自定义logger实现
type customLogger struct {
	Logger *logrus.Entry
}

// func NewcustomLogger() echo.Logger {
// 	return &customLogger{
// 		Logger: xlog.WithField("module", "echo"),
// 	}
// }

// 实现 echo.Logger 接口所需的方法
func (l *customLogger) Output() io.Writer {
	return l.Logger.Writer()
}

func (l *customLogger) SetOutput(w io.Writer) {
	// dont need to set
}

func (l *customLogger) Prefix() string {
	return ""
}

func (l *customLogger) SetPrefix(p string) {
	// xlog 可能不需要实现这个
}

func (l *customLogger) Level() echoLog.Lvl {
	switch l.Logger.Level {
	case logrus.DebugLevel:
		return echoLog.DEBUG
	case logrus.InfoLevel:
		return echoLog.INFO
	case logrus.WarnLevel:
		return echoLog.WARN
	case logrus.ErrorLevel:
		return echoLog.ERROR
	default:
		return echoLog.INFO
	}
}

func (l *customLogger) SetLevel(v echoLog.Lvl) {
	// 不需要设置
}

func (l *customLogger) SetHeader(h string) {
	// 可以在这里自定义日志格式
}

// 添加缺少的日志方法
func (l *customLogger) Debug(i ...interface{}) {
	l.Logger.Debug(i...)
}

func (l *customLogger) Debugf(format string, args ...interface{}) {
	l.Logger.Debugf(format, args...)
}

func (l *customLogger) Info(i ...interface{}) {
	l.Logger.Info(i...)
}

func (l *customLogger) Infof(format string, args ...interface{}) {
	l.Logger.Infof(format, args...)
}

func (l *customLogger) Warn(i ...interface{}) {
	l.Logger.Warn(i...)
}

func (l *customLogger) Warnf(format string, args ...interface{}) {
	l.Logger.Warnf(format, args...)
}

func (l *customLogger) Error(i ...interface{}) {
	l.Logger.Error(i...)
}

func (l *customLogger) Errorf(format string, args ...interface{}) {
	l.Logger.Errorf(format, args...)
}

func (l *customLogger) Fatal(i ...interface{}) {
	l.Logger.Fatal(i...)
}

func (l *customLogger) Fatalf(format string, args ...interface{}) {
	l.Logger.Fatalf(format, args...)
}

func (l *customLogger) Print(i ...interface{}) {
	l.Logger.Info(i...)
}

func (l *customLogger) Printf(format string, args ...interface{}) {
	l.Logger.Infof(format, args...)
}

// 添加缺少的 JSON 相关方法
func (l *customLogger) Debugj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Debug()
}

func (l *customLogger) Infoj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Info()
}

func (l *customLogger) Warnj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Warn()
}

func (l *customLogger) Errorj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Error()
}

func (l *customLogger) Fatalj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Fatal()
}

func (l *customLogger) Panic(i ...interface{}) {
	l.Logger.Panic(i...)
}

func (l *customLogger) Panicj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Panic()
}

func (l *customLogger) Panicf(format string, args ...interface{}) {
	l.Logger.Panicf(format, args...)
}

func (l *customLogger) Printj(j echoLog.JSON) {
	l.Logger.WithFields(logrus.Fields(j)).Info()
}
