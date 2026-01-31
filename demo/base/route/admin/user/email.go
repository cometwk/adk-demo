package user

import (
	"net/http"
	"net/mail"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func email(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type EmailForm struct {
		Email string `json:"email" validate:"required,email"`
	}

	var form EmailForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Email)

	if _, err := mail.ParseAddress(form.Email); err != nil {
		cc.ErrLog(err).Error("解析邮件地址错")
		return c.String(http.StatusBadRequest, "邮箱地址格式错误")
	}
	ql := `
		update users set email = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, form.Email, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改用户邮箱地址失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
