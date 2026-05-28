package signin

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/route/login/signin/otp"
)

func Attach(engine *echo.Group) {
	router := engine.Group("/signin")

	router.GET("/settings", settings)
	router.POST("", signin)
	router.POST("/userid/code", useridCode)
	router.POST("/userid/search", useridSearch)

	// sms.Attach(router)
	otp.Attach(router)
	// oauth.Attach(router)
}
