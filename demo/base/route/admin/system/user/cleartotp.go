package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 清除用户 TOTP
func clearTOTP(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		UUID string `json:"uuid" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	// 检查是否可修改
	if _, err := isUpdatable(c, input.UUID); err != nil {
		cc.ErrLog(err).Error("清除用户 OTP 错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 清除 TOTP
	ql := `
		update users set totp_secret = '', update_at = current_timestamp
		where uuid = ? and disabled = false and deleted = false
	`
	if err := db.ExecOneX(c, ql, input.UUID); err != nil {
		cc.ErrLog(err).Error("清除 TOTP 错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
