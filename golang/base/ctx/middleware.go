package ctx

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/lib/event"
	"github.com/lucky-byte/lib/pkg/env"
	"github.com/lucky-byte/lib/pkg/log"
)

// common field names
const (
	FReqID   = "reqid"   // http request id
	FIP      = "ip"      // http client ip
	FPath    = "path"    // http request url path
	FMethod  = "method"  // http request method
	FOS      = "os"      // user agent os
	FBrowser = "browser" // user agent browser
)

func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			now := time.Now()

			// // 设置 request 中的 context 中的 reqid
			// reqid := c.Response().Header().Get(echo.HeaderXRequestID)
			reqid := log.GetReqID(c.Request().Context())
			req := c.Request()

			// ua := user_agent.New(req.UserAgent())

			// osinfo := ua.OSInfo()
			// os := fmt.Sprintf("%s %s", osinfo.Name, osinfo.Version)

			// name, version := ua.Browser()
			// browser := fmt.Sprintf("%s %s", name, version)

			// // 将 logger 附属到 Context，后续可以使用
			// l := logrus.WithFields(logrus.Fields{
			// 	FReqID:   reqid,
			// 	FPath:    req.URL.Path,
			// 	FMethod:  req.Method,
			// 	FIP:      c.RealIP(),
			// 	FOS:      os,
			// 	FBrowser: browser,
			// 	"feature": c.Path(), // 添加 feature 字段，使用 Echo 的路由路径
			// })

			l := log.Logger(c.Request().Context())
			cc := &context{c, l, nil, nil, nil, nil, nil}

			// 使用新的 log API 设置 reqid 和 logger 到 context
			// ctx := log.WithReqID(req.Context(), reqid)
			// ctx = log.WithLogger(ctx, l)
			// req = req.WithContext(ctx)
			// c.SetRequest(req)

			c.Response().Before(func() {
				urlpath := req.URL.Path
				method := req.Method

				elapsed := time.Since(now).Seconds()

				// 如果处理请求超出 3 秒，记录一条警告
				if elapsed > 3 {
					cc.Log().Warnf("%s %s 耗时 %f 秒", method, urlpath, elapsed)
				} else if elapsed > 1 {
					// 如果处理请求超出 1 秒，记录一条信息
					if env.IsDebug() {
						s := fmt.Sprintf("%s %s 耗时 %f 秒", method, urlpath, elapsed)
						m := fmt.Sprintf("IP: `%s`, ReqID: `%s`", c.RealIP(), reqid)
						event.Add(event.LevelTodo, s, m)
					}
				}
				// 对于下列资源启用客户端缓存
				if c.Request().Method == http.MethodGet {
					if strings.HasPrefix(urlpath, "/static/js/") {
						c.Response().Header().Set("cache-control", "max-age=31536000")
					}
					if strings.HasPrefix(urlpath, "/static/media/") {
						c.Response().Header().Set("cache-control", "max-age=31536000")
					}
					if strings.HasPrefix(urlpath, "/static/css/") {
						c.Response().Header().Set("cache-control", "max-age=31536000")
					}
				}
			})
			return next(cc)
		}
	}
}
