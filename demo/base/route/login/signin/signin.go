package signin

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 用户登录
func signin(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		Username string `json:"mobile" validate:"required"`
		Password string `json:"password" validate:"required"`
		Clientid string `json:"clientid" validate:"required"`
		Captcha  struct {
			Id   string `json:"id"`
			Code string `json:"code"`
		} `json:"captcha"`
	}

	var u Body
	err := c.Bind(&u)
	if err != nil {
		return util.BadRequest(c, err)
	}
	if err = c.Validate(u); err != nil {
		return err
	}

	// if env.IsDebug() {
	// 验证验证码
	if !auth.VerifyCaptcha(u.Captcha.Id, u.Captcha.Code) {
		return c.JSON(http.StatusBadRequest, echo.Map{
			"message": "验证码错误",
		})
	}
	// }

	ql := `select * from users where LOWER(userid) = LOWER(?)`
	var user db.User
	// 查询用户信息
	err = db.SelectOneX(c, ql, &user, u.Username)
	if err != nil {
		cc.ErrLog(err).Errorf("登录失败, 用户 %s 不存在", u.Username)
		return c.String(http.StatusForbidden, "用户名或密码错误")
	}
	// 给日志增加用户信息
	cc.SetUser(&user)

	// 验证密码
	if !secure.ValidatePassword(u.Password, user.Passwd) {
		cc.Log().Errorf("%s 登录失败, 验证登录密码错", user.Name)
		return c.String(http.StatusForbidden, "用户名或密码错误")
	}

	// 完成后续登录过程
	return auth.Login(cc, &user, u.Clientid, 1, "")
}
