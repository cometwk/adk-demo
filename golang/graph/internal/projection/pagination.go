package projection

import "github.com/lucky-byte/graph/internal/ir"

func decidePaginationStrategy(plan *ir.TraversalPlan) ir.PaginationStrategy {
	if plan != nil && plan.HasFanOut {
		return ir.PaginateRootFirst
	}
	return ir.PaginateDirect
}
