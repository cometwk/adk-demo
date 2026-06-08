package projection

import (
	"github.com/lucky-byte/graph/internal/dsl"
	grapherrors "github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/limits"
)

// PlanQuery 将 Query 模式的 return 定义编译为 QueryProjection IR。
func PlanQuery(plan *ir.TraversalPlan, returnDef *dsl.QueryReturnDef) (*ir.QueryProjection, error) {
	if plan == nil {
		return nil, grapherrors.NewProjectionError("ERR_NIL_PLAN", grapherrors.ErrUndefinedAlias, "")
	}
	if returnDef == nil || len(returnDef.Select) == 0 {
		return nil, grapherrors.NewProjectionError("ERR_EMPTY_FIELDS", grapherrors.ErrEmptyFields, "")
	}

	selectItems, err := validateSelect(plan, returnDef.Select)
	if err != nil {
		return nil, err
	}
	orderItems, err := validateOrderBy(plan, returnDef.OrderBy)
	if err != nil {
		return nil, err
	}

	limit, err := limits.NormalizeLimit(returnDef.Limit)
	if err != nil {
		return nil, err
	}
	offset := 0
	if returnDef.Offset != nil {
		offset = *returnDef.Offset
		if offset < 0 {
			offset = 0
		}
	}

	return &ir.QueryProjection{
		SelectItems:        selectItems,
		OrderByItems:       orderItems,
		Limit:              limit,
		Offset:             offset,
		PaginationStrategy: decidePaginationStrategy(plan),
	}, nil
}
