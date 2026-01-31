package user

import (
	"github.com/cometwk/base/lib/db"
	"github.com/labstack/echo/v4"
	"xorm.io/builder"
)

type conflictRecord struct {
	db.TreeBind `xorm:"extends"`
	NodeName    string `xorm:"node_name" json:"node_name"`
	UserName    string `xorm:"user_name" json:"user_name"`
}

// 检查用户是否已经绑定到其它节点
func conflict(c echo.Context, users []string) ([]conflictRecord, error) {
	where, args, err := builder.ToSQL(builder.In("tb.entity", users).And(builder.Eq{"tb.type": 1}))
	if err != nil {
		return nil, err
	}
	ql := `
	select tb.*,
		coalesce(u.name, '') as user_name,
		coalesce(t.name, '') as node_name
	from tree_bind as tb
	left join users as u on u.uuid = tb.entity
	left join tree as t on t.uuid = tb.node
	where ` + where

	var result []conflictRecord
	if err := db.SelectX(c, ql, &result, args...); err != nil {
		return nil, err
	}
	return result, nil
}
