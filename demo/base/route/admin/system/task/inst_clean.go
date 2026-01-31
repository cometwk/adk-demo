package task

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"xorm.io/builder"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
)

// 删除历史任务实例
func inst_clean(c echo.Context) error {
	type Input struct {
		Code int `json:"code"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	if input.Code != 0 {
		session.Where(builder.Eq{"code": input.Code})
	}
	// session.Where(builder.Lt{"create_at": time.Now().Truncate(24 * time.Hour)})
	session.Where(builder.Lt{"create_at": time.Now().Truncate(24*time.Hour).AddDate(0, 0, -7)})
	n, err := session.Delete(&db.TaskInst{})
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{
		"affected": n,
	})
}
