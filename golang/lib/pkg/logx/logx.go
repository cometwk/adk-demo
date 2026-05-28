package logx

import (
	"context"

	"github.com/lucky-byte/lib/pkg/orm"
	"github.com/sirupsen/logrus"
)

// LoggerWith 从 ctx 提取 reqid，并将 xlog.Entry.Data 中的字段叠加到 logger
// 保持现有调用方无需改动
func LoggerWith(ctx context.Context, xlog *logrus.Entry) *logrus.Entry {
	logger := Logger(ctx)
	if xlog == nil {
		return logger
	}
	// 从 xlog.Entry.Data map 提取字段并叠加到 Logger(ctx)
	return logger.WithFields(xlog.Data)
}

// 在 echo handler 外部使用，返回带 reqid 的 logger
// 如果 ctx 为 nil，返回不带 reqid 的 base logger
func Logger(ctx context.Context) *logrus.Entry {
	if ctx == nil {
		return logrus.NewEntry(logrus.StandardLogger())
	}
	return logrus.WithField("reqid", orm.GetReqID(ctx))
}
