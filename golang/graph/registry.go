package graph

import (
	"github.com/lucky-byte/graph/internal/registry"
	"xorm.io/xorm"
)

// Init 初始化 Table Schema 注册表（Relation 在代码中静态注册）。
func Init(engine *xorm.Engine) error {
	return registry.InitTableSchemaRegistry(engine)
}
