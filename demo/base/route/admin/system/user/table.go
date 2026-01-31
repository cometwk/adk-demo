package user

import (
	"net/http"
	"strconv"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/base/pkg/utils"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/serve"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

type handler struct {
	*serve.CrudHandler[db.User]
}

func userAttach(e *echo.Group) {
	handler := &handler{
		serve.NewCrudHandler[db.User](""),
	}

	// override create route
	e.POST("/create", handler.Create)

	// 搜索带分页
	e.GET("/search", handler.SearchPage)

	// 条件查询
	e.GET("/query", handler.Query)

	// 按ID查找
	e.GET("/find/:id", handler.FindById)

	// 更新记录
	e.POST("/update", handler.Update)

	// extend routes
}

// Create 创建新记录
func (h *handler) Create(c echo.Context) error {
	return add(c)
}

// Update 更新记录
func (h *handler) Update(c echo.Context) error {

	type UserForm struct {
		UUID     string `json:"uuid" validate:"required"`
		UserID   string `json:"userid" validate:"required"`
		Name     string `json:"name" validate:"required"`
		Mobile   string `json:"mobile" validate:"required,len=11"`
		Email    string `json:"email" validate:"omitempty,email"`
		IDNo     string `json:"idno" validate:"omitempty,len=18"`
		Address  string `json:"address"`
		SendMail bool   `json:"sendmail"`
		TFA      bool   `json:"tfa"`
		ACL      string `json:"acl" validate:"required"`
		BindNo   string `json:"bind_no" validate:"omitempty"`
		BindName string `json:"bind_name" validate:"omitempty"`
	}

	var row UserForm
	if err := c.Bind(&row); err != nil {
		return err
	}
	if err := c.Validate(row); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	err := h.Model.WithSession(session).UpdateOne(&row)
	if err != nil {
		return err
	}
	return c.NoContent(http.StatusOK)
}

// 需要联表操作
func (h *handler) SearchPage(c echo.Context) error {

	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	pageResult, err := h.searchPage0(c, input)
	if err != nil {
		return err
	}

	return c.JSON(http.StatusOK, pageResult)
}

func (h *handler) searchPage0(c echo.Context, params map[string]string) (any, error) {
	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	page := 0
	pagesize := 10
	if p, ok := params["page"]; ok {
		page, _ = strconv.Atoi(p)
		delete(params, "page")
	}
	if ps, ok := params["pagesize"]; ok {
		pagesize, _ = strconv.Atoi(ps)
		delete(params, "pagesize")
	}
	if pagesize > 500 {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "pagesize 最大值 500")
	}

	// 过滤掉逻辑删除
	session.Where("deleted = false")

	// 绑定查询参数, 注意前端输入 query column = table#field
	err := orm.BindQueryStringWithTable(session, params, "users")
	if err != nil {
		return nil, err
	}

	type UserAcl struct {
		db.User `xorm:"extends"`
		AclName string `xorm:"acl_name" json:"acl_name"`
		AclCode string `xorm:"acl_code" json:"acl_code"`
	}

	var rows []UserAcl
	count, err := session.Table("users").Select("users.*, acl.name as acl_name, acl.code as acl_code").
		Join("INNER", "acl", "acl.uuid = users.acl").
		Limit(pagesize, page*pagesize).FindAndCount(&rows)
	if err != nil {
		return nil, err
	}

	return &orm.Result[[]UserAcl]{
		Data:     rows,
		Page:     int64(page),
		Pagesize: int64(pagesize),
		Total:    count,
	}, nil
}

func (h *handler) ChangePasswd(c echo.Context) error {
	primary, err := utils.GetUnescapedParam(c, "primary")
	if err != nil {
		return err
	}

	type Body struct {
		Password string `json:"passwd" validate:"required"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return err
	}

	model := orm.MustEntityOps[db.User]()

	// 简单哈希处理密码
	passwd := secure.HashPassword(input.Password)
	user := db.User{
		UUID:   primary,
		Passwd: passwd,
	}

	result, err := model.Update(&user)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, result)
}
