package user

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/ctx"
	"github.com/lucky-byte/base/lib/db"
	"github.com/lucky-byte/lib/pkg/orm"
	"github.com/lucky-byte/lib/pkg/util"
	"xorm.io/builder"
)

// 解除用户绑定
func del(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		Ids []string `json:"ids" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	n, err := session.Where(builder.In("uuid", input.Ids)).Delete(new(db.TreeBind))
	if err != nil {
		cc.ErrLog(err).Error("解除用户绑定错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if n == 0 {
		return c.NoContent(http.StatusNotFound)
	}
	return c.NoContent(http.StatusOK)
}
