package bulletin

import (
	"net/http"

	"github.com/cometwk/base/lib/db"
	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

// 获取单个公告
func item(c echo.Context) error {
	// cc := c.(ctx.Context)

	uuid := c.Param("uuid")

	ql := `
		select * from bulletins
		where status = 3 and is_public = true and uuid = ?
	`
	var result []db.Bulletin

	err := db.Select(ql, &result, uuid)
	if err != nil {
		logrus.WithError(err).Error("查询公告错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if len(result) == 0 {
		return c.NoContent(http.StatusOK)
	}
	bulletin := result[0]

	return c.JSON(http.StatusOK, echo.Map{
		"uuid":      bulletin.UUID,
		"create_at": bulletin.CreateAt,
		"title":     bulletin.Title,
		"content":   bulletin.Content,
		"send_time": bulletin.SendTime,
		"nread":     bulletin.NRead,
		"nstar":     bulletin.NStar,
	})
}
