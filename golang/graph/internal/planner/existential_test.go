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
