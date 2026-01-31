package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 禁用/启用用户
func disable(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type Input struct {
		UUID string `json:"uuid" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	// 不能禁用自己的账号
	if input.UUID == user.UUID {
		return c.String(http.StatusForbidden, "不可以禁用自己的账号")
	}
	// 更新用户状态
	ql := `
		update users set disabled = not disabled, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOneX(c, ql, input.UUID); err != nil {
		cc.ErrLog(err).Error("更新用户信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
