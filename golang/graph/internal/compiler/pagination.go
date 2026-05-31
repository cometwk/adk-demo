package compiler

import "github.com/lucky-byte/graph/internal/ir"

func (b *sqlBuilder) buildLimitOffset() {
	b.buf.WriteString(" LIMIT ? OFFSET ?")
	b.args = append(b.args, b.projection.Limit, b.projection.Offset)
}

func (b *sqlBuilder) buildWhereParts(steps []*ir.TraversalStep) error {
	first := true
	writeAnd := func() {
		if first {
			b.buf.WriteString(" WHERE ")
			first = false
		} else {
			b.buf.WriteString(" AND ")
		}
	}
	for _, pred := range b.plan.RootPredicates {
		writeAnd()
		if err := b.writePredicate(pred); err != nil {
			return err
		}
	}
	for _, step := range steps {
		for _, pred := range step.Predicates {
			writeAnd()
			if err := b.writePredicate(pred); err != nil {
				return err
			}
		}
	}
	return nil
}

func (b *sqlBuilder) nonFanOutMaterializedSteps() []*ir.TraversalStep {
	var out []*ir.TraversalStep
	for _, step := range b.materializedSteps() {
		if !step.IsFanOut {
			out = append(out, step)
		}
	}
	return out
}
