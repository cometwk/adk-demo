package auth

import (
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"
)

// 登录 Token 必须有效, 2FA 认证时调用
func CheckBy2FA(c echo.Context) error {
	_, err := checkUserToken(c, false)
	if err != nil {
		return err
	}
	return nil
}

func checkUserToken(c echo.Context, checkActivate bool) (*authInfo, error) {
	cc := c.(ctx.Context)

	// 验证登录 TOKEN
	authToken := c.Request().Header.Get("Authorization")
	if len(authToken) == 0 {
		// 尝试从 x-auth-token 获取
		authToken = c.Request().Header.Get("x-auth-token")
		if len(authToken) == 0 {
			return nil, errors.New("认证失败, 请求缺少认证 TOKEN")
		}
	}
	// 处理 Bearer token
	parts := strings.Split(authToken, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return nil, errors.New("认证失败, Bearer token 格式错误")
	}
	authToken = parts[1]

	jwt, err := JWTParse(c, authToken)
	if err != nil {
		return nil, errors.Wrap(err, "认证失败, 解析 TOKEN 错误")
	}
	// 可能还未激活，例如未完成短信认证的情况下
	if checkActivate && !jwt.Activate {
		return nil, errors.New("认证失败, TOKEN 尚未激活, 可能还未完成 2FA 认证")
	}
	authInfo, err := jwtCache.fetch(cc, jwt.User)
	if err != nil {
		return nil, errors.Wrap(err, "认证失败，查询用户信息错")
	}
	return authInfo, nil
}

const ApiPrefix = "/admin"

// 认证，每个受保护的请求都先经过此函数认证通过后才能调用，因此这是一个执行频率非常高的函数
func Authentication(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		cc := c.(ctx.Context)

		// // 检查是否是公开访问的路由
		// if !strings.HasPrefix(c.Request().URL.Path, ApiPrefix) {
		// 	return next(c)
		// }

		// // 登录接口不验证
		// if strings.HasPrefix(c.Request().URL.Path, ApiPrefix+"/login") {
		// 	return next(c)
		// }
		// if strings.HasPrefix(c.Request().URL.Path, ApiPrefix+"/pub") {
		// 	return next(c)
		// }

		// 验证登录 TOKEN
		authInfo, err := checkUserToken(c, true)
		if err != nil {
			cc.ErrLog(err).Error("认证失败")
			return c.NoContent(http.StatusUnauthorized)
		}

		if authInfo.acl.Code != 0 {
			// Code = 0 表示超级管理员，可以访问所有接口

			// 检查用户访问控制
			url := cc.Request().URL.Path
			method := cc.Request().Method
			uri := strings.TrimPrefix(url, ApiPrefix)
			ok := FilterByUserAcls(method, uri, authInfo.allows)
			if !ok {
				cc.Log().Errorf("用户 %s 没有访问 %s 的权限", authInfo.user.Name, url)
				return c.NoContent(http.StatusForbidden)
			}
		}

		// TODO: 查询用户绑定的层级节点
		// err = setTreeNode(cc)
		// if err != nil {
		// 	cc.ErrLog(err).Error("认证失败，查询绑定节点错")
		// 	return c.NoContent(http.StatusUnauthorized)
		// }
		return next(c)
	}
}

// // 查询用户信息，存储到 ctx.Context 中
// func setAuthUser(cc ctx.Context, user_uuid string) error {
// 	ql := `select * from users where uuid = ?`
// 	var user db.User

// 	// 查询用户信息
// 	err := db.SelectOneX(cc, ql, &user, user_uuid)
// 	if err != nil {
// 		return errors.Wrap(err, "未查询到用户信息")
// 	}
// 	// 检查用户状态
// 	if user.Disabled || user.Deleted {
// 		return errors.Wrapf(err, "用户 %s 已被禁用或删除", user.Name)
// 	}
// 	cc.SetUser(&user)

// 	return nil
// }

// // 查询用户访问控制角色，存储到 ctx.Context 中
// func SetAcl(cc ctx.Context) error {
// 	user := cc.User()

// 	ql := `select * from acl where uuid = ?`
// 	var acl db.Acl

// 	err := db.SelectOneX(cc, ql, &acl, user.ACL)
// 	if err != nil {
// 		return errors.Wrapf(err, "查询用户 %s 访问控制信息错", user.Name)
// 	}
// 	cc.SetAcl(&acl)

// 	features := strings.Split(acl.Features, ",")

// 	// 是否含有 nologin 特征，如果有则不允许登录
// 	for i, feature := range features {
// 		trimed := strings.TrimSpace(feature)

