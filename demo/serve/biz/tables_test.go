//go:build local

package biz_test

import (
	"os"
	"testing"

	"github.com/cometwk/lib/pkg/env"
	biztestutil "github.com/cometwk/serve/biz/testutil"
)

func TestResetDB(t *testing.T) {
	testDB := false
	// testDB = true
	if testDB {
		dbURL := env.MustString("TEST_DB_URL")
		os.Setenv("DB_URL", dbURL)
	}

	biztestutil.ResetTestDB()
}

// 重置测试数据
func TestResetData(t *testing.T) {
	biztestutil.ResetTestData()
}

// 重置测试分润数据
func TestResetProfitData(t *testing.T) {
	biztestutil.ResetTestProfitData()
}
