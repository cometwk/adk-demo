package limits

import (
	grapherrors "github.com/lucky-byte/graph/internal/errors"
)

const (
	MaxTraverseSteps   = 10
	MaxInArraySize     = 500
	MaxLimit           = 1000
	DefaultLimit       = 200
	QueryTimeoutSec    = 30
	MaxPlanCacheEntries = 10000
)

// CheckTraverseSteps 校验 traverse 步数。
func CheckTraverseSteps(n int) error {
	if n > MaxTraverseSteps {
		return grapherrors.NewPlanError("ERR_TRAVERSE_LIMIT", grapherrors.ErrTraverseStepLimit, -1, "")
	}
	return nil
}

// NormalizeLimit 应用默认与上限。
func NormalizeLimit(limit *int) (int, error) {
	if limit == nil {
		return DefaultLimit, nil
	}
	if *limit > MaxLimit {
		return 0, grapherrors.NewProjectionError("ERR_LIMIT_EXCEEDED", grapherrors.ErrLimitExceeded, "")
	}
	return *limit, nil
}
