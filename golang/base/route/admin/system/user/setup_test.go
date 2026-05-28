package user

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/ctx"
	"github.com/lucky-byte/base/lib/db"
	biztestutil "github.com/lucky-byte/base/model/testutil"
	"github.com/lucky-byte/lib/pkg/serve"
	"github.com/lucky-byte/lib/pkg/testutil"
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
