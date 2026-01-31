package node

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 修改节点描述
func summary(c echo.Context) error {
	cc := c.(ctx.Context)

	var uuid, summary string

	err := echo.FormFieldBinder(c).
		MustString("uuid", &uuid).
		MustString("summary", &summary).BindError()
	if err != nil {
		return util.BadRequest(c, err)
	}
	ql := `
		update tree set summary = ?, update_at = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOne(ql, summary, uuid); err != nil {
		cc.ErrLog(err).Error("更新节点描述错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
