package event

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

// 改为已读
func unfresh(c echo.Context) error {
	cc := c.(ctx.Context)

	var input struct {
		Uuid string `json:"uuid" validate:"required"`
	}

	err := util.BindAndValidate(c, &input)
	if err != nil {
		return util.BadRequest(c, err)
	}
	ql := `update events set fresh = false where uuid = ?`

	if err = db.ExecX(c, ql, input.Uuid); err != nil {
		cc.ErrLog(err).Error("更新事件状态错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
