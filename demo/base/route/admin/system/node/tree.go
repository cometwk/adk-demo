package node

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/labstack/echo/v4"
)

// 查询所有节点
func tree(c echo.Context) error {
	cc := c.(ctx.Context)

	// 可以设置显示的根节点
	uuid := c.QueryParam("root")

	var records []db.Tree

	if len(uuid) > 0 {
		ql := `select tpath from tree where uuid = ?`
		var tpath string

		if err := db.SelectOneX(c, ql, &tpath, uuid); err != nil {
			cc.ErrLog(err).Error("查询层级结构错")
			return c.NoContent(http.StatusInternalServerError)
		}
		ql = `select * from tree where tpath like ? order by nlevel, sortno`

		if err := db.Select(ql, &records, tpath+"%"); err != nil {
			cc.ErrLog(err).Error("查询层级结构错")
			return c.NoContent(http.StatusInternalServerError)
		}
	} else {
		ql := `select * from tree order by nlevel, sortno`
		if err := db.Select(ql, &records); err != nil {
			cc.ErrLog(err).Error("查询层级结构错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	if len(records) == 0 {
		cc.Log().Error("层级结构为空")
		return c.NoContent(http.StatusInternalServerError)
	}

	return c.JSON(http.StatusOK, records)
}
