package node

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 修改节点名称
func name(c echo.Context) error {
	cc := c.(ctx.Context)

	var uuid, name string

	err := echo.FormFieldBinder(c).
		MustString("uuid", &uuid).
		MustString("name", &name).BindError()
	if err != nil {
		return util.BadRequest(c, err)
	}
	ql := `
		update tree set name = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, name, uuid); err != nil {
		cc.ErrLog(err).Error("更新节点名称错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
