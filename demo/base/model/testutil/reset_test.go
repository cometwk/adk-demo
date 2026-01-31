package testutil

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/sirupsen/logrus"
)

func TestResetTestDB(t *testing.T) {
	db := UseTestDB()

	ddls := []string{
		"drop_base.sql",
		"drop_reactgo.sql",
		"base.sql",
		"reactgo.sql",
		"init.sql",
	}

	for _, ddl := range ddls {
		ddlPath := getSQLPath2(ddl)
		sql, err := os.ReadFile(ddlPath)
		if err != nil {
			logrus.Fatalf("failed to read %s: %v", ddlPath, err)
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			logrus.Fatalf("failed to exec %s: %v", ddlPath, err)
		}
	}
}

// getSQLPath 获取 SQL 文件的绝对路径
func getSQLPath2(sqlfile string) string {
	_, filename, _, _ := runtime.Caller(0)
	resetDir := filepath.Dir(filename)
	baseDir := filepath.Join(resetDir, "..", "..", "docs", "sql")
	return filepath.Join(baseDir, sqlfile)
}
