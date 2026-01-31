package model

import (
	"os"
	"testing"

	"github.com/cometwk/lib/pkg/orm"
)

func Test1(t *testing.T) {
	orm.InitDefaultDB()
	db := orm.MustDB()

	ddls := []string{
		"../docs/data/p_key.sql",
	}

	for _, ddl := range ddls {
		sql, err := os.ReadFile(ddl)
		if err != nil {
			t.Fatalf("failed to read %s: %v", ddl, err)
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			t.Fatalf("failed to exec %s: %v", ddl, err)
		}
	}

}
func TestResetDevDB(t *testing.T) {
	orm.InitDefaultDB()
	db := orm.MustDB()

	ddls := []string{
		"../docs/sql/drop_base.sql",
		"../docs/sql/drop_reactgo.sql",
		"../docs/sql/base.sql",
		"../docs/sql/reactgo.sql",
		"../docs/sql/init.sql",
	}
	data := []string{
		// "../docs/data/init.sql",
	}

	for _, ddl := range ddls {
		sql, err := os.ReadFile(ddl)
		if err != nil {
			t.Fatalf("failed to read %s: %v", ddl, err)
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			t.Fatalf("failed to exec %s: %v", ddl, err)
		}
	}
	for _, data := range data {
		sql, err := os.ReadFile(data)
		if err != nil {
			t.Fatalf("failed to read %s: %v", data, err)
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			t.Fatalf("failed to exec %s: %v", data, err)
		}
	}

}
