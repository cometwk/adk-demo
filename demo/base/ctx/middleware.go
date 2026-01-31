package ctx

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cometwk/base/lib/event"
	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/labstack/echo/v4"
	"github.com/mssola/user_agent"
	"github.com/sirupsen/logrus"
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

			// 设置 request 中的 context 中的 reqid
			reqid := c.Response().Header().Get(echo.HeaderXRequestID)
			req := c.Request()
			req = req.WithContext(orm.WithReqID(req.Context(), reqid))
			c.SetRequest(req)

			ua := user_agent.New(req.UserAgent())

			osinfo := ua.OSInfo()
			os := fmt.Sprintf("%s %s", osinfo.Name, osinfo.Version)

			name, version := ua.Browser()
			browser := fmt.Sprintf("%s %s", name, version)

			// 将 logger 附属到 Context，后续可以使用
			l := logrus.WithFields(logrus.Fields{
				FReqID:   reqid,
				FPath:    req.URL.Path,
				FMethod:  req.Method,
				FIP:      c.RealIP(),
				FOS:      os,
				FBrowser: browser,
			})
			cc := &context{c, l, nil, nil, nil, nil, nil}

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
