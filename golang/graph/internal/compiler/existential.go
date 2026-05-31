package compiler

import (
	"fmt"

	"github.com/lucky-byte/graph/internal/ir"
)

func (b *sqlBuilder) buildExistentialClauses() error {
	for _, scope := range b.plan.ExistentialScopes {
		if err := b.writeExistentialScope(scope); err != nil {
			return err
		}
	}
	return nil
}

func (b *sqlBuilder) writeExistentialScope(scope *ir.ExistentialScope) error {
	if scope == nil {
		return nil
	}
	step := b.stepByToAlias(scope.BoundaryAlias)
	if step == nil {
		return fmt.Errorf("existential step not found for alias %s", scope.BoundaryAlias)
	}
	if scope.Type == ir.ScopeExists {
		b.buf.WriteString(" AND EXISTS (")
	} else {
		b.buf.WriteString(" AND NOT EXISTS (")
	}
	b.buf.WriteString(" SELECT 1 FROM ")
	b.buf.WriteString(step.Relation.ToTable)
	b.buf.WriteByte(' ')
	b.buf.WriteString(step.ToAlias)
	b.buf.WriteString(" WHERE ")
	c := scope.Correlation
	b.buf.WriteString(c.ChildAlias)
	b.buf.WriteByte('.')
	b.buf.WriteString(c.ChildField)
	b.buf.WriteString(" = ")
	b.buf.WriteString(c.ParentAlias)
	b.buf.WriteByte('.')
	b.buf.WriteString(c.ParentField)
	for _, pred := range step.Predicates {
		b.buf.WriteString(" AND ")
		if err := b.writePredicate(pred); err != nil {
			return err
		}
	}
	b.buf.WriteString(")")
	return nil
}
