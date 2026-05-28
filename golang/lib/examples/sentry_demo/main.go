package main

import (
	"context"
	"errors"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/sirupsen/logrus"
)

type LogrusTransport struct {
}

func (t *LogrusTransport) Configure(options sentry.ClientOptions) {
}

func (t *LogrusTransport) SendEvent(event *sentry.Event) {
	// Log to Logrus first
	logrus.WithFields(logrus.Fields{
		// "level":     event.Level,
		"message":   event.Message,
		"exception": event.Exception,
		"timestamp": event.Timestamp,
	}).Error("Sentry event")
}

func (t *LogrusTransport) Flush(timeout time.Duration) bool {
	return true
}

func (t *LogrusTransport) FlushWithContext(ctx context.Context) bool {
	// This transport is synchronous/no-op for buffering, so we only honor
	// immediate cancellation.
	select {
	case <-ctx.Done():
		return false
	default:
		return true
	}
}

func (t *LogrusTransport) Close() {
}

var _ sentry.Transport = &LogrusTransport{}

func main() {
	// sentry.Init(sentry.ClientOptions{
	// 	Dsn: "https://88b6d0ffdac04bc4a3064c9473af4c52@app.glitchtip.com/11152",
	// 	// Dsn:         "", // 本地开发可留空，防止网络请求
	// 	Environment: "development",
	// 	// Debug:       true,
	// 	// Transport:   &LogrusTransport{},
	// })
	sentry.Init(sentry.ClientOptions{
		Dsn: "https://df4e7244400148e787e6a66ddbe23426@sentry.reactgo.cn/1",
	})

	sentry.CaptureException(errors.New("my error"))
	// Since sentry emits events in the background we need to make sure
	// they are sent before we shut down
	sentry.Flush(time.Second * 5)
}
