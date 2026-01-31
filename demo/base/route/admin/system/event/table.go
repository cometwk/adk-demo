package event

import (
	"net/http"
	"strings"
	"time"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/labstack/echo/v4"
	"xorm.io/builder"
)

type tableHandler struct{}

func newTableHandler() *tableHandler {
	return &tableHandler{}
}

func (h *tableHandler) Attach(e *echo.Group) {
	// 搜索带分页
	e.GET("/search", h.SearchPage)

	e.POST("/delete7", h.DeleteWhere7)
}

// SearchPage 搜索带分页
func (h *tableHandler) SearchPage(c echo.Context) error {
	cc := c.(ctx.Context)
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	fresh := input["fresh"]
	delete(input, "fresh")

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	// ql := `select count(*) from events where fresh = true and level in ?`
	if fresh == "true" {
		session.Where(builder.Eq{"fresh": true})
	}
	pageResult, err := model.EventModel.WithSession(session).SearchPage(input)
	if err != nil {
		return err
	}

	// 查询未读事件数
	levelIn := []string{}
	if levelInStr := c.QueryParam("where.level.in"); levelInStr != "" {
		levelIn = strings.Split(levelInStr, ",")
	}

	if len(levelIn) > 0 {
		session.Where(builder.In("level", levelIn))
	}
	freshCount, err := session.Where(builder.Eq{"fresh": true}).Count(&db.Event{})
	if err != nil {
		cc.ErrLog(err).Error("查询事件表错")
		return c.NoContent(http.StatusInternalServerError)
	}

	type R struct {
		*orm.Result[[]db.Event]
		FreshCount int64 `json:"fresh_count"`
	}

	return c.JSON(http.StatusOK, &R{
		Result:     pageResult,
		FreshCount: freshCount,
	})
}

// DeleteWhere7 删除七天前的记录
func (h *tableHandler) DeleteWhere7(c echo.Context) error {
	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	_, err := session.Where(builder.Lt{"create_at": time.Now().Truncate(24*time.Hour).AddDate(0, 0, -7)}).
		Delete(&db.Event{})
	if err != nil {
		return err
	}
	return c.NoContent(http.StatusOK)
}
