package compiler

import (
	"fmt"

	"github.com/lucky-byte/graph/internal/ir"
)

func (b *sqlBuilder) buildFromClause() {
	b.buf.WriteString(" FROM ")
	b.buf.WriteString(b.plan.RootTable)
	b.buf.WriteByte(' ')
	b.buf.WriteString(b.plan.RootAlias)
}

func (b *sqlBuilder) writeJoin(step *ir.TraversalStep) {
	if step == nil || step.JoinCondition == nil {
		return
	}
	jc := step.JoinCondition
	switch step.Require {
	case ir.RequireAlways:
		b.buf.WriteString(" INNER JOIN ")
	case ir.RequireOptional:
		b.buf.WriteString(" LEFT JOIN ")
	default:
		return
	}
	b.buf.WriteString(step.Relation.ToTable)
	b.buf.WriteByte(' ')
	b.buf.WriteString(step.ToAlias)
	b.buf.WriteString(" ON ")
	b.buf.WriteString(jc.LeftAlias)
	b.buf.WriteByte('.')
	b.buf.WriteString(jc.LeftField)
	b.buf.WriteString(" = ")
	b.buf.WriteString(jc.RightAlias)
	b.buf.WriteByte('.')
	b.buf.WriteString(jc.RightField)
}

func (b *sqlBuilder) buildJoinClauses(steps []*ir.TraversalStep) {
	for _, step := range steps {
		b.writeJoin(step)
	}
}

func (b *sqlBuilder) buildJoinClausesFanOut(fanOutOnly bool) {
	for _, step := range b.materializedSteps() {
		if fanOutOnly && !step.IsFanOut {
			continue
		}
		if !fanOutOnly && step.IsFanOut {
			continue
		}
		b.writeJoin(step)
	}
}

func rootPKExpr(plan *ir.TraversalPlan) string {
	return fmt.Sprintf("%s.%s", plan.RootAlias, plan.RootPrimaryKey)
}
