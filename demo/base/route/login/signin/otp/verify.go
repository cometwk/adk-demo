package otp

import (
	"net/http"
	"time"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
	"github.com/pquerna/otp/totp"
)

// 验证 TOTP 口令
func verify(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	type VerifyForm struct {
		Code      string `json:"code" validate:"required"`
		Trust     bool   `json:"trust"`
		Historyid string `json:"historyid"`
	}

	var form VerifyForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}
	cc.Trim(&form.Code, &form.Historyid)

	// 验证 TOTP 口令
	if !totp.Validate(form.Code, user.TOTPSecret) {
		return c.String(http.StatusBadRequest, "口令错误")
	}

	// 重新生成登录 TOKEN
	ql := `select sessduration from account`
	var duration time.Duration

	err := db.SelectOne(ql, &duration)
	if err != nil {
		cc.ErrLog(err).Error("查询设置错")
		return c.NoContent(http.StatusInternalServerError)
	}
	newJwt := auth.NewAuthJWT(user.UUID, true, duration*time.Minute)

	token, err := auth.JWTGenerate(c, newJwt)
	if err != nil {
		cc.ErrLog(err).Error("生成登录 TOKEN 错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 更新历史记录
	if len(form.Historyid) > 0 {
		ql = `update signin_history set trust = ?, tfa = 2 where uuid = ?`

		if err = db.ExecOne(ql, form.Trust, form.Historyid); err != nil {
			cc.ErrLog(err).Error("更新登录历史错")
		}
	}
	return c.JSON(http.StatusOK, echo.Map{"token": token})
}
