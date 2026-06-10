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
	// V1.5: 允许从 existential alias 继续遍历，但 inner step 必须是 require: always
	isExistentialInner := fromBinding.ScopeType != ir.ScopeMaterialize

	rel, ok := relations[clause.Relation]
	if !ok {
		return nil, planErr("ERR_UNKNOWN_RELATION", grapherrors.ErrUnknownRelation, stepIdx, clause.Alias)
	}
	if rel.FromTable != fromBinding.Table {
		return nil, planErr("ERR_RELATION_MISMATCH", grapherrors.ErrRelationTableMismatch, stepIdx, clause.From)
	}
	// 环路检测：物化路径上同表二次访问
	if err := detectCycleInPath(clause.From, rel.ToTable, bindings, stepIdx, clause.Alias); err != nil {
		return nil, err
	}
	if _, exists := bindings[clause.Alias]; exists {
		return nil, planErr("ERR_DUPLICATE_ALIAS", grapherrors.ErrDuplicateAlias, stepIdx, clause.Alias)
	}

	require, err := ir.ParseRequireType(clause.Require)
	if err != nil {
		return nil, invalidRequireErr(stepIdx, clause.Alias, err.Error())
	}
	// V1.5: existential scope 内的 inner step 只允许 require: always
	if isExistentialInner && require != ir.RequireAlways {
		return nil, planErr("ERR_EXISTENTIAL_INNER_NOT_ALWAYS", grapherrors.ErrExistentialInnerNotAlways, stepIdx, clause.Alias)
	}
	if err := validatePredicates(clause.Where, stepIdx, clause.Alias); err != nil {
		return nil, err
	}

	// V1.5: inner step 继承父 scope 的 ScopeType，而非 scopeTypeForRequire 的返回值
	var scopeType ir.ScopeType
	if isExistentialInner {
		scopeType = fromBinding.ScopeType
	} else {
		scopeType = scopeTypeForRequire(require)
	}
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
		ScopeIndex:    -1, // Phase 3 填充
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

// detectCycleInPath 检查从 fromAlias 回溯到 root 的物化路径上，
// 是否已有 alias 绑定到 targetTable。如果存在，说明会产生循环 JOIN。
func detectCycleInPath(
	fromAlias string,
	targetTable string,
	bindings map[string]*ir.AliasBinding,
	stepIdx int,
	alias string,
) error {
	current := fromAlias
	for current != "" {
		binding, ok := bindings[current]
		if !ok {
			break
		}
		// 只检查物化路径上的同表；existential scope 内的同表访问由 scope 内检测处理
		if binding.Table == targetTable && binding.ScopeType == ir.ScopeMaterialize {
			return planErr("ERR_CYCLIC_TRAVERSAL", grapherrors.ErrCyclicTraversal, stepIdx, alias)
		}
		current = binding.ParentAlias
	}
	return nil
}
