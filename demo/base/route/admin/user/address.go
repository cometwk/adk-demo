package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

func address(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type AddressForm struct {
		Address string `json:"address"`
	}

	var form AddressForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Address)

	ql := `
		update users set address = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, form.Address, user.UUID); err != nil {
		cc.ErrLog(err).Error("修改地址失败")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}
