package planner

import (
	"github.com/lucky-byte/graph/internal/dsl"
	grapherrors "github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
)

func processTraverseSteps(
	traverse []*dsl.TraverseClause,
	relations map[string]*ir.RelationSchema,
	bindings map[string]*ir.AliasBinding,
) ([]*ir.TraversalStep, error) {
	steps := make([]*ir.TraversalStep, 0, len(traverse))
	for i, clause := range traverse {
		if clause == nil {
			continue
		}
		step, err := processOneStep(clause, i, relations, bindings)
		if err != nil {
			return nil, err
		}
		steps = append(steps, step)
	}
	return steps, nil
}

func processOneStep(
	clause *dsl.TraverseClause,
	stepIdx int,
	relations map[string]*ir.RelationSchema,
	bindings map[string]*ir.AliasBinding,
) (*ir.TraversalStep, error) {
	fromBinding, ok := bindings[clause.From]
	if !ok {
		return nil, planErr("ERR_UNDEFINED_ALIAS", grapherrors.ErrUndefinedAlias, stepIdx, clause.From)
	}
	if fromBinding.ScopeType != ir.ScopeMaterialize {
		return nil, planErr("ERR_TRAVERSE_FROM_EXISTENTIAL", grapherrors.ErrTraverseFromExistential, stepIdx, clause.From)
	}

	rel, ok := relations[clause.Relation]
	if !ok {
		return nil, planErr("ERR_UNKNOWN_RELATION", grapherrors.ErrUnknownRelation, stepIdx, clause.Alias)
	}
	if rel.FromTable != fromBinding.Table {
		return nil, planErr("ERR_RELATION_MISMATCH", grapherrors.ErrRelationTableMismatch, stepIdx, clause.From)
	}
	if _, exists := bindings[clause.Alias]; exists {
		return nil, planErr("ERR_DUPLICATE_ALIAS", grapherrors.ErrDuplicateAlias, stepIdx, clause.Alias)
	}

	require, err := ir.ParseRequireType(clause.Require)
	if err != nil {
		return nil, invalidRequireErr(stepIdx, clause.Alias, err.Error())
	}
	if err := validatePredicates(clause.Where, stepIdx, clause.Alias); err != nil {
		return nil, err
	}

	scopeType := scopeTypeForRequire(require)
	join := buildJoinCondition(clause.From, clause.Alias, rel)
	relCopy := *rel

	bindings[clause.Alias] = &ir.AliasBinding{
		Alias:        clause.Alias,
		Table:        rel.ToTable,
		ParentAlias:  clause.From,
		RelationName: rel.Name,
		ScopeType:    scopeType,
	}

	return &ir.TraversalStep{
		FromAlias:     clause.From,
		ToAlias:       clause.Alias,
		Require:       require,
		Relation:      &relCopy,
		JoinCondition: join,
		Predicates:    convertPredicates(clause.Alias, clause.Where),
		ScopeIndex:    -1,
		IsFanOut:      false,
	}, nil
}

func scopeTypeForRequire(r ir.RequireType) ir.ScopeType {
	switch r {
	case ir.RequireExists:
		return ir.ScopeExists
	case ir.RequireNone:
		return ir.ScopeNotExists
	default:
		return ir.ScopeMaterialize
	}
}

func buildJoinCondition(fromAlias, toAlias string, rel *ir.RelationSchema) *ir.JoinCondition {
	return &ir.JoinCondition{
		LeftAlias:  fromAlias,
		LeftField:  rel.FromField,
		RightAlias: toAlias,
		RightField: rel.ToField,
	}
}
