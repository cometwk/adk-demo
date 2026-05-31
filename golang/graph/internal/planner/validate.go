package planner

import (
	"fmt"
	"reflect"

	"github.com/lucky-byte/graph/internal/dsl"
	grapherrors "github.com/lucky-byte/graph/internal/errors"
)

func validatePredicates(predicates []*dsl.WherePredicate, step int, alias string) error {
	for _, p := range predicates {
		if p == nil {
			continue
		}
		if p.Op == "in" || p.Op == "not_in" {
			if !isNonEmptyArray(p.Value) {
				return grapherrors.NewPlanError("ERR_EMPTY_IN", grapherrors.ErrEmptyInValues, step, alias)
			}
			if n := arrayLen(p.Value); n > 0 {
				_ = n // size check at compile layer if needed
			}
		}
	}
	return nil
}

func isNonEmptyArray(v any) bool {
	if v == nil {
		return false
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array:
		return rv.Len() > 0
	default:
		return false
	}
}

func arrayLen(v any) int {
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Slice || rv.Kind() == reflect.Array {
		return rv.Len()
	}
	return 0
}

func planErr(code string, err error, step int, alias string) error {
	return grapherrors.NewPlanError(code, err, step, alias)
}

func invalidRequireErr(step int, alias, detail string) error {
	e := grapherrors.NewPlanError("ERR_INVALID_REQUIRE", grapherrors.ErrInvalidRequire, step, alias)
	if detail != "" {
		e.Detail = detail
	}
	return e
}

func fmtDetail(format string, args ...any) string {
	return fmt.Sprintf(format, args...)
}
