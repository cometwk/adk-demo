package planner_test

import (
	"encoding/json"
	"testing"

	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/planner"
	"github.com/lucky-byte/graph/internal/registry"
	"github.com/lucky-byte/graph/internal/testutil"
)

func TestPlanIDCanonicalPredicateOrder(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)

	a := `{"match":{"type":"agent_rel","alias":"rel"},"traverse":[{"from":"rel","relation":"for_merch","alias":"m","where":[{"field":"b","op":"eq","value":1},{"field":"a","op":"eq","value":2}]}]}`
	b := `{"match":{"type":"agent_rel","alias":"rel"},"traverse":[{"from":"rel","relation":"for_merch","alias":"m","where":[{"field":"a","op":"eq","value":2},{"field":"b","op":"eq","value":1}]}]}`

	var qa, qb dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(a), &qa)
	_ = json.Unmarshal([]byte(b), &qb)
	pa, _ := planner.CompilePlan(&qa, registry.RelationRegistry, registry.TableSchemaRegistry)
	pb, _ := planner.CompilePlan(&qb, registry.RelationRegistry, registry.TableSchemaRegistry)
	if pa.ID != pb.ID {
		t.Fatalf("ids differ: %s vs %s", pa.ID, pb.ID)
	}
}
