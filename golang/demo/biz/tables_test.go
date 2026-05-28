//go:build local

package biz_test

import (
	"os"
	"testing"

	biztestutil "github.com/lucky-byte/demo/biz/testutil"
	"github.com/lucky-byte/lib/pkg/env"
)

// 重置 ddl 和 data
func TestResetDB(t *testing.T) {
	testDB := false
	// testDB = true
	if testDB {
		dbURL := env.MustString("TEST_DB_URL")
		os.Setenv("DB_URL", dbURL)
	}

	biztestutil.ResetTestDB()
}

// 重置 data
func TestResetData(t *testing.T) {
	biztestutil.ResetTestData()
}
