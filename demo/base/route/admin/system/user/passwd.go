package user

import (
	"net/http"
	"net/mail"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/mailfs"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 修改用户密码
func passwd(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		UUID     string `json:"uuid" validate:"required"`
		Password string `json:"password" validate:"required"`
		SendMail bool   `json:"sendmail"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	// 删除前后空白字符
	cc.Trim(&input.Password)

	// 检查是否可修改
	user, err := isUpdatable(c, input.UUID)
	if err != nil {
		cc.ErrLog(err).Error("修改用户密码错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 更新信息
	passwdHash, err := secure.DefaultPHC().Hash(input.Password)
	if err != nil {
		cc.ErrLog(err).Error("加密密码错")
		return c.NoContent(http.StatusInternalServerError)
	}
	ql := `
		update users set passwd = ?, update_at = current_timestamp
		where uuid = ? and disabled = false and deleted = false
	`
	if err := db.ExecOneX(c, ql, passwdHash, input.UUID); err != nil {
		cc.ErrLog(err).Error("更新用户信息错")
		return c.NoContent(http.StatusInternalServerError)
	}

	// 发送邮件
	if input.SendMail {
		m, err := mailfs.Message("请查收新密码", "resetpass", map[string]interface{}{
			"name":     user.Name,
			"password": input.Password,
		})
		if err != nil {
			cc.ErrLog(err).Error("创建邮件错")
			return c.NoContent(http.StatusInternalServerError)
		}
		addr, err := mail.ParseAddress(user.Email)
		if err != nil {
			cc.ErrLog(err).Error("解析用户邮箱错")
			return c.NoContent(http.StatusInternalServerError)
		}
		m.AddTO(addr)

		// 发送邮件
		if err = m.Send(); err != nil {
			cc.ErrLog(err).Error("发送邮件错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	return c.NoContent(http.StatusOK)
}
