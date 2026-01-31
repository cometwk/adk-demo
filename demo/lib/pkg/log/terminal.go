package log

import (
	"fmt"
	"io"
	"os"

	"github.com/cometwk/lib/pkg/log/xfmt"
	"github.com/sirupsen/logrus"
)

type terminalHook struct {
	printer io.Writer
}

// NewTerminalHook 创建一个彩色 stdout 输出终端日志钩子
// logrus.AddHook(log.NewTerminalHook())
func NewTerminalHook() *terminalHook {
	return &terminalHook{
		printer: xfmt.NewFmtMainPrinter(os.Stdout),
	}
}

func (h *terminalHook) Fire(entry *logrus.Entry) error {
	data, err := entry.String()
	if err != nil {
		fmt.Println("Error extracting JSON data:", err)
		return err
	}
	h.printer.Write([]byte(data))
	return nil
}

func (h *terminalHook) Levels() []logrus.Level {
	return logrus.AllLevels
}
