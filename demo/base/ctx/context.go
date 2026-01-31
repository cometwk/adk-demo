package ctx

import (
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"

	"github.com/cometwk/base/lib/db"
)

type AclAllows map[int]db.AclAllow

type Context interface {
	echo.Context
	// BindAndValidate(v interface{}) error

	Log() *logrus.Entry
	SetLog(l *logrus.Entry)
	ErrLog(err error) *logrus.Entry
	// BadRequest(err error) error
	User() *db.User
	SetUser(u *db.User)
	Acl() *db.Acl
	SetAcl(a *db.Acl)
	AclFeatures() []string
	SetAclFeatures(a []string)
	AclAllows() map[int]*db.AclAllow
	SetAclAllows(a map[int]*db.AclAllow)

	// custom define info
	SetInfo(info any)
	GetInfo() any

	// func
	Trim(args ...*string)
}

type context struct {
	echo.Context

	logger       *logrus.Entry
	user         *db.User
	acl          *db.Acl
	acl_features []string
	acl_allows   map[int]*db.AclAllow
	info         any
	// node         *db.Tree

}

func NewTestContext(c echo.Context) *context {
	return &context{c, logrus.WithField("reqid", uuid.NewString()), nil, nil, nil, nil, nil}
}

func (c *context) Log() *logrus.Entry {
	return c.logger
}

func (c *context) SetLog(l *logrus.Entry) {
	c.logger = l
}

func (c *context) ErrLog(err error) *logrus.Entry {
	return c.logger.WithError(err)
}

// // 当请求参数不完整时，使用这个函数记录错误原因，然后返回 BadRequest 错误
// func (c *context) BadRequest(err error) error {
// 	err = errors.Wrapf(err, "%s", c.Request().URL.String())
// 	c.ErrLog(err).Errorf("请求参数不完整(%s)", c.Request().URL.Path)
// 	return c.NoContent(http.StatusBadRequest)
// }

// // 获取配置
// func (c *context) Config() *config.ViperConfig {
// 	return c.config
// }

// 设置登录用户
func (c *context) SetUser(u *db.User) {
	c.user = u

	// 增加新的日志字段
	c.logger = c.logger.WithField("user", u.Name).WithField("userid", u.UserId)
}

// 获取登录用户
func (c *context) User() *db.User {
	return c.user
}

// 设置用户访问控制
func (c *context) SetAcl(a *db.Acl) {
	c.acl = a
}

// 获取用户访问控制
func (c *context) Acl() *db.Acl {
	return c.acl
}

// 设置用户访问控制特征
func (c *context) SetAclFeatures(a []string) {
	c.acl_features = a
}

// 获取用户访问控制特征
func (c *context) AclFeatures() []string {
	return c.acl_features
}

// 设置用户访问控制权限
func (c *context) SetAclAllows(a map[int]*db.AclAllow) {
	c.acl_allows = a
}

// 获取用户访问控制权限
func (c *context) AclAllows() map[int]*db.AclAllow {
	return c.acl_allows
}

func (c *context) SetInfo(info interface{}) {
	c.info = info
}

func (c *context) GetInfo() interface{} {
	return c.info
}

// 文件下载
// func (c *context) Download(b []byte, filename string) error {
// 	tmpfile, err := ioutil.TempFile(os.TempDir(), "download-*.tmp")
// 	if err != nil {
// 		c.ErrLog(err).Error("创建临时文件错")
// 		return c.NoContent(http.StatusInternalServerError)
// 	}
// 	defer os.Remove(tmpfile.Name())

// 	if _, err = tmpfile.Write(b); err != nil {
// 		c.ErrLog(err).Error("写入临时文件错")
// 		return c.NoContent(http.StatusInternalServerError)
// 	}
// 	if err = tmpfile.Close(); err != nil {
// 		c.ErrLog(err).Error("关闭临时文件错")
// 		return c.NoContent(http.StatusInternalServerError)
// 	}
// 	return c.Attachment(tmpfile.Name(), filename)
// }

// 去除字符串前后空白字符，用法:
//
//	c.Trim(&str1, &str2, ...)
func (c *context) Trim(args ...*string) {
	for _, v := range args {
		*v = strings.TrimSpace(*v)
	}
}

// func BindAndValidate[T any](c echo.Context) (*T, error) {
// 	var u T
// 	err := c.Bind(&u)
// 	if err != nil {
// 		return nil, err
// 	}
// 	if err = c.Validate(u); err != nil {
// 		return nil, err
// 	}
// 	return &u, nil
// }

// func (c *context) BindAndValidate(v any) error {
// 	err := c.Bind(v)
// 	if err != nil {
// 		return err
// 	}
// 	if err = c.Validate(v); err != nil {
// 		return err
// 	}
// 	return nil
// }

// // 设置用户绑定的节点
// func (c *Context) SetNode(n *db.Tree) {
// 	c.node = n

// 	// 增加新的日志字段
// 	c.logger = c.logger.WithField("node", n.Name)
// }

// // 获取用户绑定的节点
// func (c *Context) Node() *db.Tree {
// 	return c.node
// }

// // 通过类型查询节点(包含子节点)绑定的实体
// func (c *Context) NodeEntities(tp int) ([]db.TreeBind, error) {
// 	if c.node == nil {
// 		return nil, fmt.Errorf("用户没有绑定节点")
// 	}
// 	if c.node.Disabled {
// 		return nil, fmt.Errorf("用户绑定的节点已被禁用")
// 	}
// 	// 查询用户绑定节点的所有子节点
// 	ql := `select uuid from tree where disabled = false and tpath like ?`
// 	var nodes []string

// 	err := db.Select(ql, &nodes, c.node.TPath+"%")
// 	if err != nil {
// 		return nil, err
// 	}
// 	// 查询节点关联的实体
// 	ql = `select * from tree_bind where node in (?) and type = ?`
// 	ql, args, err := db.In(ql, nodes, tp)
// 	if err != nil {
// 		return nil, err
// 	}
// 	var binds []db.TreeBind

// 	err = db.Select(ql, &binds, args...)
// 	if err != nil {
// 		return nil, err
// 	}
// 	return binds, nil
// }
