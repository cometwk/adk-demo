package cmd

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/cometwk/base/lib/migrategen"
	"github.com/cometwk/lib/pkg/env"
	mysql "github.com/go-sql-driver/mysql"

	_ "github.com/go-sql-driver/mysql"
)

type ddlCheckArgs struct {
	snapshotPath string
	database     string
	tableRe      string
	timeout      time.Duration
	exitCode     bool

	canonicalize bool
	tempDBPrefix string
	keepTempDB   bool
}

func migrateDDLCheck(a ddlCheckArgs) error {
	dbURL := env.MustString("DB_URL")
	db, err := sql.Open("mysql", dbURL)
	if err != nil {
		return err
	}
	defer db.Close()

	snap, err := migrategen.ReadSnapshotFile(a.snapshotPath)
	if err != nil {
		return fmt.Errorf("read snapshot: %w", err)
	}

	var re *regexp.Regexp
	if a.tableRe != "" {
		re, err = regexp.Compile(a.tableRe)
		if err != nil {
			return fmt.Errorf("invalid --table-re: %w", err)
		}
	}

	snapTables := migrategen.ParseSnapshotTables(snap)
	if a.canonicalize {
		canon, cleanup, err := canonicalizeSnapshotByTempDB(dbURL, snap, snapTables, a.tempDBPrefix, a.timeout, a.keepTempDB)
		if err != nil {
			log.Printf("WARN: canonicalize failed, fallback to raw snapshot compare: %v", err)
		} else {
			defer cleanup()
			snapTables = canon
		}
	}

	rep, err := migrategen.CompareSnapshotToDB(snapTables, migrategen.DDLOptions{
		DB:          db,
		Database:    a.database,
		TableFilter: re,
		Timeout:     a.timeout,
	})
	if err != nil {
		return err
	}

	fmt.Println("DDL 对比报告（snapshot vs DB）")
	fmt.Printf("- snapshot tables: %d\n", len(rep.SnapshotTables))
	fmt.Printf("- db tables:       %d\n", len(rep.DBTables))
	fmt.Printf("- missing in DB:   %d\n", len(rep.MissingInDB))
	fmt.Printf("- extra in DB:     %d\n", len(rep.ExtraInDB))
	fmt.Printf("- different:       %d\n", len(rep.DifferentInDB))
	fmt.Printf("- same:            %d\n", len(rep.SameInDB))

	if len(rep.MissingInDB) > 0 {
		fmt.Println("\n--- snapshot 有但 DB 缺少的表 ---")
		for _, t := range rep.MissingInDB {
			fmt.Println("-", t)
		}
	}
	if len(rep.ExtraInDB) > 0 {
		fmt.Println("\n--- DB 有但 snapshot 缺少的表 ---")
		for _, t := range rep.ExtraInDB {
			fmt.Println("-", t)
		}
	}
	if len(rep.DifferentInDB) > 0 {
		fmt.Println("\n--- DDL 不一致的表（仅列名，具体差异请用 SHOW CREATE TABLE 对照） ---")
		for _, t := range rep.DifferentInDB {
			fmt.Println("-", t)
		}
	}

	hasDiff := len(rep.MissingInDB) > 0 || len(rep.ExtraInDB) > 0 || len(rep.DifferentInDB) > 0
	if hasDiff && a.exitCode {
		log.Printf("DDL 不一致（exit-code enabled）")
		return fmt.Errorf("ddl mismatch")
	}
	return nil
}

