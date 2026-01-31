package user

import (
	"net/http"
	"regexp"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

func scode(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type SecretcodeForm struct {
		Secretcode string `json:"secretcode" validate:"required,len=6"`
	}

	var form SecretcodeForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	match, err := regexp.MatchString(`^[0-9]{6}$`, form.Secretcode)
	if err != nil {
		cc.ErrLog(err).Error("验证安全操作码错误")
		return c.NoContent(http.StatusInternalServerError)
	}
	if !match {
		return c.String(http.StatusBadRequest, "安全操作码必须是6位数字")
	}
	// 加密
	codeHash, err := secure.DefaultPHC().Hash(form.Secretcode)
	if err != nil {
		cc.ErrLog(err).Error("加密安全操作码错")
		return c.String(http.StatusForbidden, "加密错误")
	}
	ql := `
		update users set secretcode = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, codeHash, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改安全操作码失败")
		return c.String(http.StatusForbidden, "修改安全操作码失败")
	}

	// 清除用户缓存, 让立即生效
	auth.ClearJwtCache(user.UUID)

	return c.NoContent(http.StatusOK)
}
