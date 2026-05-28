package auth

import (
	"github.com/labstack/echo/v4"
	"github.com/mojocn/base64Captcha"
)

// 定义验证码存储
var store = base64Captcha.DefaultMemStore

// 生成验证码
func GenerateCaptcha(c echo.Context) error {
	// 配置验证码参数
	driver := base64Captcha.NewDriverDigit(80, 240, 4, 0.7, 80)

	// 生成验证码
	captcha := base64Captcha.NewCaptcha(driver, store)
	id, b64s, _, err := captcha.Generate()
	if err != nil {
		return c.JSON(500, map[string]interface{}{
			"success": false,
			"message": "验证码生成失败",
		})
	}

	return c.JSON(200, map[string]interface{}{
		"success": true,
		"id":      id,
		"data":    b64s,
	})
}

// 验证验证码
func VerifyCaptcha(id, solution string) bool {
	return store.Verify(id, solution, true)
}
