package system

import (
	"github.com/cometwk/base/route/admin/system/acl"
	"github.com/cometwk/base/route/admin/system/event"
	"github.com/cometwk/base/route/admin/system/history"
	"github.com/cometwk/base/route/admin/system/job"
	"github.com/cometwk/base/route/admin/system/log"
	"github.com/cometwk/base/route/admin/system/node"
	"github.com/cometwk/base/route/admin/system/task"
	"github.com/cometwk/base/route/admin/system/user"
	"github.com/labstack/echo/v4"
)

const (
	menuCodeUser     = 9000
	menuCodeACL      = 9010
	menuCodeHistory  = 9020
	menuCodeOps      = 9025
	menuCodeEvent    = 9030
	menuCodeSetting  = 9040
	menuCodeTask     = 9050
	menuCodeNode     = 9060
	menuCodeBulletin = 9070
)

func Attach(up *echo.Group) {
	group := up.Group("/system")

	user.Attach(group, menuCodeUser)
	acl.Attach(group, menuCodeACL)
	history.Attach(group, menuCodeHistory)
	// ops.Attach(group, menuCodeOps)
	// setting.Attach(group, menuCodeSetting)
	event.Attach(group, menuCodeEvent)
	task.Attach(group, menuCodeTask)
	node.Attach(group, menuCodeNode)
	// bulletin.Attach(group, menuCodeBulletin)
	log.Attach(group)

	job.Attach(group, 0)
	task.Attach(group, menuCodeTask)
}
