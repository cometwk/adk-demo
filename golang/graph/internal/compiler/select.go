package compiler

import (
	"fmt"
	"strings"
)

func (b *sqlBuilder) buildSelectClause() {
	b.buf.WriteString("SELECT ")
	parts := make([]string, 0)
	for _, item := range b.projection.SelectItems {
		for _, field := range item.Fields {
			expr := fmt.Sprintf("%s.%s", item.Alias, field)
			if item.As != "" && len(item.Fields) == 1 {
				expr = fmt.Sprintf("%s AS %s", expr, item.As)
			}
			parts = append(parts, expr)
		}
	}
	b.buf.WriteString(strings.Join(parts, ", "))
}
