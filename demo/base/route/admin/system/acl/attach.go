package acl

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group, code int) {
	group := up.Group("/acl")

	// r
	group.GET("/", list)
	group.GET("/info", info)

	// w
	group.POST("/name", name)
	group.POST("/summary", summary)
	group.POST("/features", features)

	group.POST("/add", add)
	group.POST("/delete", del)

	// group.POST("/allow/add", allowAdd)
	// group.GET("/allow/list", allowList)
	// group.POST("/allow/remove", allowRemove)
	// group.POST("/allow/update", allowUpdate)

	// X
	group.PUT("/allow/reset", reset)
}
