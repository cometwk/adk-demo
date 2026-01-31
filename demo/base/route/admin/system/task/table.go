package task

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/base/pkg/utils"
	"github.com/cometwk/base/route/admin/secretcode"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/labstack/echo/v4"
)

func attach(e *echo.Group) {
	var h = &handler{
		serve.CrudHandler[db.Task]{
			Model:  orm.MustEntityOps[db.Task](),
			Prefix: "",
		},
	}

	// override
	e.POST("/create", add)
	e.POST("/update", update)

	// common handler
	e.GET("/search", h.SearchPage)
	e.GET("/find/:id", h.FindById)
	e.POST("/delete/:id", h.Delete, secretcode.Verify())
}

type handler struct {
	serve.CrudHandler[db.Task]
}

// Delete 删除记录
func (h *handler) Delete(c echo.Context) error {
	cc := c.(ctx.Context)

	uuid, err := utils.GetUnescapedParam(c, "id")
	if err != nil {
		return err
	}

	// 先停止任务
	if err = task.Remove(uuid); err != nil {
		cc.ErrLog(err).Error("停止任务错")
		return c.NoContent(http.StatusInternalServerError)
	}

	return h.CrudHandler.Delete(c)
}
