package task

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group, code int) {

	group := up.Group("/task")
	attach(group)

	// other
	group.GET("/testcron", testcron)
	group.GET("/funcs", funcs)
	group.GET("/entries", entries)

	// 立即执行任务
	group.POST("/fire/:primary", fire)
	// 禁用任务
	group.POST("/disable/:primary", disable)

	// 清理任务历史
	group.GET("/inst/search", instSearchPage)
	group.POST("/inst/clean", inst_clean)
}
