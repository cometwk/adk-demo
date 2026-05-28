package event

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group, code int) {
	group := up.Group("/event")

	tableHandler := newTableHandler()
	tableHandler.Attach(group)

	group.POST("/unfresh", unfresh)
}
