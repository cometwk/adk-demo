package log

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func list(c echo.Context) error {
	files, err := GetLogFiles()
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, files)
}
