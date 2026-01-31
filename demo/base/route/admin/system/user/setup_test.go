package user

import (
	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	biztestutil "github.com/cometwk/base/model/testutil"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/labstack/echo/v4"
	"xorm.io/xorm"
)

func setup() (*echo.Echo, *xorm.Engine) {
	engine := biztestutil.ResetTestDB(nil)
	e := serve.EchoTestSetup()
	e.Use(ctx.Middleware())
	// 设置测试用户中间件
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cc := c.(ctx.Context)
			// 创建一个测试用户（UUID 不同于测试中使用的 test-uuid，避免触发"不能删除/禁用自己的账号"的检查）
			testUser := &db.User{
				UUID:   "admin-test-uuid",
				UserId: "admin",
				Name:   "测试管理员",
			}
			cc.SetUser(testUser)
			return next(c)
		}
	})
	group := e.Group("/admin/system")
	Attach(group, 0)

	testutil.PrintRoutes(e)
	return e, engine
}
