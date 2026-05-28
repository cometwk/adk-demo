package util

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

func BindAndValidate[T any](c echo.Context, input *T) error {
	err := c.Bind(input)
	if err != nil {
		return err
	}
	if err = c.Validate(input); err != nil {
		return err
	}
	return nil
}

// 当请求参数不完整时，使用这个函数记录错误原因，然后返回 BadRequest 错误
func BadRequest(c echo.Context, err error) error {
	err = errors.Wrapf(err, "%s", c.Request().URL.String())
	logrus.WithError(err).Errorf("请求参数不完整(%s)", c.Request().URL.Path)
	return c.NoContent(http.StatusBadRequest)
}
