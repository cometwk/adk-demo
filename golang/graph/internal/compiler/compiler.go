package compiler

import (
	"fmt"
	"strings"

	"github.com/lucky-byte/graph/internal/ir"
)

// CompileQuery 将 TraversalPlan + QueryProjection 编译为参数化 SQL。
func CompileQuery(plan *ir.TraversalPlan, projection *ir.QueryProjection) (string, []any, error) {
	if plan == nil || projection == nil {
		return "", nil, fmt.Errorf("nil plan or projection")
	}
	b := newSQLBuilder(plan, projection)
	var err error
	if projection.PaginationStrategy == ir.PaginateRootFirst {
		err = b.buildPaginateRootFirst()
	} else {
		err = b.buildPaginateDirect()
	}
	if err != nil {
		return "", nil, err
	}
	return b.SQL(), b.Args(), nil
}

func (b *sqlBuilder) buildPaginateDirect() error {
	b.buildSelectClause()
	b.buildFromClause()
	b.buildJoinClauses(b.materializedSteps())
	if err := b.buildWhereParts(b.materializedSteps()); err != nil {
		return err
	}
	if err := b.buildExistentialClauses(); err != nil {
		return err
	}
	b.buildOrderByClause()
	b.buildLimitOffset()
	return nil
}

func (b *sqlBuilder) buildPaginateRootFirst() error {
	innerSteps := b.nonFanOutMaterializedSteps()
	var inner strings.Builder
	innerArgs := []any{}

	ib := &sqlBuilder{plan: b.plan, projection: b.projection, buf: inner, args: innerArgs}
	ib.buf.WriteString("SELECT ")
	ib.buf.WriteString(ib.plan.RootAlias)
	ib.buf.WriteString(".")
	ib.buf.WriteString(ib.plan.RootPrimaryKey)
	ib.buildFromClause()
	ib.buildJoinClauses(innerSteps)
	if err := ib.buildWhereParts(innerSteps); err != nil {
		return err
	}
	if err := ib.buildExistentialClauses(); err != nil {
		return err
	}
	ib.buildLimitOffset()

	b.buildSelectClause()
	b.buf.WriteString(" FROM (")
	b.buf.WriteString(ib.SQL())
	b.buf.WriteString(") _roots INNER JOIN ")
	b.buf.WriteString(b.plan.RootTable)
	b.buf.WriteByte(' ')
	b.buf.WriteString(b.plan.RootAlias)
	b.buf.WriteString(" ON ")
	b.buf.WriteString(b.plan.RootAlias)
	b.buf.WriteString(".")
	b.buf.WriteString(b.plan.RootPrimaryKey)
	b.buf.WriteString(" = _roots.")
	b.buf.WriteString(b.plan.RootPrimaryKey)
	b.buildJoinClauses(innerSteps)
	b.buildJoinClausesFanOut(true)
	b.buildOrderByClause()
	b.args = append(ib.args, b.args...)
	return nil
}
