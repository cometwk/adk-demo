package user

import (
	"net/http"
	"regexp"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func mobile(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type MobileForm struct {
		Mobile string `json:"mobile" validate:"required,len=11"`
	}

	var form MobileForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Mobile)

	match, err := regexp.MatchString(`^1[0-9]{10}$`, form.Mobile)
	if err != nil {
		cc.ErrLog(err).Error("验证手机号错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if !match {
		return c.String(http.StatusBadRequest, "手机号格式错误")
	}

	ql := `
		update users set mobile = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, form.Mobile, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改用户手机号失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
