package acl

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
)

func features(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		UUID     string   `json:"uuid" validate:"required"`
		Features []string `json:"features" validate:"required"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	ql := `
		update acl set features = ?, update_at = current_timestamp
		where uuid = ?
	`
	err := db.ExecOneX(c, ql, strings.Join(input.Features, ","), input.UUID)
	if err != nil {
		cc.ErrLog(err).Error("更新访问控制信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
