package otp

import (
	"github.com/cometwk/base/lib/auth"
	"github.com/labstack/echo/v4"
)

func Attach(engine *echo.Group) {
	router := engine.Group("/otp")

	router.POST("/verify", verify, checkToken)
}

// 登录 Token 必须有效
func checkToken(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		err := auth.CheckBy2FA(c)
		if err != nil {
			return err
		}
		return next(c)
	}
}
