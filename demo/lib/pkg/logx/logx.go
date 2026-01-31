package logx

import (
	"context"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/sirupsen/logrus"
)

// attach reqid
func LoggerWith(ctx context.Context, logger *logrus.Entry) *logrus.Entry {
	return logger.WithField("reqid", orm.GetReqID(ctx))
}

// 在 echo handler 外部使用
func Logger(ctx context.Context) *logrus.Entry {
	return logrus.WithField("reqid", orm.GetReqID(ctx))
}
