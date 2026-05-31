package registry

import "github.com/lucky-byte/graph/internal/ir"

// RelationRegistry 是全局只读 Relation Schema 注册表。
var RelationRegistry = map[string]*ir.RelationSchema{
	"for_merch": {
		Name:        "for_merch",
		FromTable:   "agent_rel",
		FromField:   "merch_id",
		ToTable:     "merch",
		ToField:     "id",
		Cardinality: "many_to_one",
	},
	"has_order_daily": {
		Name:        "has_order_daily",
		FromTable:   "merch",
		FromField:   "id",
		ToTable:     "order_daily",
		ToField:     "merch_id",
		Cardinality: "one_to_many",
	},
}

// GetRelation 查找已注册的关系。
func GetRelation(name string) (*ir.RelationSchema, bool) {
	r, ok := RelationRegistry[name]
	return r, ok
}
