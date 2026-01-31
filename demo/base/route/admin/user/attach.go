package user

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group) {
	group := up.Group("/user")

	group.GET("/info", info)
	group.GET("/devices", devices)
	group.GET("/geo", geo)
	group.GET("/signinlist", signinlist)
	group.POST("/avatar", avatar)
	group.POST("/name", name)

	group.POST("/userid", userid)
	group.POST("/email", email)
	group.POST("/mobile", mobile)
	// group.POST("/userid", userid, secretcode.Verify())
	// group.POST("/email", email, secretcode.Verify())
	// group.POST("/mobile", mobile, secretcode.Verify())

	// group.POST("/passwd", passwd, secretcode.Verify())
	// group.POST("/address", address, secretcode.Verify())
	// group.POST("/secretcode", scode, secretcode.Verify())

	group.POST("/passwd", passwd)
	group.POST("/address", address)
	group.POST("/secretcode", scode)

	group.GET("/otp/url", otpURL)

	// group.POST("/otp/verify", otpVerify, secretcode.Verify())
	group.POST("/otp/verify", otpVerify) //没有必要使用 secretcode.Verify()
	group.POST("/otp/check", otpCheck)   //没有必要使用 secretcode.Verify()

	// oauth.Attach(group)
	// notification.Attach(group)
}
