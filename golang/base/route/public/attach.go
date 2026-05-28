package public

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/lib/auth"
	"github.com/lucky-byte/base/route/public/bulletin"
)

// 公开访问
func Attach(up *echo.Group) {
	group := up.Group("/pub")

	group.GET("/captcha", auth.GenerateCaptcha)

	bulletin.Attach(group) // 公告

	// promotion.Attach(group) // 宣传记录
}
