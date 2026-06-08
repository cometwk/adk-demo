package planner

import (
	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/limits"
)

// CompilePlan 将 DSL 的 match + traverse 编译为 TraversalPlan IR。
func CompilePlan(
	query *dsl.GraphTraversalQuery,
	relations map[string]*ir.RelationSchema,
	tables map[string]*ir.TableSchema,
) (*ir.TraversalPlan, error) {
	if query == nil {
		return nil, planErr("ERR_EMPTY_MATCH_TYPE", nil, -1, "")
	}
	if err := limits.CheckTraverseSteps(len(query.Traverse)); err != nil {
		return nil, err
	}

	rootAlias, rootTable, rootPK, rootPreds, bindings, err := resolveMatch(query.Match, tables)
	if err != nil {
		return nil, err
	}

	steps, err := processTraverseSteps(query.Traverse, relations, bindings)
	if err != nil {
		return nil, err
	}

	scopes := buildExistentialScopes(steps)
	hasFanOut := analyzeCardinality(steps, bindings)

	plan := &ir.TraversalPlan{
		ID:                generatePlanID(query),
		RootAlias:         rootAlias,
		RootTable:         rootTable,
		RootPrimaryKey:    rootPK,
		RootPredicates:    rootPreds,
		AliasBindings:     bindings,
		Steps:             steps,
		ExistentialScopes: scopes,
		HasFanOut:         hasFanOut,
	}
	return plan, nil
}
