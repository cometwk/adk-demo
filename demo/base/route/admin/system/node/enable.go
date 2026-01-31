package node

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 启用节点
func enable(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		UUID string `json:"uuid" validate:"required"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	ql := `select tpath from tree where uuid = ?`
	var tpath string

	if err := db.SelectOneX(c, ql, &tpath, input.UUID); err != nil {
		cc.ErrLog(err).Error("查询节点错")
		return c.NoContent(http.StatusInternalServerError)
	}
	ql = `update tree set disabled = false where tpath like ?`

	if err := db.ExecX(c, ql, tpath+"%"); err != nil {
		cc.ErrLog(err).Error("更新节点状态错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
