package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
	"github.com/pquerna/otp/totp"
)

// URL
func otpURL(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "ymfpay.com",
		AccountName: user.UserId,
	})
	if err != nil {
		cc.ErrLog(err).Error("创建 TOTP KEY 错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.JSON(http.StatusOK, echo.Map{
		"url":    key.URL(),
		"secret": key.Secret(),
	})
}

// 验证后保存 TOTP 密钥
func otpVerify(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type OTPVerifyForm struct {
		Code   string `json:"code" validate:"required"`
		Secret string `json:"secret" validate:"required"`
	}

	var form OTPVerifyForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	// 验证
	if !totp.Validate(form.Code, form.Secret) {
		return c.String(http.StatusBadRequest, "两因素认证口令验证失败")
	}
	ql := `update users set totp_secret = ? where uuid = ?`

	if err := db.ExecOne(ql, form.Secret, user.UUID); err != nil {
		cc.ErrLog(err).Error("更新用户信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.NoContent(http.StatusOK)
}

// 检查 TOTP 口令是否有效
func otpCheck(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type OTPCheckForm struct {
		Code string `json:"code" validate:"required"`
	}

	var form OTPCheckForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Code)

	// 验证 TOTP 口令
	if !totp.Validate(form.Code, user.TOTPSecret) {
		return c.JSON(http.StatusOK, echo.Map{"valid": false})
	}
	return c.JSON(http.StatusOK, echo.Map{"valid": true})

}
