package public

import (
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/route/public/bulletin"
	"github.com/labstack/echo/v4"
)

// 公开访问
func Attach(up *echo.Group) {
	group := up.Group("/pub")

	group.GET("/captcha", auth.GenerateCaptcha)

	bulletin.Attach(group) // 公告
}
