package dsl_test

import (
	"encoding/json"
	"testing"

	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/ir"
)

const exampleDSL = `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [
      { "field": "apply", "op": "eq", "value": 1 }
    ]
  },
  "traverse": [
    {
      "from": "rel",
      "relation": "for_merch",
      "alias": "m",
      "require": "always"
    },
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

func TestGraphTraversalQueryJSONRoundTrip(t *testing.T) {
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(exampleDSL), &q); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if q.Match == nil || q.Match.Type != "agent_rel" || q.Match.Alias != "rel" {
		t.Fatalf("match: %+v", q.Match)
	}
	if len(q.Match.Where) != 1 || q.Match.Where[0].Field != "apply" {
		t.Fatalf("match where: %+v", q.Match.Where)
	}
	if len(q.Traverse) != 2 {
		t.Fatalf("traverse len=%d", len(q.Traverse))
	}
	if q.Traverse[1].Require != "none" || len(q.Traverse[1].Where) != 2 {
		t.Fatalf("traverse[1]: %+v", q.Traverse[1])
	}

	data, err := json.Marshal(&q)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var q2 dsl.GraphTraversalQuery
	if err := json.Unmarshal(data, &q2); err != nil {
		t.Fatalf("round-trip unmarshal: %v", err)
	}
	if q2.Match.Type != q.Match.Type || len(q2.Traverse) != len(q.Traverse) {
		t.Fatalf("round-trip mismatch: %+v vs %+v", q2, q)
	}
}

func TestEmptyTraverse(t *testing.T) {
	raw := `{"match":{"type":"agent_rel","alias":"rel"},"traverse":[]}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	if q.Traverse == nil {
		t.Fatal("expected non-nil empty slice")
	}
	if len(q.Traverse) != 0 {
		t.Fatalf("len=%d", len(q.Traverse))
	}
}

func TestTraversalPlanIRRoundTrip(t *testing.T) {
	plan := &ir.TraversalPlan{
		ID:             "abc123",
		RootAlias:      "rel",
		RootTable:      "agent_rel",
		RootPrimaryKey: "id",
		RootPredicates: []*ir.Predicate{
			{Alias: "rel", Field: "apply", Op: "eq", Value: float64(1)},
		},
		AliasBindings: map[string]*ir.AliasBinding{
			"rel": {Alias: "rel", Table: "agent_rel", ScopeType: ir.ScopeMaterialize},
		},
		Steps:             []*ir.TraversalStep{},
		ExistentialScopes: []*ir.ExistentialScope{},
		HasFanOut:         false,
	}

	data, err := json.Marshal(plan)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var plan2 ir.TraversalPlan
	if err := json.Unmarshal(data, &plan2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if plan2.ID != plan.ID || plan2.RootAlias != plan.RootAlias {
		t.Fatalf("mismatch: %+v", plan2)
	}
	if plan2.AliasBindings["rel"].Table != "agent_rel" {
		t.Fatalf("bindings: %+v", plan2.AliasBindings)
	}
}

func TestQueryReturnDefRoundTrip(t *testing.T) {
	limit := 200
	ret := dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
		},
		Limit: &limit,
	}
	data, err := json.Marshal(&ret)
	if err != nil {
		t.Fatal(err)
	}
	var ret2 dsl.QueryReturnDef
	if err := json.Unmarshal(data, &ret2); err != nil {
		t.Fatal(err)
	}
	if len(ret2.Select) != 1 || ret2.Select[0].Alias != "rel" {
		t.Fatalf("select: %+v", ret2.Select)
	}
	if ret2.Limit == nil || *ret2.Limit != 200 {
		t.Fatalf("limit: %+v", ret2.Limit)
	}
}
