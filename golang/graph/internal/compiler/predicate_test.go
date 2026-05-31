package compiler_test

import (
	"strings"
	"testing"

	"github.com/lucky-byte/graph/internal/compiler"
	"github.com/lucky-byte/graph/internal/ir"
)

func TestEmptyInAndNotIn(t *testing.T) {
	plan := &ir.TraversalPlan{
		RootAlias:      "rel",
		RootTable:      "agent_rel",
		RootPrimaryKey: "id",
		RootPredicates: []*ir.Predicate{
			{Alias: "rel", Field: "a", Op: "in", Value: []any{}},
			{Alias: "rel", Field: "b", Op: "not_in", Value: []any{}},
		},
		AliasBindings: map[string]*ir.AliasBinding{
			"rel": {Alias: "rel", Table: "agent_rel", ScopeType: ir.ScopeMaterialize},
		},
	}
	proj := &ir.QueryProjection{
		SelectItems:        []*ir.SelectItem{{Alias: "rel", Fields: []string{"id"}}},
		Limit:              10,
		PaginationStrategy: ir.PaginateDirect,
	}
	sql, _, err := compiler.CompileQuery(plan, proj)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, "1 = 0") || !strings.Contains(sql, "1 = 1") {
		t.Fatalf("sql=%s", sql)
	}
}
