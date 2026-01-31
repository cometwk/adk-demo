package acl

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func name(c echo.Context) error {
	cc := c.(ctx.Context)

	var uuid, name string

	err := echo.FormFieldBinder(c).
		MustString("uuid", &uuid).MustString("name", &name).BindError()
	if err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&name)

	ql := `select count(*) from acl where name = ?`
	var count int

	if err = db.SelectOne(ql, &count, name); err != nil {
		cc.ErrLog(err).Error("查询访问控制信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if count > 0 {
		return c.String(http.StatusConflict, fmt.Sprintf("%s 已存在", name))
	}
	ql = `
		update acl set name = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, name, uuid); err != nil {
		cc.ErrLog(err).Error("更新访问控制信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
