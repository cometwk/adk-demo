package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

func passwd(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type PasswdForm struct {
		OldPassword string `json:"oldPassword" validate:"required"`
		NewPassword string `json:"newPassword" validate:"required"`
	}

	var form PasswdForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.OldPassword, &form.NewPassword)

	// 验证原登录密码
	phc, err := secure.ParsePHC(user.Passwd)
	if err != nil {
		cc.ErrLog(err).Error("验证原密码失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	if err := phc.Verify(form.OldPassword); err != nil {
		cc.ErrLog(err).Error("验证原密码失败")
		return c.String(http.StatusForbidden, "原登录密码不匹配")
	}

	// 保存新密码
	passwdHash, err := secure.DefaultPHC().Hash(form.NewPassword)
	if err != nil {
		cc.ErrLog(err).Error("加密新密码失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	ql := `
		update users set passwd = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, passwdHash, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改密码失败")
		return c.NoContent(http.StatusInternalServerError)
	}

	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
