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

	// 设置测试用户中间件 - 确保与数据库数据一致
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cc := c.(ctx.Context)
			// 创建测试用户，数据与数据库插入保持一致
			testUser := &db.User{
				UUID:   "test-user-uuid",
				UserId: "testuser",
				Name:   "测试用户",
				Email:  "test@example.com",
				Mobile: "13800138000",
			}
			cc.SetUser(testUser)
			return next(c)
		}
	})
	group := e.Group("/admin")
	Attach(group)

	engine.Exec(`delete from users where uuid = 'test-user-uuid'`)
	engine.Exec(`delete from users where userid = 'testuser'`)
	sql := `INSERT INTO users (uuid,create_at,update_at,signin_at,disabled,deleted,userid,passwd,name,avatar,email,mobile,idno,address,acct_name,acct_no,acct_idno,acct_mobile,acct_bank_name,tfa,acl,secretcode,totp_secret,n_signin,noti_popup,noti_browser,noti_mail) VALUES
	 ('test-user-uuid','2025-01-01 03:45:36','2025-01-01 03:45:36','2025-02-11 03:52:13',0,0,'testuser','$argon2id$v=19$m=65536,t=3,p=2$hbEf+FyI2S0jmghnO5+7jw$gljag6J+YGV4jfhkpaNDxcZVBDIvShw5QqnrF9Mehrg','测试用户','','test@example.com','13800138000','','','','','','','',0,'7e9633f6-c83a-49a4-9a96-e120d6ca6055','','',87,1,0,0);`
	_, err := engine.Exec(sql)
	if err != nil {
		panic(err)
	}

	testutil.PrintRoutes(e)
	return e, engine
}
