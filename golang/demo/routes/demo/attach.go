package demo

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/demo/biz"
)

func Attach(group *echo.Group) {
	biz.AttachQueryHandler[biz.Merch](group, "/merch")
	biz.AttachQueryHandler[biz.Agent](group, "/agent")
	biz.AttachQueryHandler[biz.Apply](group, "/apply")
	biz.AttachQueryHandler[biz.AgentClosure](group, "/agent_closure")
	biz.AttachQueryHandler[biz.AgentRel](group, "/agent_rel")
	biz.AttachQueryHandler[biz.ProfitDaily](group, "/profit_daily")
	biz.AttachQueryHandler[biz.OrderDaily](group, "/order_daily")
}
