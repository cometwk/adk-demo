package login

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/route/login/resetpass"
	"github.com/lucky-byte/base/route/login/signin"
)

// 登录相关模块
func Attach(up *echo.Group) {
	group := up.Group("")

	signin.Attach(group)    // 登录
	resetpass.Attach(group) // 找回密码
}
