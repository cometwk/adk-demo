package registry_test

import (
	"testing"

	"github.com/lucky-byte/graph/internal/registry"
	"github.com/lucky-byte/graph/internal/testutil"
)

func TestInitTableSchemaRegistry(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	if err := registry.InitTableSchemaRegistry(engine); err != nil {
		t.Fatalf("init: %v", err)
	}
	for _, table := range []string{"agent_rel", "merch", "order_daily"} {
		s, ok := registry.GetTable(table)
		if !ok {
			t.Fatalf("table %s not found", table)
		}
		if s.PrimaryKey != "id" {
			t.Fatalf("%s pk=%s", table, s.PrimaryKey)
		}
	}
}

func TestInitTableSchemaRegistryCompositePK(t *testing.T) {
	engine := testutil.SetupGraphTestDB(t)
	_, err := engine.Exec(`CREATE TABLE composite_pk (
		a INTEGER NOT NULL,
		b INTEGER NOT NULL,
		PRIMARY KEY (a, b)
	)`)
	if err != nil {
		t.Fatal(err)
	}
	err = registry.InitTableSchemaRegistry(engine)
	if err == nil {
		t.Fatal("expected composite PK error")
	}
}
