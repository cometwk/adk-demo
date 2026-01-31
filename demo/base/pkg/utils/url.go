package utils

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/labstack/echo/v4"
)

func UrlValuesToMap(q url.Values) map[string]string {
	query := make(map[string]string)
	for key, values := range q {
		if len(values) > 0 {
			query[key] = values[0] // 只取第一个值
		}
	}
	return query
}

// 获取未转义的参数值，用法:
//
//	primary, err := GetUnescapedParam(c, "primary")
func GetUnescapedParam(c echo.Context, name string) (string, error) {
	primary := c.Param(name)
	primary, err := url.QueryUnescape(primary)
	if err != nil {
		return "", echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("%s 格式错误", name))
	}
	return primary, nil
}

// 去除字符串前后空白字符，用法:
//
//	Trim(&str1, &str2, ...)
func Trim(args ...*string) {
	for _, v := range args {
		*v = strings.TrimSpace(*v)
	}
}

// 获取未转义的参数值，用法:
//
//	pkValues, err := GetUnescapedParamValues(c, "ids")
func GetUnescapedParamValues(c echo.Context, name string) ([]any, error) {
	ids, err := GetUnescapedParam(c, name)
	if err != nil {
		return nil, err
	}
	pkValues := strings.Split(ids, ",")

	// 将 []string 转换为 []any
	anyValues := make([]any, len(pkValues))
	for i, v := range pkValues {
		anyValues[i] = v
	}

	// 符合orm接口的要求
	return anyValues, nil
}
