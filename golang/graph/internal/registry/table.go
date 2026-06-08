package registry

import (
	"fmt"

	"github.com/lucky-byte/graph/internal/ir"
	"xorm.io/xorm"
)

// TableSchemaRegistry 由 InitTableSchemaRegistry 填充。
var TableSchemaRegistry = map[string]*ir.TableSchema{}

// InitTableSchemaRegistry 从 engine.DBMetas() 提取表主键元数据。
func InitTableSchemaRegistry(engine *xorm.Engine) error {
	tables, err := engine.DBMetas()
	if err != nil {
		return err
	}
	next := make(map[string]*ir.TableSchema, len(tables))
	for _, table := range tables {
		pkCols := table.PKColumns()
		if len(pkCols) == 0 {
			return fmt.Errorf("table %s has no primary key", table.Name)
		}
		if len(pkCols) > 1 {
			return fmt.Errorf("table %s has composite PK, not supported in V1", table.Name)
		}
		next[table.Name] = &ir.TableSchema{
			TableName:  table.Name,
			PrimaryKey: pkCols[0].Name,
		}
	}
	TableSchemaRegistry = next
	return nil
}

// GetTable 查找表 schema。
func GetTable(name string) (*ir.TableSchema, bool) {
	s, ok := TableSchemaRegistry[name]
	return s, ok
}
