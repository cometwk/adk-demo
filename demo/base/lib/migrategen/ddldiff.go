package migrategen

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

type DDLOptions struct {
	DB          *sql.DB
	Database    string // optional; if empty, uses current DB
	TableFilter *regexp.Regexp
	Timeout     time.Duration
}

type DDLReport struct {
	DBTables       []string
	SnapshotTables []string

	MissingInDB   []string // snapshot has, db missing
	ExtraInDB     []string // db has, snapshot missing
	DifferentInDB []string // present in both but DDL differs
	SameInDB      []string

	Details map[string]DDLTableDiff // only for DifferentInDB
}

type DDLTableDiff struct {
	Table       string
	SnapshotSQL string
	DBSQL       string
}

func CompareSnapshotToDB(snapshotTables map[string]string, opts DDLOptions) (*DDLReport, error) {
	if opts.DB == nil {
		return nil, errors.New("DB is required")
	}
	if opts.Timeout <= 0 {
		opts.Timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), opts.Timeout)
	defer cancel()

	dbTables, err := ddlListTables(ctx, opts.DB, opts.Database)
	if err != nil {
		return nil, err
	}

	if opts.TableFilter != nil {
		filtered := make([]string, 0, len(dbTables))
		for _, t := range dbTables {
			if opts.TableFilter.MatchString(t) {
				filtered = append(filtered, t)
			}
		}
		dbTables = filtered
	}

	snapNames := make([]string, 0, len(snapshotTables))
	for k := range snapshotTables {
		if opts.TableFilter != nil && !opts.TableFilter.MatchString(k) {
			continue
		}
		snapNames = append(snapNames, k)
	}
	sort.Strings(dbTables)
	sort.Strings(snapNames)

	dbSet := make(map[string]bool, len(dbTables))
	for _, t := range dbTables {
		dbSet[t] = true
	}

	snapSet := make(map[string]bool, len(snapNames))
	for _, t := range snapNames {
		snapSet[t] = true
	}

	rep := &DDLReport{
		DBTables:       dbTables,
		SnapshotTables: snapNames,
		MissingInDB:    []string{},
		ExtraInDB:      []string{},
		DifferentInDB:  []string{},
		SameInDB:       []string{},
		Details:        map[string]DDLTableDiff{},
	}

	for _, t := range snapNames {
		if !dbSet[t] {
			rep.MissingInDB = append(rep.MissingInDB, t)
		}
	}
	for _, t := range dbTables {
		if !snapSet[t] {
			rep.ExtraInDB = append(rep.ExtraInDB, t)
		}
	}

	// Compare intersection
	for _, t := range snapNames {
		if !dbSet[t] {
			continue
		}
		dbSQL, err := ddlShowCreateTable(ctx, opts.DB, t)
		if err != nil {
			return nil, fmt.Errorf("SHOW CREATE TABLE %s: %w", t, err)
		}
		snapSQL := snapshotTables[t]

		if ddlNormalize(snapSQL) == ddlNormalize(dbSQL) {
			rep.SameInDB = append(rep.SameInDB, t)
			continue
		}
		rep.DifferentInDB = append(rep.DifferentInDB, t)
		rep.Details[t] = DDLTableDiff{
			Table:       t,
			SnapshotSQL: snapSQL,
			DBSQL:       dbSQL,
		}
	}

	sort.Strings(rep.MissingInDB)
	sort.Strings(rep.ExtraInDB)
	sort.Strings(rep.DifferentInDB)
	sort.Strings(rep.SameInDB)
	return rep, nil
}

func ddlListTables(ctx context.Context, db *sql.DB, database string) ([]string, error) {
	query := "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"
	if database != "" {
		query = fmt.Sprintf("SHOW FULL TABLES FROM `%s` WHERE Table_type = 'BASE TABLE'", strings.ReplaceAll(database, "`", "``"))
	}
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		// fallback
		rows2, err2 := db.QueryContext(ctx, "SHOW TABLES")
		if err2 != nil {
			return nil, err
		}
		defer rows2.Close()
		var out []string
		for rows2.Next() {
			var name string
			if err := rows2.Scan(&name); err != nil {
				return nil, err
			}
			out = append(out, name)
		}
		return out, rows2.Err()
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		// first column is table name; second is type
		var name, typ string
		if err := rows.Scan(&name, &typ); err != nil {
			var nameOnly string
			if err2 := rows.Scan(&nameOnly); err2 == nil {
				out = append(out, nameOnly)
				continue
			}
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func ddlShowCreateTable(ctx context.Context, db *sql.DB, table string) (string, error) {
	q := fmt.Sprintf("SHOW CREATE TABLE `%s`", strings.ReplaceAll(table, "`", "``"))
	var name string
	var createSQL string
	err := db.QueryRowContext(ctx, q).Scan(&name, &createSQL)
	if err != nil {
		return "", err
	}
	if !strings.HasSuffix(strings.TrimSpace(createSQL), ";") {
		createSQL = createSQL + ";"
	}
	return createSQL, nil
}

func ddlNormalize(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.TrimSpace(s)

	// Remove MySQL "AUTO_INCREMENT=123" noise
	reAutoInc := regexp.MustCompile(`\bAUTO_INCREMENT=\d+\b`)
	s = reAutoInc.ReplaceAllString(s, "AUTO_INCREMENT=0")

	// Collapse whitespace
	ws := regexp.MustCompile(`\s+`)
	s = ws.ReplaceAllString(s, " ")

	s = strings.ToLower(s)
	return s
}
