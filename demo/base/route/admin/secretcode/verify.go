package secretcode

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 验证安全操作码
func verify(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		SecretCode string `form:"secretcode" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	user := cc.User()

	// 如果没有设置安全操作码，直接返回成功
	if len(user.SecretCode) == 0 {
		return c.String(http.StatusOK, "")
	}

	// 验证
	phc, err := secure.ParsePHC(user.SecretCode)
	if err != nil {
		cc.ErrLog(err).Error("解析安全操作码失败")
		return c.String(http.StatusForbidden, "验证失败")
	}
	if err = phc.Verify(input.SecretCode); err != nil {
		cc.ErrLog(err).Errorf("用户 %s 验证安全操作码失败", user.Name)
		return c.String(http.StatusForbidden, "验证失败")
	}

	// 生成验证 TOKEN
	token := genToken(user.UUID)

	return c.String(http.StatusOK, token)
}
