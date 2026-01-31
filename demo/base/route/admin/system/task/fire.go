package task

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/base/pkg/utils"
	"github.com/labstack/echo/v4"
)

func fire(c echo.Context) error {
	cc := c.(ctx.Context)

	uuid, err := utils.GetUnescapedParam(c, "primary")
	if err != nil {
		return err
	}

	ql := `select disabled from tasks where uuid = ?`
	var disabled bool

	if err := db.SelectOneX(c, ql, &disabled, uuid); err != nil {
		cc.ErrLog(err).Error("查询任务信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if disabled {
		return c.String(http.StatusForbidden, "当前任务已被禁用，不能执行")
	}
	if err := task.Fire(uuid); err != nil {
		cc.ErrLog(err).Error("立即执行任务错")
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusOK)
}
