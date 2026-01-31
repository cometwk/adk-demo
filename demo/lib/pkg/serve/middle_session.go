package serve

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/serve/session"
	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

func sessionMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {

			// 设置 request 中的 context 中的 reqid
			reqid := c.Response().Header().Get(echo.HeaderXRequestID)
			req := c.Request()
			ctx := orm.WithReqID(req.Context(), reqid) // 保存 reqid 到 context
			ctx = session.WithSession(ctx, nil)        // TODO: 保存 session 到 context
			req = req.WithContext(ctx)
			c.SetRequest(req)

			now := time.Now()
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
			// })
			// cc := &context[any]{c, l, nil, nil, nil, nil, nil}

			c.Response().Before(func() {
				urlpath := req.URL.Path
				method := req.Method

				elapsed := time.Since(now).Seconds()

				// 如果处理请求超出 3 秒，记录一条警告
				if elapsed > 3 {
					logrus.Warnf("%s %s 耗时 %f 秒", method, urlpath, elapsed)
				} else if elapsed > 1 {
					// 如果处理请求超出 1 秒，记录一条信息
					if env.IsDev() {
						s := fmt.Sprintf("%s %s 耗时 %f 秒", method, urlpath, elapsed)
						m := fmt.Sprintf("IP: `%s`, ReqID: `%s`", c.RealIP(), reqid)
						// event.Add(event.LevelTodo, s, m)
						logrus.Warnf("%s %s", s, m)
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

			return next(c)
		}
	}
}
