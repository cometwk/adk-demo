package compiler

import (
	"strings"

	"github.com/lucky-byte/graph/internal/ir"
)

type sqlBuilder struct {
	plan       *ir.TraversalPlan
	projection *ir.QueryProjection
	buf        strings.Builder
	args       []any
}

func newSQLBuilder(plan *ir.TraversalPlan, projection *ir.QueryProjection) *sqlBuilder {
	return &sqlBuilder{plan: plan, projection: projection}
}

func (b *sqlBuilder) materializedSteps() []*ir.TraversalStep {
	var out []*ir.TraversalStep
	for _, step := range b.plan.Steps {
		if step != nil && step.ScopeIndex == -1 {
			out = append(out, step)
		}
	}
	return out
}

func (b *sqlBuilder) stepByToAlias(alias string) *ir.TraversalStep {
	for _, step := range b.plan.Steps {
		if step != nil && step.ToAlias == alias {
			return step
		}
	}
	return nil
}

func (b *sqlBuilder) SQL() string {
	return strings.TrimSpace(b.buf.String())
}

func (b *sqlBuilder) Args() []any {
	return b.args
}
