package planner_test

import (
	"encoding/json"
	"testing"

	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/planner"
	"github.com/lucky-byte/graph/internal/registry"
	"github.com/lucky-byte/graph/internal/testutil"
)

func setupPlanner(t *testing.T) map[string]*ir.TableSchema {
	t.Helper()
	engine := testutil.SetupGraphTestDB(t)
	if err := registry.InitTableSchemaRegistry(engine); err != nil {
		t.Fatal(err)
	}
	return registry.TableSchemaRegistry
}

func TestCompilePlanSection9Golden(t *testing.T) {
	tables := setupPlanner(t)
	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    {
      "from": "m",
      "relation": "has_order_daily",
      "alias": "od",
      "where": [
        { "field": "report_date", "op": "gte", "value": "2026-05-01" },
        { "field": "report_date", "op": "lte", "value": "2026-05-31" }
      ],
      "require": "none"
    }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if plan.RootAlias != "rel" || plan.RootTable != "agent_rel" || plan.RootPrimaryKey != "id" {
		t.Fatalf("root: %+v", plan)
	}
	if plan.HasFanOut {
		t.Fatal("expected HasFanOut=false")
	}
	if len(plan.Steps) != 2 {
		t.Fatalf("steps=%d", len(plan.Steps))
	}
	if plan.Steps[0].Require != ir.RequireAlways || plan.Steps[0].IsFanOut {
		t.Fatalf("step0: %+v", plan.Steps[0])
	}
	if plan.Steps[1].Require != ir.RequireNone || plan.Steps[1].ScopeIndex != 0 {
		t.Fatalf("step1: %+v", plan.Steps[1])
	}
	if len(plan.ExistentialScopes) != 1 || plan.ExistentialScopes[0].Type != ir.ScopeNotExists {
		t.Fatalf("scopes: %+v", plan.ExistentialScopes)
	}
	od := plan.AliasBindings["od"]
	if od.ScopeType != ir.ScopeNotExists {
		t.Fatalf("od binding: %+v", od)
	}
}

func TestCompilePlanDeterministicID(t *testing.T) {
	tables := setupPlanner(t)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{"match":{"type":"agent_rel","alias":"rel"},"traverse":[]}`), &q)
	p1, _ := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	p2, _ := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if p1.ID != p2.ID || p1.ID == "" {
		t.Fatalf("ids: %q %q", p1.ID, p2.ID)
	}
}

func TestCompilePlanDuplicateAlias(t *testing.T) {
	tables := setupPlanner(t)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"m","require":"none"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCompilePlanTraverseFromExistential(t *testing.T) {
	tables := setupPlanner(t)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"for_merch","alias":"x"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCompilePlanEmptyIn(t *testing.T) {
	tables := setupPlanner(t)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel","where":[{"field":"x","op":"in","value":[]}]},
		"traverse":[]
	}`), &q)
	_, err := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCompilePlanTraverseStepLimit(t *testing.T) {
	tables := setupPlanner(t)
	steps := make([]*dsl.TraverseClause, 11)
	for i := range steps {
		steps[i] = &dsl.TraverseClause{From: "rel", Relation: "for_merch", Alias: "m"}
	}
	q := &dsl.GraphTraversalQuery{
		Match:    &dsl.MatchClause{Type: "agent_rel", Alias: "rel"},
		Traverse: steps,
	}
	_, err := planner.CompilePlan(q, registry.RelationRegistry, tables)
	if err == nil {
		t.Fatal("expected limit error")
	}
}

func TestCompilePlanMatchOnly(t *testing.T) {
	tables := setupPlanner(t)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{"match":{"type":"agent_rel","alias":"rel"},"traverse":[]}`), &q)
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, tables)
	if err != nil {
		t.Fatal(err)
	}
	if plan.HasFanOut || len(plan.Steps) != 0 {
		t.Fatalf("plan: %+v", plan)
	}
}
