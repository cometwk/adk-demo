package task

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/base/pkg/utils"
	"github.com/labstack/echo/v4"
)

func disable(c echo.Context) error {
	cc := c.(ctx.Context)

	uuid, err := utils.GetUnescapedParam(c, "primary")
	if err != nil {
		return err
	}

	ql := `select * from tasks where uuid = ?`
	var t db.Task

	if err = db.SelectOneX(c, ql, &t, uuid); err != nil {
		cc.ErrLog(err).Error("查询任务信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if t.Disabled {
		if err = task.Replace(t, uuid); err != nil {
			cc.ErrLog(err).Error("恢复任务调度错")
			return c.NoContent(http.StatusInternalServerError)
		}
	} else {
		if err = task.Remove(uuid); err != nil {
			cc.ErrLog(err).Error("停止任务调度错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	// 更新状态
	ql = `
		update tasks set disabled = not disabled, update_at = current_timestamp
		where uuid = ?
	`
	if err = db.ExecOneX(c, ql, uuid); err != nil {
		cc.ErrLog(err).Error("更新任务信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
