package node

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 删除节点
func del(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		UUID string `json:"uuid" validate:"required"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	ql := `select tpath, nlevel from tree where uuid = ?`
	var node db.Tree
	if err := db.SelectOneX(c, ql, &node, input.UUID); err != nil {
		cc.ErrLog(err).Error("查询节点错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 不能删除根节点
	if node.NLevel == 1 || node.TPath == "0" {
		return c.String(http.StatusBadRequest, "不能删除根节点")
	}
	ql = `delete from tree where tpath like ?`

	if err := db.ExecX(c, ql, node.TPath+"%"); err != nil {
		cc.ErrLog(err).Error("删除节点错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
