package projection

import (
	"github.com/lucky-byte/graph/internal/dsl"
	grapherrors "github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
)

func validateSelect(plan *ir.TraversalPlan, items []*dsl.SelectDef) ([]*ir.SelectItem, error) {
	out := make([]*ir.SelectItem, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		binding, ok := plan.AliasBindings[item.Alias]
		if !ok {
			return nil, grapherrors.NewProjectionError("ERR_UNDEFINED_ALIAS", grapherrors.ErrUndefinedAlias, item.Alias)
		}
		if binding.ScopeType != ir.ScopeMaterialize {
			return nil, grapherrors.NewProjectionError("ERR_SELECT_EXISTENTIAL", grapherrors.ErrSelectFromExistential, item.Alias)
		}
		if len(item.Fields) == 0 {
			return nil, grapherrors.NewProjectionError("ERR_EMPTY_FIELDS", grapherrors.ErrEmptyFields, item.Alias)
		}
		out = append(out, &ir.SelectItem{
			Alias:  item.Alias,
			Fields: append([]string(nil), item.Fields...),
			As:     item.As,
		})
	}
	if len(out) == 0 {
		return nil, grapherrors.NewProjectionError("ERR_EMPTY_FIELDS", grapherrors.ErrEmptyFields, "")
	}
	return out, nil
}

func validateOrderBy(plan *ir.TraversalPlan, items []*dsl.OrderByDef) ([]*ir.OrderByItem, error) {
	out := make([]*ir.OrderByItem, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		binding, ok := plan.AliasBindings[item.Alias]
		if !ok {
			return nil, grapherrors.NewProjectionError("ERR_UNDEFINED_ALIAS", grapherrors.ErrUndefinedAlias, item.Alias)
		}
		if binding.ScopeType != ir.ScopeMaterialize {
			return nil, grapherrors.NewProjectionError("ERR_ORDERBY_EXISTENTIAL", grapherrors.ErrOrderByExistential, item.Alias)
		}
		dir := item.Direction
		if dir == "" {
			dir = "asc"
		}
		if dir != "asc" && dir != "desc" {
			return nil, grapherrors.NewProjectionError("ERR_INVALID_DIRECTION", grapherrors.ErrInvalidDirection, item.Alias)
		}
		out = append(out, &ir.OrderByItem{
			Alias:     item.Alias,
			Field:     item.Field,
			Direction: dir,
		})
	}
	return out, nil
}
