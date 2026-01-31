package job

import (
	"github.com/cometwk/lib/pkg/queue"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/labstack/echo/v4"
)

type historyHandler struct {
	*serve.CrudHandler[queue.JobHistory]
}

func historyAttach(e *echo.Group) {
	handler := &historyHandler{
		serve.NewCrudHandler[queue.JobHistory](""),
	}

	// // override create route
	// e.POST("/create", handler.Create)

	// 搜索带分页
	e.GET("/search", handler.SearchPage)

	// // 条件查询
	// e.GET("/query", handler.Query)

	// // 按ID查找
	// e.GET("/find/:id", handler.FindById)

	// // 更新记录
	// e.POST("/update", handler.Update)

	// extend routes
}
