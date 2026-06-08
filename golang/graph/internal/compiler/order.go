package compiler

import (
	"fmt"
	"strings"
)

func (b *sqlBuilder) buildOrderByClause() {
	if len(b.projection.OrderByItems) == 0 {
		return
	}
	parts := make([]string, 0, len(b.projection.OrderByItems))
	for _, item := range b.projection.OrderByItems {
		parts = append(parts, fmt.Sprintf("%s.%s %s", item.Alias, item.Field, strings.ToUpper(item.Direction)))
	}
	b.buf.WriteString(" ORDER BY ")
	b.buf.WriteString(strings.Join(parts, ", "))
}
