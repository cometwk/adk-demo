package registry_test

import (
	"testing"

	"github.com/lucky-byte/graph/internal/registry"
)

func TestRelationRegistry(t *testing.T) {
	r, ok := registry.GetRelation("for_merch")
	if !ok {
		t.Fatal("for_merch not found")
	}
	if r.Cardinality != "many_to_one" || r.FromTable != "agent_rel" {
		t.Fatalf("for_merch: %+v", r)
	}
	_, ok = registry.GetRelation("missing")
	if ok {
		t.Fatal("expected missing relation")
	}
}
