package compiler_test

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/lucky-byte/graph/internal/compiler"
	"github.com/lucky-byte/graph/internal/dsl"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/planner"
	"github.com/lucky-byte/graph/internal/projection"
	"github.com/lucky-byte/graph/internal/registry"
	"github.com/lucky-byte/graph/internal/testutil"
)

func normalizeSQL(s string) string {
	s = strings.TrimSpace(s)
	return regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
}

func TestCompileQuerySection6Golden(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)

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
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no", "obj_no", "obj_name"}},
			{Alias: "m", Fields: []string{"id"}, As: "merch_id"},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, args, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	want := normalizeSQL(`SELECT rel.agent_no, rel.obj_no, rel.obj_name, m.id AS merch_id
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
SELECT 1 FROM order_daily od
WHERE od.merch_id = m.id
AND od.report_date >= ?
AND od.report_date <= ?) LIMIT ? OFFSET ?`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
	if len(args) != 5 {
		t.Fatalf("args=%v", args)
	}
	if args[0] != float64(1) && args[0] != 1 {
		t.Fatalf("apply arg=%v", args[0])
	}
	if args[3] != 200 || args[4] != 0 {
		t.Fatalf("limit/offset=%v %v", args[3], args[4])
	}
}

func TestCompileQueryExistentialInnerJoin(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_detail"] = &ir.RelationSchema{
		Name: "has_detail", FromTable: "order_daily", FromField: "id",
		ToTable: "order_detail", ToField: "order_id", Cardinality: "one_to_many",
	}

	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "none" },
    { "from": "od", "relation": "has_detail", "alias": "d",
      "where": [{ "field": "status", "op": "eq", "value": "paid" }] }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, tmpRels, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
			{Alias: "m", Fields: []string{"id"}},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, args, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	want := normalizeSQL(`SELECT rel.agent_no, m.id
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
SELECT 1 FROM order_daily od
INNER JOIN order_detail d ON od.id = d.order_id
WHERE od.merch_id = m.id
AND d.status = ?) LIMIT ? OFFSET ?`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
	if len(args) != 4 {
		t.Fatalf("args=%v", args)
	}
	if args[0] != float64(1) && args[0] != 1 {
		t.Fatalf("apply arg=%v", args[0])
	}
	if args[1] != "paid" {
		t.Fatalf("status arg=%v", args[1])
	}
}

func TestCompileQueryExistentialInnerJoinMultipleSteps(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
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

	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "none" },
    { "from": "od", "relation": "has_detail", "alias": "d" },
    { "from": "d", "relation": "has_payment", "alias": "p",
      "where": [{ "field": "amount", "op": "gt", "value": 100 }] }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, tmpRels, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, _, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	want := normalizeSQL(`SELECT rel.agent_no
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
SELECT 1 FROM order_daily od
INNER JOIN order_detail d ON od.id = d.order_id
INNER JOIN payment p ON d.id = p.detail_id
WHERE od.merch_id = m.id
AND p.amount > ?) LIMIT ? OFFSET ?`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
}

func TestCompileQueryExistentialNoInnerSteps(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)

	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "none",
      "where": [{ "field": "report_date", "op": "gte", "value": "2026-05-01" }] }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, registry.RelationRegistry, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, _, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	want := normalizeSQL(`SELECT rel.agent_no
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
SELECT 1 FROM order_daily od
WHERE od.merch_id = m.id
AND od.report_date >= ?) LIMIT ? OFFSET ?`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
}

func TestCompileQueryBranchTraversal(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_settle"] = &ir.RelationSchema{
		Name: "has_settle", FromTable: "merch", FromField: "id",
		ToTable: "settle", ToField: "merch_id", Cardinality: "one_to_many",
	}

	// 分支遍历: m → od(always) + m → st(none)
	// od 是 one_to_many always → HasFanOut=true → PaginateRootFirst
	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "always" },
    { "from": "m", "relation": "has_settle", "alias": "st", "require": "none" }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, tmpRels, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
			{Alias: "m", Fields: []string{"id"}},
			{Alias: "od", Fields: []string{"id"}},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, _, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	// PaginateRootFirst: 内层分页 + 外层 JOIN fan-out 表
	want := normalizeSQL(`SELECT rel.agent_no, m.id, od.id
FROM (SELECT rel.id FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
SELECT 1 FROM settle st
WHERE st.merch_id = m.id) LIMIT ? OFFSET ?) _roots
INNER JOIN agent_rel rel ON rel.id = _roots.id
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON m.id = od.merch_id`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
}

func TestCompileQueryBranchBothAlways(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_ = registry.InitTableSchemaRegistry(engine)
	tmpRels := make(map[string]*ir.RelationSchema)
	for k, v := range registry.RelationRegistry {
		tmpRels[k] = v
	}
	tmpRels["has_settle"] = &ir.RelationSchema{
		Name: "has_settle", FromTable: "merch", FromField: "id",
		ToTable: "settle", ToField: "merch_id", Cardinality: "one_to_many",
	}

	// 两个 always 分支，均有 fan-out → PaginateRootFirst
	raw := `{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "always" },
    { "from": "m", "relation": "has_settle", "alias": "st", "require": "always" }
  ]
}`
	var q dsl.GraphTraversalQuery
	if err := json.Unmarshal([]byte(raw), &q); err != nil {
		t.Fatal(err)
	}
	plan, err := planner.CompilePlan(&q, tmpRels, registry.TableSchemaRegistry)
	if err != nil {
		t.Fatal(err)
	}
	ret := &dsl.QueryReturnDef{
		Select: []*dsl.SelectDef{
			{Alias: "rel", Fields: []string{"agent_no"}},
			{Alias: "m", Fields: []string{"id"}},
			{Alias: "od", Fields: []string{"id"}},
			{Alias: "st", Fields: []string{"id"}},
		},
	}
	proj, err := projection.PlanQuery(plan, ret)
	if err != nil {
		t.Fatal(err)
	}
	sql, _, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}

	// PaginateRootFirst
	want := normalizeSQL(`SELECT rel.agent_no, m.id, od.id, st.id
FROM (SELECT rel.id FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ? LIMIT ? OFFSET ?) _roots
INNER JOIN agent_rel rel ON rel.id = _roots.id
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON m.id = od.merch_id
INNER JOIN settle st ON m.id = st.merch_id`)

	got := normalizeSQL(sql)
	if got != want {
		t.Fatalf("sql\ngot:  %s\nwant: %s", got, want)
	}
}
