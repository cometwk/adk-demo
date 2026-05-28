package log

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group) {
	group := up.Group("/log")

	group.GET("/search", searchPage)
	group.GET("/list", list)
}
