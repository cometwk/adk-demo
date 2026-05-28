package log

import (
	"io"

	"gopkg.in/natefinch/lumberjack.v2"
)

// backupTimeFormat = "2006-01-02T15-04-05.000"
func NewLogWriter(filepath string) io.Writer {
	// 日志文件
	rotate_logger := &lumberjack.Logger{
		Filename:  filepath,
		MaxSize:   20,   // 单个日志文件的最大大小，单位为MB
		Compress:  true, // 是否压缩旧的日志文件
		LocalTime: true, // 使用本地时间而不是UTC时间
	}
	return rotate_logger
}
