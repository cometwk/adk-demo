package projection_test

import (
	"encoding/json"
	"testing"

	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/planner"
	"github.com/lucky-byte/graph/internal/projection"
	"github.com/lucky-byte/graph/internal/registry"
	"github.com/lucky-byte/graph/internal/testutil"
)

func compileExamplePlan(t *testing.T) *ir.TraversalPlan {
	t.Helper()
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m","require":"always"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func TestPlanQueryHappyPath(t *testing.T) {
	plan := compileExamplePlan(t)
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
			{Alias: "m", Fields: []string{"id"}, As: "merch_id"},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	if proj.PaginationStrategy != ir.PaginateDirect {
		t.Fatalf("strategy=%v", proj.PaginationStrategy)
	}
	if proj.Limit != 200 {
		t.Fatalf("limit=%d", proj.Limit)
	}
}

func TestPlanQuerySelectExistential(t *testing.T) {
	plan := compileExamplePlan(t)
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{{Alias: "od", Fields: []string{"id"}}},
	}
	_, err := projection.PlanQuery(plan, ret)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestPlanQueryLimitExceeded(t *testing.T) {
	plan := compileExamplePlan(t)
	limit := 2000
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{{Alias: "rel", Fields: []string{"agent_no"}}},
		Limit:  &limit,
	}
	_, err := projection.PlanQuery(plan, ret)
	if err == nil {
		t.Fatal("expected error")
	}
}
