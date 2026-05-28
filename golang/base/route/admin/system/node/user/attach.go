package user

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group) {
	group := up.Group("/user")

	group.GET("/search", list)

	group.POST("/add", add)
	group.POST("/delete", del)
}
