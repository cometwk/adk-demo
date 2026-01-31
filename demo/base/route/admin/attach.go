package admin

import (
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/route/admin/secretcode"
	"github.com/cometwk/base/route/admin/system"
	"github.com/cometwk/base/route/admin/user"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/labstack/echo/v4"
)

// 用于构造 nats 客户端名称
// var natsCounter = 0

// 后台管理模块
func Attach(up *echo.Group) {
	// group := up.Group("/admin")
	group := up

	// 后续操作都需要通过认证
	// group.Use(auth.Authentication)

	// 统一验证安全码
	secretcode.Attach(group)

	// 用户可以访问账号菜单中的功能
	user.Attach(group)

	// 后续操作记录操作审计
	// group.Use(ops.Recorder)

	// // 检查用户访问角色是否允许进一步操作
	// group.Use(aclCheck)

	// group.GET("/nats", nats)       // NATS 配置信息
	// group.GET("/httpurl", httpurl) // HTTP URL 地址

	// 系统管理
	system.Attach(group)

	serve.AttachCrudRoutes[db.DictCat](group, "dict_cats")
	serve.AttachCrudRoutes[db.Dict](group, "dicts")
}

// // 检查用户访问角色
// func aclCheck(next echo.HandlerFunc) echo.HandlerFunc {
// 	return func(c echo.Context) error {
// 		cc := c.(ctx.Context)

// 		// 访问角色带有 openpt 特征禁止访问
// 		for _, feature := range cc.AclFeatures() {
// 			if strings.ToLower(feature) == "openpt" {
// 				cc.Log().Warn("此功能不允许带有'开放平台'特征的角色访问")
// 				return c.NoContent(http.StatusForbidden)
// 			}
// 		}
// 		return next(c)
// 	}
// }

// // 查询 NATS 配置信息
// func nats(c echo.Context) error {
// 	cc := c.(ctx.Context)
// 	user := cc.User()

// 	natsCounter += 1

// 	servers := cc.Config().NatsWebSocket()
// 	name := fmt.Sprintf("%s-%d", user.UserId, natsCounter)

// 	return c.JSON(http.StatusOK, echo.Map{"servers": servers, "name": name})
// }

// // 查询 Http URL
// func httpurl(c echo.Context) error {
// 	cc := c.(ctx.Context)

// 	return c.String(http.StatusOK, cc.Config().ServerHttpURL())
// }
