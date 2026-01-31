package event

import (
	"testing"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/sirupsen/logrus"
)

func Test1(t *testing.T) {
	orm.InitDefaultDB()

	logrus.AddHook(NewEventHook(FormatJson))
	logrus.Warn("test")
}
