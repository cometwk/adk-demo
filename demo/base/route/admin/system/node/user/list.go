package user

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/labstack/echo/v4"
	"xorm.io/builder"
	"xorm.io/xorm"
)

// 查询节点已绑定用户
func list(c echo.Context) error {
	cc := c.(ctx.Context)

	session, page, pagesize, extra, err := bindQueryStringWithPage(c)
	if err != nil {
		return c.String(http.StatusBadRequest, err.Error())
	}

	// 根据node过滤，作为可选条件，非必须
	node, ok := extra["node"]
	if ok {
		session.Where(builder.Or(builder.Eq{"tree_bind.node": node}, builder.IsNull{"tree_bind.node"}))
	}

	type BindUser struct {
		// db.User  `xorm:"extends"`
		UUID     string     `xorm:"uuid"      json:"uuid"`
		UserId   string     `xorm:"userid"    json:"userid"`
		Name     string     `xorm:"name"      json:"name"`
		BindUUID string     `xorm:"bind_uuid" json:"bind_uuid"`
		BindAt   *time.Time `xorm:"bind_at"   json:"bind_at"`
		NodeUUID string     `xorm:"node_uuid" json:"node_uuid"`
		NodeName string     `xorm:"node_name" json:"node_name"`
	}

	var rows []BindUser
	count, err := session.Table("users").Select(`
		users.uuid, users.userid, users.name,
		tree_bind.uuid as bind_uuid, 
		tree_bind.create_at as bind_at,
		tree.name as node_name,
		tree.uuid as node_uuid
	`).
		Join("LEFT", "tree_bind", "tree_bind.entity = users.uuid").
		Join("LEFT", "tree", "tree.uuid = tree_bind.node").
		Where(builder.Eq{"users.disabled": false}).
		Where(builder.Or(builder.Eq{"tree_bind.type": 1}, builder.IsNull{"tree_bind.type"})). // 强制条件
		Limit(pagesize, page*pagesize).FindAndCount(&rows)
	if err != nil {
		cc.ErrLog(err).Error("查询节点已绑定用户错")
		return c.NoContent(http.StatusInternalServerError)
	}

	pageResult := &orm.Result[[]BindUser]{
		Data:     rows,
		Page:     int64(page),
		Pagesize: int64(pagesize),
		Total:    count,
	}
	return c.JSON(http.StatusOK, pageResult)
}

func urlValuesToMap(q url.Values) map[string]string {
	query := make(map[string]string)
	for key, values := range q {
		if len(values) > 0 {
			query[key] = values[0] // 只取第一个值
		}
	}
	return query
}

func bindQueryStringWithPage(c echo.Context) (*xorm.Session, int, int, map[string]string, error) {
	session := orm.MustSession(c.Request().Context())
	q := c.QueryParams()
	params := urlValuesToMap(q)

	page, pagesize := 1, 10 // 默认 page=1, pagesize=10
	if p, ok := params["page"]; ok {
		page, _ = strconv.Atoi(p)
		delete(params, "page")
	}
	if ps, ok := params["pagesize"]; ok {
		pagesize, _ = strconv.Atoi(ps)
		delete(params, "pagesize")
	}
	if page <= 0 {
		page = 1
	}
	if pagesize > 500 {
		return nil, 0, 0, nil, errors.New("pagesize 不能超过 500")
	}

	qb := orm.NewQueryBuilder(session, orm.Options{})
	qb.Bind(params)

	if err := qb.Error(); err != nil {
		return nil, 0, 0, nil, err
	}

	return session, page, pagesize, qb.Extra, nil
}
