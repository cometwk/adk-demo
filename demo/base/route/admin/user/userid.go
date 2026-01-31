package user

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func userid(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type UseridForm struct {
		Userid string `json:"userid" validate:"required"`
	}

	var form UseridForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Userid)

	ql := `select count(*) from users where userid = ?`
	var count int

	if err := db.SelectOne(ql, &count, form.Userid); err != nil {
		cc.ErrLog(err).Error("查询用户信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if count > 0 {
		return c.String(http.StatusConflict, "登录名已存在")
	}
	ql = `
		update users set userid = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, form.Userid, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改登录名失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
