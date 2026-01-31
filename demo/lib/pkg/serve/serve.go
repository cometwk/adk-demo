package serve

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"

	"net/http"
	"os"
	"os/signal"
	"path"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/cometwk/lib/pkg/bean"
	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/log"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/sirupsen/logrus"
	"golang.org/x/net/http2"
)

// type ServerOptions struct {
// 	// WebFS *embed.FS
// 	// 	// Debug bool
// 	// 	// BizAPI   func(e *echo.Group) error // 业务API初始化
// 	// 	// BizAdmin func(e *echo.Group) error // 业务管理初始化
// 	// 	// InitFunc func()                    // 业务ORM初始化
// 	// 	// Entries  []auth.CodeEntry
// }

type EchoServer struct {
	engine        *echo.Echo
	web_directory string
	webFS         fs.FS
	// options       *ServerOptions
	initFunc func(e *echo.Echo) error
}

func NewEchoServer(init func(e *echo.Echo) error, webFS fs.FS) *EchoServer {
	return &EchoServer{
		engine:   echo.New(),
		webFS:    webFS,
		initFunc: init,
	}
}

func (e *EchoServer) Start() {
	debug := env.IsDebug()
	dev := env.IsDev()
	fmt.Printf("DEBUG: %v\n", debug)
	fmt.Printf("DEV: %v\n", dev)

	// options := e.options
	// webfs := e.webFS

reboot:
	// 集群主机ID设置
	// utils.SetHostId(config.CLUSTER)

	// 确保日志文件存在
	logdir := env.DirPath("LOG_DIR", "./log")
	if err := os.MkdirAll(logdir, 0o755); err != nil {
		logrus.Fatalf("创建目录 '%s' 错: %v", logdir, err)
	}

	// 临时文件目录
	tmpdir := env.DirPath("TMP_DIR", "./tmp")
	if err := os.MkdirAll(tmpdir, 0o755); err != nil {
		logrus.Fatalf("创建临时目录 '%s' 错: %v", tmpdir, err)
	}

	// 设置 logrus
	log.InitDebug()
	logfile := env.String("LOG_FILE", "main.log")
	rotate_logger := log.NewLogWriter(path.Join(logdir, logfile))
	logrus.SetOutput(rotate_logger)
	level := env.String("LOG_LEVEL", "debug")
	switch level {
	case "debug":
		logrus.SetLevel(logrus.DebugLevel)
	case "info":
		logrus.SetLevel(logrus.InfoLevel)
	case "warn":
		logrus.SetLevel(logrus.WarnLevel)
	case "error":
		logrus.SetLevel(logrus.ErrorLevel)
	default:
		logrus.SetLevel(logrus.InfoLevel)
	}

	// orm 日志
	logger := logrus.WithField("reqid", "abc").WithField("id", "").WithField("module", "orm")
	orm.SetLogger(logger)

	// HTTP 服务器
	engine := e.engine
	engine.Debug = debug
	engine.HideBanner = true
	engine.HTTPErrorHandler = e.createhttpErrorHandler()
	engine.Logger = &customLogger{Logger: logrus.WithField("module", "echo")}

	// 基础中间件
	engine.Use(middleware.Recover())
	engine.Use(middleware.RequestIDWithConfig(middleware.RequestIDConfig{
		Generator: func() string {
			return util.NextId("W") // W0000 = WEB跟踪号, 0000 = 业务流水号
		},
	}))
	engine.Use(middleware.BodyLimit("10M")) // 限制请求报文大小

	// 自定义 middleware
	// engine.Use(sessionMiddleware())
	engine.Use(httpLogMiddleware()) // 设置 HTTP 日志
	if dev {
		engine.Use(dumpMiddleware) // 开发日志
	}

	// JSON 校验
	engine.Validator = NewCustomValidator()
	engine.Binder = &customBinder{}

	// Route => handler
	// engine.GET("/", HelloWorld)

	// // 使用 Static 中间件 (HTML5: true 是关键)
	// // 它的逻辑是：
	// // - 如果请求的文件存在（例如 /assets/app.js），就返回文件。
	// // - 如果文件不存在（例如 /user/123），就自动返回 index.html。
	// engine.Use(middleware.StaticWithConfig(middleware.StaticConfig{
	// 	Root:       "web/dist",       // 根目录是 web/dist
	// 	HTML5:      true,             // ✅ 开启 SPA 模式 (自动 fallback 到 index.html)
	// 	Filesystem: http.FS(e.webFS), // 适配 embed

	// 	// 🔥 关键点：跳过 /api 开头的请求
	// 	// 这样 /api/xxx 就会透传给下面的路由，而不是被当做 SPA 返回 index.html
	// 	Skipper: func(c echo.Context) bool {
	// 		path := c.Path()
	// 		return strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/admin")
	// 	},
	// }))

	// 速率限制
	rlconfig := middleware.DefaultRateLimiterConfig
	rlconfig.Store = middleware.NewRateLimiterMemoryStore(20)
	rlconfig.Skipper = func(c echo.Context) bool {
		// GET 方法不限制
		return c.Request().Method == http.MethodGet
	}
	engine.Use(middleware.RateLimiterWithConfig(rlconfig))
	// engine.Use(auth.Authentication)
	// engine.Use(ops.Recorder)

	if e.initFunc != nil {
		if err := e.initFunc(engine); err != nil {
			logrus.WithError(err).Fatal("初始化失败")
			return
		}
	}

	// 打印所有的bean
	{
		bean.PrintBeans()
	}

	// 打印所有路由
	if env.IsDev() {
		routes := engine.Routes()

		sort.SliceStable(routes, func(i, j int) bool {
			return routes[i].Path < routes[j].Path
		})
		sb := strings.Builder{}

		for i, v := range routes {
			if v.Method == "echo_route_not_found" {
				// 打印这个时，太乱
				continue
			}

			arr := strings.Split(v.Name, "/")
			fn := arr[len(arr)-1]
			sb.WriteString(
				fmt.Sprintf("\n%4d %-6s %-42s %s", i, v.Method, v.Path, fn),
			)
		}
		fmt.Printf("%s\n", sb.String())
	}

	// // 执行文件中通过 go:embed 打包了 WEB 静态文件
	// // 如果命令行选项 -webfs 设置为 osdir，那么使用文件系统中的 WEB 静态文件，
	// // 而不是打包的静态文件，如果 -webfs 设置为 embed，则使用打包的静态文件
	// if webfs != nil {
	// 	fsys, err := fs.Sub(webfs, "web")
	// 	if err != nil {
	// 		logrus.Fatalf("不能加载嵌入的 WEB 静态文件: %v", err)
	// 	}
	// 	handler := echo.WrapHandler(http.FileServer(http.FS(fsys)))

	// 	list, err := fs.ReadDir(fsys, ".")
	// 	if err != nil {
	// 		logrus.Fatalf("读嵌入 WEB 目录错 %v", err)
	// 	}
	// 	for _, f := range list {
	// 		if f.Type().IsRegular() {
	// 			engine.GET("/"+f.Name(), handler)
	// 		}
	// 		if f.Type().IsDir() {
	// 			engine.GET("/"+f.Name()+"/*", handler)
	// 		}
	// 	}
	// } else {
	// 	webdir := env.String("WEB_DIR", "./web")
	// 	if len(webdir) > 0 {
	// 		if info, err := os.Stat(webdir); err != nil || !info.IsDir() {
	// 			logrus.Warnf("WEB 目录 '%s' 不是一个目录", webdir)
	// 		} else {
	// 			e.web_directory = webdir
	// 			engine.Static("/", e.web_directory)
	// 		}
	// 	}
	// }

	// 在 goroutine 中启动服务器，这样主 goroutine 不会阻塞
	go startup(engine)

	// 捕获系统信号，优雅的退出
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	s := <-quit

	logrus.Infof("接收到信号 %s", s.String())

	// 当收到信号时停止服务器
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := engine.Shutdown(ctx); err != nil {
		logrus.WithError(err).Fatal("强制关闭服务器")
	}

	// SIGHUP 导致服务器重启
	if s == syscall.SIGHUP {
		goto reboot
	}
}

