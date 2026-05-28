package biz

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/demo/pkg/query"
	"github.com/lucky-byte/lib/pkg/orm"
	"xorm.io/xorm/schemas"
)

// TODO: 复合主键
// id 全局唯一

func AttachQueryHandler[T any](e *echo.Group, prefix string) {
	QueryHandler := NewQueryHandler[T](prefix)
	QueryHandler.RegisterRoutes(e)
}

type QueryHandler[T any] struct {
	Prefix string
	Model  orm.EntityOps[T]
	Ops    orm.ModelOps
}

func NewQueryHandler[T any](prefix string) *QueryHandler[T] {
	return &QueryHandler[T]{
		Model:  orm.MustEntityOps[T](),
		Ops:    orm.MustModelOps[T](),
		Prefix: prefix,
	}
}

func (h *QueryHandler[T]) RegisterRoutes(e *echo.Group) {
	prefix := h.Prefix

	e.GET(prefix+"/search", h.SearchPage)
	e.GET(prefix+"/searchWhere", h.Query)
	e.GET(prefix+"/aggregate", h.Aggregate)

}

// SearchPage 搜索带分页
func (h *QueryHandler[T]) SearchPage(c echo.Context) error {
	var params map[string]string
	if err := c.Bind(&params); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	session, err := applyCompositeKeyFilter[T](session, params)
	if err != nil {
		return c.JSON(http.StatusBadRequest, err)
	}

	page, pagesize, _, err := query.BindQueryStringWithPage(session, params)
	if err != nil {
		return err
	}

	table := h.Ops.TableSchema().Name
	rows := make([]T, 0)
	count, err := session.Table(table).Limit(pagesize, page*pagesize).FindAndCount(&rows)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, &orm.Result[[]T]{
		Data:     rows,
		Page:     int64(page),
		Pagesize: int64(pagesize),
		Total:    count,
	})
}

// 条件查询
func (h *QueryHandler[T]) Query(c echo.Context) error {
	var params map[string]string
	if err := c.Bind(&params); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	session, err := applyCompositeKeyFilter[T](session, params)
	if err != nil {
		return c.JSON(http.StatusBadRequest, err)
	}

	if err := query.BindQueryString(session, params); err != nil {
		return err
	}

	table := h.Ops.TableSchema().Name
	rows := make([]T, 0)
	if err := session.Table(table).Limit(500).Find(&rows); err != nil {
		return err
	}

	return c.JSON(http.StatusOK, rows)
}

// aggregate
func (h *QueryHandler[T]) Aggregate(c echo.Context) error {
	var params map[string]string
	if err := c.Bind(&params); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	session, err := applyCompositeKeyFilter[T](session, params)
	if err != nil {
		return c.JSON(http.StatusBadRequest, err)
	}

	page, pagesize, _, err := query.BindAggregateQueryStringWithPage(session, params)
	if err != nil {
		return err
	}

	table := h.Ops.TableSchema()
	rows := make([]map[string]interface{}, 0)
	count, err := session.Table(table.Name).Limit(pagesize, page*pagesize).FindAndCount(&rows)
	if err != nil {
		return err
	}

	for _, row := range rows {
		normalizeRow(table, row)
	}

	return c.JSON(http.StatusOK, &orm.PageResult{
		Data:     rows,
		Page:     int64(page),
		Pagesize: int64(pagesize),
		Total:    count,
	})
}

func normalizeRow(table *schemas.Table, row map[string]interface{}) {
	for k, v := range row {
		if col := table.GetColumn(k); col != nil {
			row[k] = normalizeColumnValue(table, col, v)
			continue
		}
		row[k] = normalizeUnknownValue(v)
	}
}

func normalizeColumnValue(table *schemas.Table, col *schemas.Column, v any) any {
	if v == nil {
		return nil
	}

	switch {
	case col.SQLType.Name == schemas.Date:
		return normalizeDateValue(v)
	case col.SQLType.IsTime():
		return normalizeDateTimeValue(v)
	case col.IsJSON || col.SQLType.IsJson():
		return normalizeJSONValue(v)
	case col.SQLType.IsText():
		return normalizeTextValue(v)
	case col.SQLType.IsBlob():
		return normalizeBlobValue(v)
	case col.SQLType.IsBool():
		return normalizeBoolValue(v)
	case col.SQLType.IsNumeric():
		return normalizeNumericValue(table, col, v)
	default:
		return normalizeUnknownValue(v)
	}
}

func normalizeDateValue(v any) any {
	switch x := v.(type) {
	case string:
		return formatDateString(x)
	case []byte:
		return formatDateString(string(x))
	case time.Time:
		return x.Format("2006-01-02")
	default:
		return v
	}
}

func formatDateString(s string) string {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Format("2006-01-02")
	}
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t.Format("2006-01-02")
	}
	if len(s) >= 10 && s[4] == '-' && s[7] == '-' {
		return s[:10]
	}
	return s
}

func normalizeDateTimeValue(v any) any {
	switch x := v.(type) {
	case time.Time:
		return x.Format(time.RFC3339)
	case []byte:
		s := string(x)
		if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
			return t.Format(time.RFC3339)
		}
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t.Format(time.RFC3339)
		}
		return s
	case string:
		if t, err := time.Parse("2006-01-02 15:04:05", x); err == nil {
			return t.Format(time.RFC3339)
		}
		if t, err := time.Parse(time.RFC3339, x); err == nil {
			return t.Format(time.RFC3339)
		}
		return x
	default:
		return v
	}
}

func normalizeJSONValue(v any) any {
	var data []byte
	switch x := v.(type) {
	case []byte:
		data = x
	case string:
		data = []byte(x)
	default:
		return v
	}
	if len(data) == 0 {
		return nil
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return string(data)
	}
	return out
}

func normalizeTextValue(v any) any {
	switch x := v.(type) {
	case []byte:
		return string(x)
	default:
		return v
	}
}

func normalizeBlobValue(v any) any {
	switch x := v.(type) {
	case []byte:
		return base64.StdEncoding.EncodeToString(x)
	default:
		return v
	}
}

func normalizeBoolValue(v any) any {
	switch x := v.(type) {
	case bool:
		return x
	case int64:
		return x != 0
	case int:
		return x != 0
	case []byte:
		s := string(x)
		return s == "1" || strings.EqualFold(s, "true")
	case string:
		return x == "1" || strings.EqualFold(x, "true")
	default:
		return v
	}
}

func normalizeNumericValue(table *schemas.Table, col *schemas.Column, v any) any {
	asString := fieldJSONAsString(table, col)

	switch x := v.(type) {
	case []byte:
		s := string(x)
		if asString {
			return s
		}
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
		return s
	case int64:
		if asString {
			return strconv.FormatInt(x, 10)
		}
		return x
	case int:
		if asString {
			return strconv.FormatInt(int64(x), 10)
		}
		return x
	case float64:
		if asString {
			return strconv.FormatFloat(x, 'f', -1, 64)
		}
		return x
	default:
		return v
	}
}

func fieldJSONAsString(table *schemas.Table, col *schemas.Column) bool {
	if table.Type == nil {
		return false
	}
	field, ok := table.Type.FieldByName(col.FieldName)
	if !ok || field.Type.Kind() != reflect.Int64 {
		return false
	}
	return strings.Contains(field.Tag.Get("json"), ",string")
}

func normalizeUnknownValue(v any) any {
	switch x := v.(type) {
	case []byte:
		s := string(x)
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
		return s
	case time.Time:
		return x.Format(time.RFC3339)
	default:
		return v
	}
}
