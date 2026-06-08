package compiler_test

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/lucky-byte/graph/internal/compiler"
	"github.com/lucky-byte/graph/internal/dsl"
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
