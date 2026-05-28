package testutil

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/lucky-byte/demo/biz"
	"github.com/lucky-byte/lib/pkg/log"
	"github.com/lucky-byte/lib/pkg/orm"
	"github.com/sirupsen/logrus"
	"xorm.io/xorm"
)

// getSQLPath 获取 SQL 文件的绝对路径
// 从 serve/biz/testutil/reset.go 到 serve/docs/ddl/ 需要向上两级
func getSQLPath(relativePath string) string {
	_, filename, _, _ := runtime.Caller(0)
	// 获取 reset.go 文件所在的目录
	resetDir := filepath.Dir(filename)
	// 从 serve/biz/testutil/ 向上两级到 serve/，然后拼接相对路径
	baseDir := filepath.Join(resetDir, "..", "..")
	return filepath.Join(baseDir, relativePath)
}

// 初始化测试数据库, 沿用数据库
func UseTestDB() *xorm.Engine {
	orm.InitDefaultDB()
	biz.InitDB() // 初始化 biz 包的模型
	db := orm.MustDB()

	log.InitDebugNoColor()
	logger := logrus.WithField("reqid", "abc").WithField("id", "").WithField("module", "ormtest")
	logrus.SetLevel(logrus.WarnLevel)
	orm.SetLogger(logger)
	return db
}

// 重置数据库数据
func ResetTestDB() *xorm.Engine {
	db := UseTestDB()
	err := ResetDBTest(db)
	if err != nil {
		logrus.Fatalf("failed to reset test db: %v", err)
		return nil
	}
	return db
}

func ResetTestOnce() error {
	db := UseTestDB()
	// 主要：若需要重置的话，要删除 /tmp/testonce/reset_test_db 文件
	err := DoOnce("reset_test_db", func() error {
		return ResetDBTest(db)
	})
	return err
}

func SetupTestDB(t *testing.T) {
	t.Helper()

	// dbURL := env.MustString("TEST_DB_URL")
	// os.Setenv("DB_URL", dbURL)

	err := ResetTestOnce()
	if err != nil {
		logrus.Fatalf("failed to reset test db: %v", err)
	}

	// 影响定位失败用例；这里把全局 logrus 等级调高，保留 warning/error 即可。
	logrus.SetLevel(logrus.WarnLevel)
}

// 重置数据库数据
func ResetDBTest(db *xorm.Engine) error {
	dropTables := []string{
		"lib_reader",
		"lib_author",
		"lib_book",
		"lib_branch",
		"lib_category",
		"lib_series",
	}
	for _, table := range dropTables {
		_, err := db.Exec("DROP TABLE IF EXISTS " + table)
		if err != nil {
			return err
		}
	}

	ddls := []string{
		"ddl/library/reader.sql",
		"ddl/library/author.sql",
		"ddl/library/book.sql",
		"ddl/library/branch.sql",
		"ddl/library/category.sql",
		"ddl/library/series.sql",
	}

	for _, ddl := range ddls {
		ddlPath := getSQLPath(ddl)
		sql, err := os.ReadFile(ddlPath)
		if err != nil {
			logrus.Fatalf("failed to read %s: %v", ddlPath, err)
			return err
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			logrus.Fatalf("failed to exec %s: %v", ddlPath, err)
			return err
		}
	}
	return nil
}

// 重置测试数据
func ResetTestData() *xorm.Engine {
	orm.InitDefaultDB()
	biz.InitDB() // 初始化 biz 包的模型
	db := orm.MustDB()

	data := []string{
		"docs/data/init-data.sql",
	}

	for _, dataFile := range data {
		dataPath := getSQLPath(dataFile)
		sql, err := os.ReadFile(dataPath)
		if err != nil {
			logrus.Fatalf("failed to read %s: %v", dataPath, err)
		}
		_, err = db.Exec(string(sql))
		if err != nil {
			logrus.Fatalf("failed to exec %s: %v", dataPath, err)
		}
	}

	return db
}