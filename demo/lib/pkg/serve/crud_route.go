package serve

import (
	"net/http"
	"net/url"
	"reflect"
	"strings"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/snowflake"
	"github.com/labstack/echo/v4"
	"github.com/pkg/errors"
)

type IdInput struct {
	ID string `param:"id" query:"id" form:"id" json:"id" xml:"id" validate:"required"`
}
type IdsInput struct {
	Ids string `param:"ids" query:"ids" form:"ids" json:"ids" xml:"ids" validate:"required"`
}
type CrudHandler[T any] struct {
	Prefix string
	Model  orm.EntityOps[T]
	Ops    orm.ModelOps
}

func NewCrudHandler[T any](prefix string) *CrudHandler[T] {
	return &CrudHandler[T]{
		Model:  orm.MustEntityOps[T](),
		Ops:    orm.MustModelOps[T](),
		Prefix: prefix,
	}
}

func (h *CrudHandler[T]) RegisterRoutes(e *echo.Group) {
	prefix := h.Prefix

	e.GET(prefix+"/get/:id", h.FindById)
	// getIn
	e.GET(prefix+"/search", h.SearchPage)
	e.GET(prefix+"/searchWhere", h.Query)

	e.POST(prefix+"/create", h.Create)
	// createBatch

	e.POST(prefix+"/upsert", h.Save)
	// upsertBatch

	// update
	e.POST(prefix+"/update", h.Update)
	// updateWhere
	// updateIn

	// 删除记录
	e.POST(prefix+"/delete/:id", h.Delete)
	e.POST(prefix+"/deleteIn/:ids", h.DeleteIn)
	// deleteWhere

}

// SearchPage 搜索带分页
func (h *CrudHandler[T]) SearchPage(c echo.Context) error {
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	pageResult, err := h.Model.WithSession(session).SearchPage(input)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, pageResult)
}

// 条件查询
func (h *CrudHandler[T]) Query(c echo.Context) error {
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	// 默认限制 500 条
	rows, err := h.Model.WithSession(session.Limit(500)).Search(input)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, rows)
}

// Save 保存记录
func (h *CrudHandler[T]) Save(c echo.Context) error {
	var row T
	if err := c.Bind(&row); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	result, err := h.Model.WithSession(session).Upsert(&row)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, result)
}

// FindById 按ID查找记录
func (h *CrudHandler[T]) FindById(c echo.Context) error {
	var input IdInput
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	record, err := h.Model.WithSession(session).Get(input.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	if record == nil {
		return echo.NewHTTPError(http.StatusNotFound, "记录不存在")
	}
	return c.JSON(http.StatusOK, record)
}

// Create 创建新记录
func (h *CrudHandler[T]) Create(c echo.Context) error {
	var row T
	if err := c.Bind(&row); err != nil {
		return err
	}

	// 兼容雪花ID主键：如果结构体存在名为 ID 的 int64 字段且为 0，则自动填充
	// 避免使用默认 CRUD 创建时漏写 ID，导致插入失败或产生脏数据。
	{
		v := reflect.ValueOf(&row)
		if v.Kind() == reflect.Ptr {
			v = v.Elem()
		}
		if v.IsValid() && v.Kind() == reflect.Struct {
			f := v.FieldByName("ID")
			if f.IsValid() && f.CanSet() && f.Kind() == reflect.Int64 && f.Int() == 0 {
				f.SetInt(snowflake.SnowflakeId())
			}
		}
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	err := h.Model.WithSession(session).InsertOne(&row)
	if err != nil {
		return err
	}
	return c.NoContent(http.StatusOK)
}

// Update 更新记录
func (h *CrudHandler[T]) Update(c echo.Context) error {
	var row map[string]any
	if err := c.Bind(&row); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	_, err := h.Ops.WithSession(session).UpdateByPK(row)
	if err != nil {
		return err
	}
	return c.NoContent(http.StatusOK)
}

// Delete 删除记录
func (h *CrudHandler[T]) Delete(c echo.Context) error {
	var input IdInput
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	n, err := h.Model.WithSession(session).Delete(input.ID)
	if err != nil {
		return err
	}
	if n == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "记录未找到")
	}
	return c.NoContent(http.StatusOK)
}

func (h *CrudHandler[T]) DeleteIn(c echo.Context) error {
	var input IdsInput
	var err error
	if err = c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	vals := strings.Split(input.Ids, ",")
	ids := make([]any, len(vals))
	for i, val := range vals {
		ids[i], err = url.QueryUnescape(val)
		if err != nil {
			return err
		}
	}
	_, err = h.Model.WithSession(session).DeleteIn(ids)
	if err != nil {
		return errors.Wrap(err, "删除失败")
	}
	return c.NoContent(http.StatusOK)
}

func (h *CrudHandler[T]) DeleteWhere(c echo.Context) error {
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	n, err := h.Model.WithSession(session).DeleteWhere(input)
	if err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.JSON(http.StatusOK, echo.Map{
		"affected": n,
	})
}

func AttachCrudRoutes[T any](e *echo.Group, name string) {
	CrudHandler := NewCrudHandler[T]("/table/" + name)
	CrudHandler.RegisterRoutes(e)
}

func AttachCrudWithPrefix[T any](e *echo.Group, prefix string) {
	CrudHandler := NewCrudHandler[T](prefix)
	CrudHandler.RegisterRoutes(e)
}
