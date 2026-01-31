package migrategen

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"
)

func TestApply_NoDiff_NoMigration(t *testing.T) {
	tmp := t.TempDir()

	docs := filepath.Join(tmp, "serve", "docs")
	ddl := filepath.Join(docs, "ddl")
	migs := filepath.Join(tmp, "db", "migrations")
	if err := os.MkdirAll(ddl, 0o755); err != nil {
		t.Fatal(err)
	}

	// Minimal merge.sh with a deterministic order
	if err := os.WriteFile(filepath.Join(docs, "merge.sh"), []byte("awk '1' \\\n  ddl/a.sql \\\n  ddl/b.sql \\\n> ./table.sql\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ddl, "a.sql"), []byte("CREATE TABLE IF NOT EXISTS a (id INT);\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ddl, "b.sql"), []byte("CREATE TABLE IF NOT EXISTS b (id INT);\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	merged, err := mergeDDL(docs, []string{"ddl/a.sql", "ddl/b.sql"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(docs, "table.sql"), []byte(merged), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Apply(Options{
		Name:          "init",
		DocsDir:       docs,
		MigrationsDir: migs,
		NowUTC:        func() time.Time { return time.Date(2025, 12, 25, 0, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatalf("Apply error: %v", err)
	}
	if res.Changed {
		t.Fatalf("expected Changed=false")
	}

	entries, err := os.ReadDir(migs)
	if err == nil && len(entries) > 0 {
		t.Fatalf("expected no migrations, got %d", len(entries))
	}
}

func TestApply_WithDiff_CreatesPairAndUpdatesSnapshot(t *testing.T) {
	tmp := t.TempDir()

	docs := filepath.Join(tmp, "serve", "docs")
	ddl := filepath.Join(docs, "ddl")
	migs := filepath.Join(tmp, "db", "migrations")
	if err := os.MkdirAll(ddl, 0o755); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(docs, "merge.sh"), []byte("awk '1' \\\n  ddl/a.sql \\\n> ./table.sql\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// baseline snapshot has table a(id INT)
	if err := os.WriteFile(filepath.Join(docs, "table.sql"), []byte("CREATE TABLE IF NOT EXISTS a (id INT);\n\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// new ddl changes table a(id BIGINT)
	if err := os.WriteFile(filepath.Join(ddl, "a.sql"), []byte("CREATE TABLE IF NOT EXISTS a (id BIGINT);\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Apply(Options{
		Name:          "update-a",
		DocsDir:       docs,
		MigrationsDir: migs,
		NowUTC:        func() time.Time { return time.Date(2025, 12, 25, 12, 34, 56, 0, time.UTC) },
	})
	if err != nil {
		t.Fatalf("Apply error: %v", err)
	}
	if !res.Changed {
		t.Fatalf("expected Changed=true")
	}

	entries, err := os.ReadDir(migs)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 migration files, got %d", len(entries))
	}

	reUp := regexp.MustCompile(`^20251225123456_update_a\.up\.sql$`)
	reDown := regexp.MustCompile(`^20251225123456_update_a\.down\.sql$`)
	hasUp, hasDown := false, false
	for _, e := range entries {
		if reUp.MatchString(e.Name()) {
			hasUp = true
		}
		if reDown.MatchString(e.Name()) {
			hasDown = true
		}
	}
	if !hasUp || !hasDown {
		t.Fatalf("expected up/down files, got: %+v", []string{entries[0].Name(), entries[1].Name()})
	}

	// Snapshot updated to new merged ddl
	newSnap, err := os.ReadFile(filepath.Join(docs, "table.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`BIGINT`).Match(newSnap) {
		t.Fatalf("expected snapshot updated, got: %s", string(newSnap))
	}
}


