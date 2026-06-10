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
	// 注册临时 relation: order_daily → order_detail (one_to_many)
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
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	// 验证 scope 结构
	if len(plan.ExistentialScopes) != 1 {
		t.Fatalf("scopes: %d", len(plan.ExistentialScopes))
	}
	scope := plan.ExistentialScopes[0]
	if scope.Type != ir.ScopeNotExists {
		t.Errorf("scope type: got %v, want %v", scope.Type, ir.ScopeNotExists)
	}
	if scope.BoundaryAlias != "od" {
		t.Errorf("boundary: got %q, want %q", scope.BoundaryAlias, "od")
	}
	if len(scope.ContainedAliases) != 2 {
		t.Fatalf("contained: %v", scope.ContainedAliases)
	}
	if scope.ContainedAliases[0] != "od" || scope.ContainedAliases[1] != "d" {
		t.Errorf("contained: %v", scope.ContainedAliases)
	}
	if len(scope.InnerSteps) != 1 {
		t.Fatalf("inner steps: %d", len(scope.InnerSteps))
	}
	if scope.InnerSteps[0].ToAlias != "d" {
		t.Errorf("inner step to: %q", scope.InnerSteps[0].ToAlias)
	}
	// 验证 inner step 的 ScopeType 继承
	dBinding := plan.AliasBindings["d"]
	if dBinding.ScopeType != ir.ScopeNotExists {
		t.Errorf("d scope type: got %v, want %v", dBinding.ScopeType, ir.ScopeNotExists)
	}
	// 验证 inner step 不影响 HasFanOut
	if plan.HasFanOut {
		t.Error("HasFanOut should be false for existential inner steps")
	}
}

func TestCompilePlanExistentialInnerNotAlways(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	// inner step 使用 require: optional 应报错
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"has_detail","alias":"d","require":"optional"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, tmpRels, tables)
	if err == nil {
		t.Fatal("expected error for inner step with require:optional")
	}
}

func TestCompilePlanExistentialInnerExists(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	// inner step 使用 require: exists 应报错
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"has_detail","alias":"d","require":"exists"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, tmpRels, tables)
	if err == nil {
		t.Fatal("expected error for inner step with require:exists")
	}
}

func TestCompilePlanExistentialScopeInherit(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	// exists scope inner step 的 ScopeType 应继承为 ScopeExists
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"exists"},
			{"from":"od","relation":"has_detail","alias":"d"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if len(plan.ExistentialScopes) != 1 {
		t.Fatalf("scopes: %d", len(plan.ExistentialScopes))
	}
	scope := plan.ExistentialScopes[0]
	if scope.Type != ir.ScopeExists {
		t.Errorf("scope type: got %v, want %v", scope.Type, ir.ScopeExists)
	}
	dBinding := plan.AliasBindings["d"]
	if dBinding.ScopeType != ir.ScopeExists {
		t.Errorf("d scope type: got %v, want %v", dBinding.ScopeType, ir.ScopeExists)
	}
}

func TestCompilePlanExistentialInnerMultiStep(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}
	tmpRels["has_payment"] = &ir.RelationSchema{
		Name: "has_payment", FromTable: "order_detail", FromField: "id",
		ToTable: "payment", ToField: "detail_id", Cardinality: "many_to_one",
	}

	// 多层 inner step: m → od(none) → d(always) → p(always)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"has_detail","alias":"d"},
			{"from":"d","relation":"has_payment","alias":"p"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if len(plan.ExistentialScopes) != 1 {
		t.Fatalf("scopes: %d", len(plan.ExistentialScopes))
	}
	scope := plan.ExistentialScopes[0]
	if len(scope.ContainedAliases) != 3 {
		t.Fatalf("contained: %v", scope.ContainedAliases)
	}
	if len(scope.InnerSteps) != 2 {
		t.Fatalf("inner steps: %d", len(scope.InnerSteps))
	}
	if scope.InnerSteps[0].ToAlias != "d" {
		t.Errorf("inner step 0: %q", scope.InnerSteps[0].ToAlias)
	}
	if scope.InnerSteps[1].ToAlias != "p" {
		t.Errorf("inner step 1: %q", scope.InnerSteps[1].ToAlias)
	}
	// 验证所有 inner step 的 ScopeType 继承
	for _, alias := range []string{"d", "p"} {
		b := plan.AliasBindings[alias]
		if b.ScopeType != ir.ScopeNotExists {
			t.Errorf("%s scope type: got %v, want %v", alias, b.ScopeType, ir.ScopeNotExists)
		}
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

func TestCompilePlanCyclicTraversal(t *testing.T) {
	tables := setupPlanner(t)
	// 注册一个反向关系来构造环路：merch → agent_rel
	cycleRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		cycleRels[k] = v
	}
	cycleRels["back_to_agent_rel"] = &ir.RelationSchema{
		Name:        "back_to_agent_rel",
		FromTable:   "merch",
		FromField:   "id",
		ToTable:     "agent_rel",
		ToField:     "merch_id",
		Cardinality: "one_to_many",
	}

	var q dsl.GraphTraversalQuery
	// agent_rel → merch → agent_rel (环路)
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"back_to_agent_rel","alias":"rel2"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, cycleRels, tables)
	if err == nil {
		t.Fatal("expected cyclic traversal error")
	}
}

