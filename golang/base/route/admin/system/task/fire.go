package task

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/ctx"
	"github.com/lucky-byte/base/lib/db"
	"github.com/lucky-byte/base/lib/task"
	"github.com/lucky-byte/base/pkg/utils"
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
