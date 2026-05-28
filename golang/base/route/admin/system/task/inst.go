package task

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/base/model"
	"github.com/lucky-byte/lib/pkg/orm"
)

func instSearchPage(c echo.Context) error {
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	pageResult, err := model.TaskInstModel.WithSession(session).SearchPage(input)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, pageResult)
}
