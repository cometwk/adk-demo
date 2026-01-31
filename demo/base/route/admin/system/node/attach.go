package node

import (
	"github.com/cometwk/base/route/admin/system/node/user"
	"github.com/labstack/echo/v4"
)

func Attach(g *echo.Group, code int) {
	// group := g.Group("/node", acl.AllowRead(code))
	group := g.Group("/node")

	user.Attach(group)

	group.GET("/", tree)
	group.GET("/info", info)

	// group.Use(acl.AllowWrite(code))

	// group.PUT("/top", top)
	// group.PUT("/bottom", bottom)
	// group.PUT("/up", up)
	// group.PUT("/down", down)
	group.POST("/name", name)
	group.POST("/summary", summary)
	group.POST("/move", move)

	// group.Use(acl.AllowAdmin(code))

	// admin permission
	group.PUT("/add", add)
	group.PUT("/delete", del)
	group.PUT("/disable", disable)
	group.PUT("/enable", enable)
}
