package user

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func name(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type NameForm struct {
		Name string `json:"name" validate:"required"`
	}

	var form NameForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Name)

	ql := `
		update users set name = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, form.Name, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改姓名失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
