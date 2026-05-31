package planner

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"

	"github.com/lucky-byte/graph/internal/dsl"
)

type canonicalQuery struct {
	Match    *dsl.MatchClause      `json:"match"`
	Traverse []*dsl.TraverseClause `json:"traverse"`
}

func generatePlanID(query *dsl.GraphTraversalQuery) string {
	if query == nil {
		return ""
	}
	cq := canonicalQuery{
		Match:    query.Match,
		Traverse: canonicalTraverse(query.Traverse),
	}
	data, err := json.Marshal(cq)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func canonicalTraverse(steps []*dsl.TraverseClause) []*dsl.TraverseClause {
	if len(steps) == 0 {
		return steps
	}
	out := make([]*dsl.TraverseClause, len(steps))
	copy(out, steps)
	for _, step := range out {
		if step == nil || len(step.Where) == 0 {
			continue
		}
		sorted := make([]*dsl.WherePredicate, len(step.Where))
		copy(sorted, step.Where)
		sort.Slice(sorted, func(i, j int) bool {
			if sorted[i] == nil || sorted[j] == nil {
				return i < j
			}
			if sorted[i].Field != sorted[j].Field {
				return sorted[i].Field < sorted[j].Field
			}
			return sorted[i].Op < sorted[j].Op
		})
		step.Where = sorted
	}
	return out
}
