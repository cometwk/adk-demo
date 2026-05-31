package compiler

import (
	"fmt"
	"reflect"
	"strings"

	grapherrors "github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
)

func (b *sqlBuilder) writePredicate(pred *ir.Predicate) error {
	if pred == nil {
		return nil
	}
	col := fmt.Sprintf("%s.%s", pred.Alias, pred.Field)
	return b.writePredicateCol(col, pred.Op, pred.Value)
}

func (b *sqlBuilder) writePredicateCol(col, op string, value any) error {
	switch op {
	case "eq":
		b.buf.WriteString(col)
		b.buf.WriteString(" = ?")
		b.args = append(b.args, value)
	case "neq":
		b.buf.WriteString(col)
		b.buf.WriteString(" != ?")
		b.args = append(b.args, value)
	case "gt":
		b.buf.WriteString(col)
		b.buf.WriteString(" > ?")
		b.args = append(b.args, value)
	case "gte":
		b.buf.WriteString(col)
		b.buf.WriteString(" >= ?")
		b.args = append(b.args, value)
	case "lt":
		b.buf.WriteString(col)
		b.buf.WriteString(" < ?")
		b.args = append(b.args, value)
	case "lte":
		b.buf.WriteString(col)
		b.buf.WriteString(" <= ?")
		b.args = append(b.args, value)
	case "like":
		b.buf.WriteString(col)
		b.buf.WriteString(" LIKE ?")
		b.args = append(b.args, value)
	case "in":
		b.expandIn(col, value)
	case "not_in":
		b.expandNotIn(col, value)
	case "is_null":
		if isTruthy(value) {
			b.buf.WriteString(col)
			b.buf.WriteString(" IS NULL")
		} else {
			b.buf.WriteString(col)
			b.buf.WriteString(" IS NOT NULL")
		}
	default:
		return grapherrors.NewCompilerError("ERR_UNSUPPORTED_OP", grapherrors.ErrUnsupportedOp.Error(), op)
	}
	return nil
}

func (b *sqlBuilder) expandIn(col string, value any) {
	vals := toSlice(value)
	if len(vals) == 0 {
		b.buf.WriteString("1 = 0")
		return
	}
	ph := make([]string, len(vals))
	for i, v := range vals {
		ph[i] = "?"
		b.args = append(b.args, v)
	}
	b.buf.WriteString(col)
	b.buf.WriteString(" IN (")
	b.buf.WriteString(strings.Join(ph, ", "))
	b.buf.WriteString(")")
}

func (b *sqlBuilder) expandNotIn(col string, value any) {
	vals := toSlice(value)
	if len(vals) == 0 {
		b.buf.WriteString("1 = 1")
		return
	}
	ph := make([]string, len(vals))
	for i, v := range vals {
		ph[i] = "?"
		b.args = append(b.args, v)
	}
	b.buf.WriteString(col)
	b.buf.WriteString(" NOT IN (")
	b.buf.WriteString(strings.Join(ph, ", "))
	b.buf.WriteString(")")
}

func toSlice(v any) []any {
	if v == nil {
		return nil
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return []any{v}
	}
	out := make([]any, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		out[i] = rv.Index(i).Interface()
	}
	return out
}

func isTruthy(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case int:
		return x != 0
	case int64:
		return x != 0
	case float64:
		return x != 0
	default:
		return true
	}
}