func TestCompilePlanCyclicTraversalIndirect(t *testing.T) {
	tables := setupPlanner(t)
	// 注册反向关系构造间接环路
	cycleRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		cycleRels[k] = v
	}
	cycleRels["order_daily_back_merch"] = &ir.RelationSchema{
		Name:        "order_daily_back_merch",
		FromTable:   "order_daily",
		FromField:   "merch_id",
		ToTable:     "merch",
		ToField:     "id",
		Cardinality: "many_to_one",
	}

	var q dsl.GraphTraversalQuery
	// agent_rel → merch → order_daily → merch (间接环路，回到 merch)
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od"},
			{"from":"od","relation":"order_daily_back_merch","alias":"m2"}
		]
	}`), &q)
	_, err := planner.CompilePlan(&q, cycleRels, tables)
	if err == nil {
		t.Fatal("expected cyclic traversal error for indirect cycle")
	}
}

func TestCompilePlanBranchTraversal(t *testing.T) {
	tables := setupPlanner(t)
	// 注册临时 relation: merch → settle (one_to_many)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_settle"] = &ir.RelationSchema{
		Name: "has_settle", FromTable: "merch", FromField: "id",
		ToTable: "settle", ToField: "merch_id", Cardinality: "one_to_many",
	}

	// 分支遍历: rel → m(always) → od(always), m → st(none)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od"},
			{"from":"m","relation":"has_settle","alias":"st","require":"none"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	// 验证 Steps
	if len(plan.Steps) != 3 {
		t.Fatalf("steps: %d", len(plan.Steps))
	}
	// step1 和 step2 的 FromAlias 都是 "m"
	if plan.Steps[1].FromAlias != "m" || plan.Steps[2].FromAlias != "m" {
		t.Fatalf("branch from: %q, %q", plan.Steps[1].FromAlias, plan.Steps[2].FromAlias)
	}
	// 验证 alias bindings
	if plan.AliasBindings["od"].ScopeType != ir.ScopeMaterialize {
		t.Errorf("od scope type: got %v", plan.AliasBindings["od"].ScopeType)
	}
	if plan.AliasBindings["st"].ScopeType != ir.ScopeNotExists {
		t.Errorf("st scope type: got %v", plan.AliasBindings["st"].ScopeType)
	}
	// 验证 HasFanOut: od 是 one_to_many 且物化，所以 HasFanOut=true
	if !plan.HasFanOut {
		t.Error("HasFanOut should be true")
	}
}

func TestCompilePlanBranchTraversalBothAlways(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_settle"] = &ir.RelationSchema{
		Name: "has_settle", FromTable: "merch", FromField: "id",
		ToTable: "settle", ToField: "merch_id", Cardinality: "one_to_many",
	}

	// 两个 always 分支
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od"},
			{"from":"m","relation":"has_settle","alias":"st"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if len(plan.Steps) != 3 {
		t.Fatalf("steps: %d", len(plan.Steps))
	}
	// 两个都是物化
	if plan.AliasBindings["od"].ScopeType != ir.ScopeMaterialize {
		t.Errorf("od scope type: got %v", plan.AliasBindings["od"].ScopeType)
	}
	if plan.AliasBindings["st"].ScopeType != ir.ScopeMaterialize {
		t.Errorf("st scope type: got %v", plan.AliasBindings["st"].ScopeType)
	}
	if !plan.HasFanOut {
		t.Error("HasFanOut should be true")
	}
}

func TestCompilePlanBranchExistentialInnerInteraction(t *testing.T) {
	tables := setupPlanner(t)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_settle"] = &ir.RelationSchema{
		Name: "has_settle", FromTable: "merch", FromField: "id",
		ToTable: "settle", ToField: "merch_id", Cardinality: "one_to_many",
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	// 分支遍历 + existential inner traversal:
	// m → od(none) → d(always) AND m → st(always)
	var q dsl.GraphTraversalQuery
	_ = json.Unmarshal([]byte(`{
		"match":{"type":"agent_rel","alias":"rel"},
		"traverse":[
			{"from":"rel","relation":"for_merch","alias":"m"},
			{"from":"m","relation":"has_order_daily","alias":"od","require":"none"},
			{"from":"od","relation":"has_detail","alias":"d"},
			{"from":"m","relation":"has_settle","alias":"st"}
		]
	}`), &q)
	plan, err := planner.CompilePlan(&q, tmpRels, tables)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	// 验证 st 是物化的
	stBinding := plan.AliasBindings["st"]
	if stBinding.ScopeType != ir.ScopeMaterialize {
		t.Errorf("st scope type: got %v", stBinding.ScopeType)
	}
	// 验证 d 是 ScopeNotExists（继承自 od）
	dBinding := plan.AliasBindings["d"]
	if dBinding.ScopeType != ir.ScopeNotExists {
		t.Errorf("d scope type: got %v", dBinding.ScopeType)
	}
	// 验证 st 的 IsFanOut (one_to_many + materialize)
	stStep := plan.Steps[3]
	if !stStep.IsFanOut {
		t.Error("st should be IsFanOut")
	}
	// HasFanOut 应为 true (st 是 one_to_many 物化)
	if !plan.HasFanOut {
		t.Error("HasFanOut should be true")
	}
	// 验证 existential scope 不包含 st
	if len(plan.ExistentialScopes) != 1 {
		t.Fatalf("scopes: %d", len(plan.ExistentialScopes))
	}
	scope := plan.ExistentialScopes[0]
	for _, a := range scope.ContainedAliases {
		if a == "st" {
			t.Error("st should not be in existential scope")
		}
	}
}
