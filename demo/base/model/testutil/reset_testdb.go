package testutil

import (
	"os"
	"path/filepath"
	"runtime"

	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/sirupsen/logrus"
	"xorm.io/xorm"
)

// getSQLPath 获取 SQL 文件的绝对路径
func getSQLPath(sqlfile string) string {
	_, filename, _, _ := runtime.Caller(0)
	// 获取 reset.go 文件所在的目录
	resetDir := filepath.Dir(filename)
	// 从 base/model/testutil/ 向上两级到 base/，然后拼接相对路径
	baseDir := filepath.Join(resetDir, "..", "..", "docs", "ddl")
	return filepath.Join(baseDir, sqlfile)
}

// 初始化测试数据库, 沿用数据库
func UseTestDB() *xorm.Engine {
	orm.InitDB(env.MustString("DB_DRIVER"), env.MustString("TEST_DB_URL"))
	// orm.InitDB("sqlite3", ":memory:")
	model.InitModels() // 初始化 biz 包的模型
	db := orm.MustDB()

	return db
}

// 重置数据库数据
func ResetTestDB(dataSqlFiles []string) *xorm.Engine {
	db := UseTestDB()

	for _, dataSqlFile := range dataSqlFiles {
		dataPath := getSQLPath(dataSqlFile)
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

const ACL_ADMIN_UUID = "7e9633f6-c83a-49a4-9a96-e120d6ca6055"
