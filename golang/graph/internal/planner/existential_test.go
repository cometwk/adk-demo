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

func TestExistentialExistsScope(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"merch","alias":"m"},
		"traverse":[{"from":"m","relation":"has_order_daily","alias":"od","require":"exists"}]
	}`), &q)
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.ExistentialScopes) != 1 || plan.ExistentialScopes[0].Type != ir.ScopeExists {
		t.Fatalf("scopes: %+v", plan.ExistentialScopes)
	}
}

func TestExistentialInnerScopeStructure(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	// 注册临时 relation: order_daily → order_detail
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"has_detail","alias":"d"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.ExistentialScopes) != 1 {
		t.Fatalf("scopes: %d", len(plan.ExistentialScopes))
	}
	scope := plan.ExistentialScopes[0]
	// 验证 ContainedAliases 包含 boundary + inner
	if len(scope.ContainedAliases) != 2 {
		t.Fatalf("contained: %v", scope.ContainedAliases)
	}
	if scope.ContainedAliases[0] != "od" || scope.ContainedAliases[1] != "d" {
		t.Errorf("contained: %v", scope.ContainedAliases)
	}
	// 验证 InnerSteps
	if len(scope.InnerSteps) != 1 || scope.InnerSteps[0].ToAlias != "d" {
		t.Fatalf("inner steps: %+v", scope.InnerSteps)
	}
	// 验证 boundary step 的 ScopeIndex
	odStep := plan.Steps[1]
	if odStep.ScopeIndex != 0 {
		t.Errorf("od step scope index: %d", odStep.ScopeIndex)
	}
	// 验证 inner step 的 ScopeIndex
	dStep := plan.Steps[2]
	if dStep.ScopeIndex != 0 {
		t.Errorf("d step scope index: %d", dStep.ScopeIndex)
	}
}
