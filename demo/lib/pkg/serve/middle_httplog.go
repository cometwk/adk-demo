package serve

import (
	"bytes"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/cometwk/lib/pkg/env"
	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

var xlog = logrus.WithField("module", "server")

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

			var requestBody string
			var err error

			mimetype := req.Header.Get("content-type")
			if !strings.HasPrefix(mimetype, echo.MIMEMultipartForm) {
				if env.IsDebug() {
					// 如果请求体过大，会导致日志输出不全
					requestBody, _ = readRequestBody(c)
				}
			}

			// 执行下一个处理函数
			err = next(c)

			reqid := req.Header.Get(echo.HeaderXRequestID)
			if reqid == "" {
				reqid = res.Header().Get(echo.HeaderXRequestID)
			}

			latency := time.Since(start).Milliseconds()
			latencyHuman := fmt.Sprintf("%dms", latency)
			fields := logrus.Fields{
				"module":        "httplog",
				"start_time":    start,
				"latency":       latency,
				"latency_human": latencyHuman,
				"protocol":      req.Proto,
				"remote_ip":     c.RealIP(),
				"host":          req.Host,
				"method":        req.Method,
				"uri":           req.RequestURI,
				"path":          req.URL.Path,
				"route":         c.Path(),
				"reqid":         reqid,
				"referer":       req.Referer(),
				"user_agent":    req.UserAgent(),
				"status":        res.Status,
				"bytes_in":      req.Header.Get(echo.HeaderContentLength),
				"bytes_out":     res.Size,
				"request_body":  requestBody,
			}

			// 如果发生错误，记录错误信息
			if err != nil {
				fields["error"] = err.Error()
				if he, ok := err.(*echo.HTTPError); ok {
					fields["status"] = he.Code
				}
			}

			xlog.WithFields(fields).Info("request")

			return err
		}
	}
}
