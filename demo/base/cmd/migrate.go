package cmd

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/cometwk/lib/pkg/env"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/mysql"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// go install -tags 'mysql postgres sqlite3' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
// migrate create -ext sql -dir db/migrations init

func getEnv() (string, string) {
	// Keep consistent with repo layout (db/migrations). Can be overridden by DB_MIGRATE.
	migrations := env.DirPath("DB_MIGRATE", "db/migrations")
	dbURL := env.MustString("DB_URL")
	return migrations, dbURL
}

// 辅助函数，用于创建 migrate 实例
func getMigrate() *migrate.Migrate {
	migrations, dbURL := getEnv()
	sourceURL := fmt.Sprintf("file://%s", migrations)

	log.Printf("数据库 URL: %s", dbURL)
	log.Printf("迁移文件路径: %s", sourceURL)

	db, _ := sql.Open("mysql", dbURL)
	driver, _ := mysql.WithInstance(db, &mysql.Config{})
	m, err := migrate.NewWithDatabaseInstance(
		sourceURL,
		"mysql",
		driver,
	)

	if err != nil {
		log.Printf("创建 migrate 实例失败: %v", err)
		log.Fatal(err)
	}
	return m
}

func nextVersion() string {
	return time.Now().UTC().Format("20060102150405")
}

func createMigration(dir, name string) error {
	if name == "" {
		return fmt.Errorf("migration name required")
	}

	version := nextVersion()

	up := fmt.Sprintf("%s_%s.up.sql", version, name)
	down := fmt.Sprintf("%s_%s.down.sql", version, name)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	upPath := filepath.Join(dir, up)
	downPath := filepath.Join(dir, down)

	if err := os.WriteFile(upPath, []byte("-- +migrate Up\n"), 0644); err != nil {
		return err
	}
	if err := os.WriteFile(downPath, []byte("-- +migrate Down\n"), 0644); err != nil {
		return err
	}

	fmt.Println("created:", upPath)
	fmt.Println("created:", downPath)
	return nil
}

var _ = createMigration

func migrateUp(step bool) {
	m := getMigrate()
	var err error
	if step {
		err = m.Steps(1)
	} else {
		err = m.Up()
	}
	if err != nil {
		if err == migrate.ErrNoChange {
			fmt.Println("数据库已经是最新版本")
		} else {
			log.Fatal(err)
		}
	} else {
		fmt.Println("迁移成功")
		migrateStatus() // 显示当前数据库版本
	}
}
func migrateDown(step bool) {
	m := getMigrate()
	var err error
	if step {
		err = m.Steps(-1)
	} else {
		err = m.Down()
	}
	if err != nil {
		log.Fatal(err)
	} else {
		fmt.Println("迁移成功")
		migrateStatus() // 显示当前数据库版本
	}
}

func migrateStatus() {
	m := getMigrate()
	version, dirty, err := m.Version()
	if err != nil {
		log.Fatal(err)
	}
	emoji := "✅"
	if dirty {
		emoji = "🚫"
	}
	fmt.Printf("当前数据库版本: %d, 检查未完成的迁移: %s\n", version, emoji)
}

func migrateForce(version int) {
	m := getMigrate()
	err := m.Force(version)
	if err != nil {
		log.Fatal(err)
	} else {
		fmt.Println("迁移成功")
		migrateStatus() // 显示当前数据库版本
	}
}
