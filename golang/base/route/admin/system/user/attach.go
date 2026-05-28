package user

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/route/admin/secretcode"
)

func Attach(up *echo.Group, code int) {
	group := up.Group("/user")

	userAttach(group)

	group.POST("/passwd", passwd)
	group.POST("/bank", bank)
	group.POST("/cleartotp", clearTOTP)
	group.POST("/disable", disable)
	group.POST("/delete", del)
	group.POST("/clearsecretcode", clearSecretCode)
	// group.POST("/delete", del, secretcode.Verify())
	group.POST("/bank", bank, secretcode.Verify())

}