// 在单独的 goroutine 中启动 http 服务
func startup(engine *echo.Echo) {
	bind := env.String("HOST", "") + ":" + env.String("PORT", "4444")
	secure := false

	if len(bind) == 0 {
		if secure {
			bind = ":https"
		} else {
			bind = ":http"
		}
	}

	// 不安全的 http 服务器
	// 启动 http/2 cleartext 服务器(HTTP2 over HTTP)
	if !secure {
		h2s := &http2.Server{
			MaxReadFrameSize:     1024 * 1024 * 5,
			MaxConcurrentStreams: 250,
			IdleTimeout:          10 * time.Second,
		}
		logrus.Printf("HTTP 服务 %d 准备就绪, 监听地址 %s\n", os.Getpid(), bind)

		if err := engine.StartH2CServer(bind, h2s); err != nil {
			if errors.Is(err, http.ErrServerClosed) {
				engine.Logger.Debug("服务器关闭, 清理...")
			} else {
				logrus.WithError(err).Fatalf("启动服务器错: %v", err)
			}
		}
	} else {
		panic("use nginx or caddy to serve https")
	}
}

func (e *EchoServer) createhttpErrorHandler() echo.HTTPErrorHandler {
	// web_directory := e.web_directory
	// webfs := e.webFS

	// HTTP 错误处理
	httpErrorHandler := func(err error, c echo.Context) {
		// log := logrus.WithField("reqid", "abc").WithField("id", "123").WithField("app", "demo")

		url := c.Request().URL.String()
		method := c.Request().Method

		// // 前端是使用客户端路由的 React 应用，为了支持用户从任意路径访问，例如 /some/place
		// // (/some/place 是客户端路由)，需要响应 index.html 而不是 404
		// if e, ok := err.(*echo.HTTPError); ok {
		// 	if (e.Code == 404 || e.Code == 405) && method == http.MethodGet {
		// 		accept := c.Request().Header["Accept"]
		// 		if len(accept) > 0 && strings.Contains(accept[0], "text/html") {
		// 			log.WithField("url", url).Infof("%s 未找到, 返回 index.html", url)
		// 			if webfs != nil {
		// 				content, err := fs.ReadFile(webfs, "web/index.html")
		// 				if err != nil {
		// 					logrus.Errorf("读 web/index.html 错: %v", err)
		// 					c.NoContent(http.StatusInternalServerError)
		// 					return
		// 				}
		// 				c.HTML(http.StatusOK, string(content))
		// 			} else {
		// 				c.Response().Status = http.StatusOK
		// 				c.File(path.Join(web_directory, "index.html"))
		// 			}
		// 			return
		// 		}
		// 	}
		// }

		reqid := c.Response().Header().Get(echo.HeaderXRequestID)
		xlog.WithField("reqid", reqid).WithField("url", url).WithField("method", method).WithError(err).
			Infof("HTTP服务错误: url: %s, %v", url, err)

		// 默认错误处理
		// c.Echo().DefaultHTTPErrorHandler(err, c)
		e.DefaultHTTPErrorHandler(err, c)
	}
	return httpErrorHandler
}

// COPY FROM: c.Echo().DefaultHTTPErrorHandler(err, c)
func (e *EchoServer) DefaultHTTPErrorHandler(err error, c echo.Context) {

	if c.Response().Committed {
		return
	}

	he, ok := err.(*echo.HTTPError)
	if ok {
		if he.Internal != nil {
			if herr, ok := he.Internal.(*echo.HTTPError); ok {
				he = herr
			}
		}
	} else {
		he = &echo.HTTPError{
			Code:    http.StatusInternalServerError,
			Message: http.StatusText(http.StatusInternalServerError),
		}
	}

	// Issue #1426
	code := he.Code
	message := he.Message

	switch m := he.Message.(type) {
	case string:
		// if e.Debug {
		// 	message = Map{"message": m, "error": err.Error()}
		// } else {
		message = echo.Map{"message": m}
		// }
	case json.Marshaler:
		// do nothing - this type knows how to format itself to JSON
	case error:
		message = echo.Map{"message": m.Error()}
	}

	// Send response
	if c.Request().Method == http.MethodHead { // Issue #608
		err = c.NoContent(he.Code)
	} else {
		err = c.JSON(code, message)
	}
	if err != nil {
		// e.Logger.Error(err)
	}
}