// 		if trimed == "nologin" {
// 			return fmt.Errorf("用户 %s 角色 %s 含有 nologin 特征", user.Name, acl.Name)
// 		}
// 		features[i] = trimed
// 	}
// 	cc.SetAclFeatures(features)

// 	ql = `select * from acl_allows where acl = ?`
// 	var allows []db.AclAllow

// 	err = db.SelectX(cc, ql, &allows, user.ACL)
// 	if err != nil {
// 		return errors.Wrapf(err, "查询用户 %s 访问控制错误", user.Name)
// 	}
// 	cc.SetAclAllows(allows)

// 	return nil
// }

// // 查询用户绑定的层级节点
// func setTreeNode(cc ctx.Context) error {
// 	user := cc.User()

// 	ql := `
// 		select * from tree where uuid = (
// 			select node from tree_bind where entity = ? and type = 1
// 		)
// 	`
// 	var nodes []db.Tree

// 	err := db.Select(ql, &nodes, user.UUID)
// 	if err != nil {
// 		return errors.Wrapf(err, "查询用户 %s 绑定节点错误", user.Name)
// 	}
// 	if len(nodes) == 1 {
// 		cc.SetNode(&nodes[0])
// 	}
// 	return nil
// }

type authInfo struct {
	user         *db.User
	acl          *db.Acl
	acl_features []string
	allows       map[int]*db.AclAllow
}

type authCache struct {
	cache      map[string]*authInfo
	cacheMutex sync.RWMutex // 添加读写锁
}

var jwtCache = &authCache{
	cache:      make(map[string]*authInfo),
	cacheMutex: sync.RWMutex{},
}

func (c *authCache) fetch(cc ctx.Context, key string) (*authInfo, error) {

	info, ok := c.get(key)
	if !ok {
		var err error
		info, err = fetchInfo(cc, key)
		if err != nil {
			return nil, err
		}
		c.set(key, info)
	}
	cc.SetUser(info.user)
	cc.SetAcl(info.acl)
	cc.SetAclFeatures(info.acl_features)
	cc.SetAclAllows(info.allows)

	return info, nil
}

func (c *authCache) get(key string) (*authInfo, bool) {
	c.cacheMutex.RLock()
	defer c.cacheMutex.RUnlock()
	info, ok := c.cache[key]
	return info, ok
}
func (c *authCache) set(key string, info *authInfo) {
	c.cacheMutex.Lock()
	defer c.cacheMutex.Unlock()
	c.cache[key] = info
}
func (c *authCache) clear(key string) {
	c.cacheMutex.Lock()
	defer c.cacheMutex.Unlock()
	delete(c.cache, key)
}

func fetchInfo(cc echo.Context, user_uuid string) (*authInfo, error) {
	info := authInfo{}

	{
		// 查询用户信息
		ql := `select * from users where uuid = ?`
		var user db.User

		// 查询用户信息
		err := db.SelectOneX(cc, ql, &user, user_uuid)
		if err != nil {
			return nil, errors.Wrap(err, "未查询到用户信息")
		}
		// 检查用户状态
		if user.Disabled || user.Deleted {
			return nil, errors.Wrapf(err, "用户 %s 已被禁用或删除", user.Name)
		}
		info.user = &user
	}

	{
		user := info.user

		// 查询用户访问控制角色
		ql := `select * from acl where uuid = ?`
		var acl db.Acl

		err := db.SelectOneX(cc, ql, &acl, user.ACL)
		if err != nil {
			return nil, errors.Wrapf(err, "查询用户 %s 访问控制信息错", user.Name)
		}
		info.acl = &acl

		features := strings.Split(acl.Features, ",")

		// 是否含有 nologin 特征，如果有则不允许登录
		for i, feature := range features {
			trimed := strings.TrimSpace(feature)

			if trimed == "nologin" {
				return nil, fmt.Errorf("用户 %s 角色 %s 含有 nologin 特征", user.Name, acl.Name)
			}
			features[i] = trimed
		}
		info.acl_features = features

		ql = `select * from acl_allows where acl = ?`
		var allows []db.AclAllow

		err = db.SelectX(cc, ql, &allows, user.ACL)
		if err != nil {
			return nil, errors.Wrapf(err, "查询用户 %s 访问控制错误", user.Name)
		}
		allowsMap := make(map[int]*db.AclAllow)
		for _, allow := range allows {
			allowsMap[allow.Code] = &allow
		}
		info.allows = allowsMap
	}

	return &info, nil
}

// 清除用户缓存
func ClearJwtCache(user_uuid string) {
	jwtCache.clear(user_uuid)
}

// 清除所有用户缓存
func ClearAllJwtCache() {
	jwtCache.cacheMutex.Lock()
	defer jwtCache.cacheMutex.Unlock()
	jwtCache.cache = make(map[string]*authInfo)
}
