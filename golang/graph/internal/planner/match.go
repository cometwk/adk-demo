package planner

import (
	"github.com/lucky-byte/graph/internal/dsl"
	grapherrors "github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
)

func resolveMatch(
	match *dsl.MatchClause,
	tables map[string]*ir.TableSchema,
) (string, string, string, []*ir.Predicate, map[string]*ir.AliasBinding, error) {
	if match == nil {
		return "", "", "", nil, nil, planErr("ERR_EMPTY_MATCH_TYPE", grapherrors.ErrEmptyMatchType, -1, "")
	}
	if match.Type == "" {
		return "", "", "", nil, nil, planErr("ERR_EMPTY_MATCH_TYPE", grapherrors.ErrEmptyMatchType, -1, "")
	}
	if match.Alias == "" {
		return "", "", "", nil, nil, planErr("ERR_EMPTY_MATCH_ALIAS", grapherrors.ErrEmptyMatchAlias, -1, "")
	}
	schema, ok := tables[match.Type]
	if !ok {
		return "", "", "", nil, nil, planErr("ERR_UNKNOWN_TABLE", grapherrors.ErrUnknownTable, -1, match.Alias)
	}
	if err := validatePredicates(match.Where, -1, match.Alias); err != nil {
		return "", "", "", nil, nil, err
	}

	preds := convertPredicates(match.Alias, match.Where)
	bindings := map[string]*ir.AliasBinding{
		match.Alias: {
			Alias:        match.Alias,
			Table:        match.Type,
			ParentAlias:  "",
			RelationName: "",
			ScopeType:    ir.ScopeMaterialize,
		},
	}
	return match.Alias, match.Type, schema.PrimaryKey, preds, bindings, nil
}

func convertPredicates(alias string, wheres []*dsl.WherePredicate) []*ir.Predicate {
	out := make([]*ir.Predicate, 0, len(wheres))
	for _, w := range wheres {
		if w == nil {
			continue
		}
		out = append(out, &ir.Predicate{
			Alias: alias,
			Field: w.Field,
			Op:    w.Op,
			Value: w.Value,
		})
	}
	return out
}
