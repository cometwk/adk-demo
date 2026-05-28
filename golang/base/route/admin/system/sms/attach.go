package sms

import (
	"fmt"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/ctx"
	"github.com/lucky-byte/base/lib/db"
	libsms "github.com/lucky-byte/base/lib/sms"
	"github.com/lucky-byte/lib/pkg/serve"
)

type handler struct {
	*serve.CrudHandler[db.SMS]
}

func Attach(attach *echo.Group) {
	e := attach.Group("/sms")

	handler := &handler{
		serve.NewCrudHandler[db.SMS](""),
	}
	handler.RegisterRoutes(e)

	e.POST("/test2", sendTest2)
}

func sendTest2(c echo.Context) error {
	cc := c.(ctx.Context)
	var req struct {
		Mobile string `json:"mobile"`
		Name   string `json:"name"`
		Apply  string `json:"apply"`
		Rate   int64  `json:"rate"`
	}
	if err := c.Bind(&req); err != nil {
		return err
	}

	ratePercentStr := fmt.Sprintf("%.3f", float64(req.Rate)/1000.0)

	// 尊敬的代理商，商户 ‘${name}’ 已成功登记，进件人：${apply}，签约费率：${rate}%，请及时跟进处理。
	err := libsms.SendTextNo2(req.Mobile, map[string]string{
		"name":  req.Name,
		"apply": req.Apply,
		"rate":  ratePercentStr,
	})
	if err != nil {
		cc.ErrLog(err).Error("发送测试短信失败")
		return err
	}

	return nil
}
