package task

import (
	"net/http"

	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/labstack/echo/v4"
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