func canonicalizeSnapshotByTempDB(dbURL, snapshotSQL string, snapshotTables map[string]string, prefix string, timeout time.Duration, keep bool) (map[string]string, func(), error) {
	cfg, err := mysql.ParseDSN(dbURL)
	if err != nil {
		return nil, func() {}, fmt.Errorf("parse DB_URL: %w", err)
	}
	if prefix == "" {
		prefix = "__ddlcheck"
	}
	tmpDB := fmt.Sprintf("%s_%s", prefix, time.Now().UTC().Format("20060102150405"))

	adminCfg := *cfg
	adminCfg.DBName = ""
	adminCfg.MultiStatements = true
	adminDB, err := sql.Open("mysql", adminCfg.FormatDSN())
	if err != nil {
		return nil, func() {}, fmt.Errorf("open admin db: %w", err)
	}

	cleanup := func() {
		_ = adminDB.Close()
	}

	// Ensure cleanup drops temp DB unless keep is requested.
	if !keep {
		prevCleanup := cleanup
		cleanup = func() {
			ctx, cancel := contextWithTimeout(timeout)
			defer cancel()
			_, _ = adminDB.ExecContext(ctx, fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", strings.ReplaceAll(tmpDB, "`", "``")))
			prevCleanup()
		}
	}

	ctx, cancel := contextWithTimeout(timeout)
	defer cancel()

	if _, err := adminDB.ExecContext(ctx, fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`", strings.ReplaceAll(tmpDB, "`", "``"))); err != nil {
		cleanup()
		return nil, func() {}, fmt.Errorf("create temp db: %w", err)
	}

	tmpCfg := *cfg
	tmpCfg.DBName = tmpDB
	tmpCfg.MultiStatements = true
	tmpConn, err := sql.Open("mysql", tmpCfg.FormatDSN())
	if err != nil {
		cleanup()
		return nil, func() {}, fmt.Errorf("open temp db: %w", err)
	}
	defer tmpConn.Close()

	// Execute snapshot in temp DB to let MySQL canonicalize table definitions.
	// Disable foreign key checks to reduce ordering sensitivity.
	sqlToExec := "SET FOREIGN_KEY_CHECKS=0;\n" + snapshotSQL + "\nSET FOREIGN_KEY_CHECKS=1;\n"
	ctx2, cancel2 := contextWithTimeout(timeout)
	defer cancel2()
	if _, err := tmpConn.ExecContext(ctx2, sqlToExec); err != nil {
		cleanup()
		return nil, func() {}, fmt.Errorf("exec snapshot in temp db: %w", err)
	}

	// Now export canonical CREATE TABLE from temp DB.
	tables, err := listTablesSimple(tmpConn, timeout)
	if err != nil {
		cleanup()
		return nil, func() {}, fmt.Errorf("list temp tables: %w", err)
	}

	out := map[string]string{}
	for _, t := range tables {
		// Only export those that existed in parsed snapshot tables; avoids noise from non-table objects.
		if _, ok := snapshotTables[t]; !ok {
			continue
		}
		createSQL, err := showCreateTableSimple(tmpConn, timeout, t)
		if err != nil {
			cleanup()
			return nil, func() {}, fmt.Errorf("show create temp table %s: %w", t, err)
		}
		out[t] = createSQL
	}

	return out, cleanup, nil
}

// Minimal helpers kept in cmd layer to avoid expanding migrategen API surface.
func contextWithTimeout(timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return context.WithTimeout(context.Background(), timeout)
}

func listTablesSimple(db *sql.DB, timeout time.Duration) ([]string, error) {
	ctx, cancel := contextWithTimeout(timeout)
	defer cancel()
	rows, err := db.QueryContext(ctx, "SHOW TABLES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func showCreateTableSimple(db *sql.DB, timeout time.Duration, table string) (string, error) {
	ctx, cancel := contextWithTimeout(timeout)
	defer cancel()
	q := fmt.Sprintf("SHOW CREATE TABLE `%s`", strings.ReplaceAll(table, "`", "``"))
	var name string
	var createSQL string
	if err := db.QueryRowContext(ctx, q).Scan(&name, &createSQL); err != nil {
		return "", err
	}
	if !strings.HasSuffix(strings.TrimSpace(createSQL), ";") {
		createSQL += ";"
	}
	return createSQL, nil
}
