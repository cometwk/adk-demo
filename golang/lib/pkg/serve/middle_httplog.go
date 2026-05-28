package serve

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/lib/pkg/env"
	"github.com/lucky-byte/lib/pkg/log"
	"github.com/mssola/user_agent"
	"github.com/sirupsen/logrus"
)

// VictoriaLogs: _stream_fields=module,level,feature
const (
	FReqID   = "reqid"   // http request id
	FModule  = "module"  // http request module
	FFeature = "feature" // http request feature
	// FIP      = "ip"      // http client ip
	// FPath    = "path"    // http request url path
	// FMethod  = "method"  // http request method
	// FOS      = "os"      // user agent os
	// FBrowser = "browser" // user agent browser
)

// var xlog = logrus.WithField("module", "server")

func readRequestBody(c echo.Context) (string, error) {
	req := c.Request()
	bodyBytes, err := io.ReadAll(req.Body)
	if err != nil {
		return "", err
	}
	req.Body.Close()
	req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	return string(bodyBytes), nil
}

// route 应用的开始！
func httpLogMiddleware() echo.MiddlewareFunc {
	return simpleRequestLogger()
}

func simpleRequestLogger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// 请求开始前记录时间
			start := time.Now()
			req := c.Request()
			res := c.Response()

			// 读取 context 中的 reqid
			reqid := c.Response().Header().Get(echo.HeaderXRequestID)
			ua := user_agent.New(req.UserAgent())

			osinfo := ua.OSInfo()
			os := fmt.Sprintf("%s %s", osinfo.Name, osinfo.Version)

			name, version := ua.Browser()
			browser := fmt.Sprintf("%s %s", name, version)

			// // 将 logger 附属到 Context，后续可以使用
			// l := logrus.WithFields(logrus.Fields{
			// 	FReqID:   reqid,
			// 	FFeature: c.Path(), // 添加 feature 字段，使用 Echo 的路由路径
			// 	// FPath:     req.URL.Path,
			// 	// FMethod:   req.Method,
			// 	// FIP:       c.RealIP(),
			// 	// FOS:       os,
			// 	// FBrowser:  browser,
			// })

			// 使用新的 log API 设置 reqid 和 logger 到 context
			ctx := log.WithReqID(req.Context(), reqid)
			ctx = log.WithFeature(ctx, c.Path())
			// ctx = log.WithModule(ctx, "httplog")
			req = req.WithContext(ctx)
			c.SetRequest(req)

			var requestBody string
			var err error

			mimetype := req.Header.Get("content-type")
			if !strings.HasPrefix(mimetype, echo.MIMEMultipartForm) {
				if env.IsDebug() {
					// 如果请求体过大，会导致日志输出不全
					requestBody, _ = readRequestBody(c)
				}
			}

			xlog := log.Logger(ctx)

			// dump request header with startWith x- or X-
			for k := range req.Header {
				if strings.HasPrefix(k, "x-") || strings.HasPrefix(k, "X-") {
					xlog.WithField(k, req.Header.Get(k))
				}
			}

			xlog.WithField(FModule, "httplog").
				// WithField("user_agent", req.UserAgent()).
				WithField("browser", browser).
				WithField("os", os).
				WithField("referer", req.Referer()).
				WithField("host", req.Host).
				WithField("ip", c.RealIP()).
				WithField("bytes_in", req.Header.Get(echo.HeaderContentLength)).
				WithField("request_body", requestBody).
				Infof("%s %s %s", req.Method, req.Proto, req.RequestURI)

			// 执行下一个处理函数
			err = next(c)

			// reqid := req.Header.Get(echo.HeaderXRequestID)
			// if reqid == "" {
			// 	reqid = res.Header().Get(echo.HeaderXRequestID)
			// }

			latency := time.Since(start).Milliseconds()
			latencyHuman := fmt.Sprintf("%dms", latency)
			fields := logrus.Fields{
				"module":        "httplog",
				"start_time":    start,
				"latency":       latency,
				"latency_human": latencyHuman,
				"protocol":      req.Proto,
				"ip":            c.RealIP(),
				"host":          req.Host,
				"method":        req.Method,
				"uri":           req.RequestURI, // 原始请求路径, 包含 query 参数
				"path":          req.URL.Path,   // 被解析过后的请求路径, 且只包含path
				"route":         c.Path(),       // 路由模版
				"reqid":         reqid,
				"referer":       req.Referer(),
				// "user_agent":    req.UserAgent(),
				"browser":   browser,
				"os":        os,
				"status":    res.Status,
				"bytes_in":  req.Header.Get(echo.HeaderContentLength),
				"bytes_out": res.Size,
				// "request_body": requestBody,
			}

			// 如果发生错误，记录错误信息
			if err != nil {
				fields["error"] = err.Error()
				if he, ok := err.(*echo.HTTPError); ok {
					fields["status"] = he.Code
				}
			}

			xlog.WithFields(fields).Infof("%d %s", res.Status, req.RequestURI)

			return err
		}
	}
}
