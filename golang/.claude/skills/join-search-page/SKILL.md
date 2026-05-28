---
name: join-search-page
description: 分页联表查询的标准范式。当需要编写带 JOIN 的分页搜索接口（SearchPage）、需要返回关联表字段、或覆盖 CrudHandler 默认的 SearchPage 时使用此 Skill。
---

# 分页联表查询范式

当默认 `CrudHandler.SearchPage` 无法满足需求（需要 JOIN 关联表返回额外字段）时，按以下范式覆盖。

## 模板

```go
// 1. 路由 handler 入口 —— 解析参数并调用内部方法
func (h *handler) SearchPage(c echo.Context) error {
	var input map[string]string
	if err := c.Bind(&input); err != nil {
		return err
	}

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	pageResult, err := h.searchPage0(session, input)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, pageResult)
}

// 2. 内部分页联表查询方法
func (h *handler) searchPage0(session *xorm.Session, params map[string]string) (*orm.PageResult, error) {
	// ── 分页参数提取 ──
	page := 0
	pagesize := 10
	var err error
	if p, ok := params["page"]; ok {
		page, err = strconv.Atoi(p)
		if err != nil {
			return nil, errors.New("invalid page parameter")
		}
		delete(params, "page")
	}
	if ps, ok := params["pagesize"]; ok {
		pagesize, err = strconv.Atoi(ps)
		if err != nil {
			return nil, errors.New("invalid pagesize parameter")
		}
		delete(params, "pagesize")
	}
	if pagesize > 500 {
		return nil, errors.New("pagesize 最大值 500")
	}

	// ── 可选：基础过滤条件 ──
	// session.Where("deleted = false")

	// ── 绑定前端查询参数（第三个参数 = 主表表名）──
	err = orm.BindQueryStringWithTable(session, params, "<主表名>")
	if err != nil {
		return nil, err
	}

	// ── 定义联表结果结构体 ──
	type Row struct {
		biz.MainModel `xorm:"extends"`                        // 主表模型，用 extends 展开
		JoinField1    string `xorm:"join_field1" json:"join_field1"` // 关联表字段
		JoinField2    string `xorm:"join_field2" json:"join_field2"`
	}

	// ── 构建联表查询 ──
	var rows []Row
	session.Table("<主表名>").
		Select("<主表名>.*, <关联表>.xxx as join_field1, <关联表>.yyy as join_field2").
		Join("<INNER|LEFT>", "<关联表>", "<关联表>.key = <主表名>.fk")

	count, err := session.Limit(pagesize, page*pagesize).FindAndCount(&rows)
	if err != nil {
		return nil, err
	}

	return &orm.PageResult{
		Data:     rows,
		Page:     int64(page),
		Pagesize: int64(pagesize),
		Total:    count,
	}, nil
}
```

## 要点

1. **`BindQueryStringWithTable` 第三参数是主表名**，确保前端传入的查询条件绑定到正确的表，避免联表时字段名歧义。
2. **结果结构体**用 `xorm:"extends"` 嵌入主表模型，额外字段用 `xorm:"alias" json:"alias"` 标注。
3. **分页参数**从 `params` 中提取后 `delete`，防止其被当作查询条件传入 `BindQueryStringWithTable`。
4. **返回类型**使用 `*orm.PageResult`（即 `*orm.Result[any]`），也可用泛型 `*orm.Result[[]Row]`。
5. **多表 JOIN** 可链式调用多个 `.Join()`。
6. **额外 WHERE 条件**（如逻辑删除过滤、权限过滤）在 `BindQueryStringWithTable` 之前添加。
