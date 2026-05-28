package user

import (
	"fmt"
	"testing"

	"xorm.io/builder"
)

func Test1(t *testing.T) {
	ql := `
	select tb.*,
		coalesce(u.name, '') as user_name,
		coalesce(t.name, '') as node_name
	from tree_bind as tb
	left join users as u on u.uuid = tb.entity
	left join tree as t on t.uuid = tb.node
	where `
	qb := builder.In("tb.entity", []string{"1", "2", "3"}).And(builder.Eq{"tb.type": 1})
	sql, args, err := builder.ToSQL(qb)
	fmt.Println(ql+sql, args, err)
	// ql, args, err := session.SQL(qb).ToSQL()
	// if err != nil {
	// 	t.Fatal(err)
	// }
	sql, args, err = builder.Select("c, d").From("table1").Where(builder.Eq{"a": 1}).ToSQL()
	fmt.Println(sql, args, err)
}
