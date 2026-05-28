package history

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group, code int) {
	// group := up.Group("/history", acl.AllowRead(code))
	group := up.Group("/history")

	group.GET("/", list)
}
