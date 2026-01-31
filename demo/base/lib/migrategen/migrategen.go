package migrategen

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type Options struct {
	// Required
	Name string

	// Paths (all absolute or relative-to-cwd; caller decides)
	DocsDir       string // default: serve/docs
	MigrationsDir string // default: db/migrations
	NowUTC        func() time.Time
}

type Result struct {
	Changed        bool
	Version        string
	NameSanitized  string
	UpPath         string
	DownPath       string
	OldSnapshot    string
	NewSnapshot    string
	OldSnapshotSHA string
	NewSnapshotSHA string
	TableChanges   []TableChange
}

var (
	ddlFileRe = regexp.MustCompile(`\bddl/[A-Za-z0-9_.-]+\.sql\b`)
)

type TableChangeType string

const (
	TableChangeAdded   TableChangeType = "added"
	TableChangeRemoved TableChangeType = "removed"
	TableChangeChanged TableChangeType = "changed"
)

type TableChange struct {
	Table      string
	Type       TableChangeType
	FromCreate string // only for removed/changed
	ToCreate   string // only for added/changed
}

func Apply(opts Options) (*Result, error) {
	opts = withDefaults(opts)
	if err := validate(opts); err != nil {
		return nil, err
	}

	mergeShPath := filepath.Join(opts.DocsDir, "merge.sh")
	ddlOrder, err := readMergeOrder(mergeShPath)
	if err != nil {
		return nil, fmt.Errorf("read merge order: %w", err)
	}
	if len(ddlOrder) == 0 {
		return nil, fmt.Errorf("no ddl files found in %s", mergeShPath)
	}

	newSnapshot, err := mergeDDL(opts.DocsDir, ddlOrder)
	if err != nil {
		return nil, fmt.Errorf("merge ddl: %w", err)
	}

	baselinePath := filepath.Join(opts.DocsDir, "table.sql")
	oldSnapshot, err := readFileIfExists(baselinePath)
	if err != nil {
		return nil, fmt.Errorf("read baseline snapshot: %w", err)
	}

	res := &Result{
		OldSnapshot:    oldSnapshot,
		NewSnapshot:    newSnapshot,
		OldSnapshotSHA: sha(oldSnapshot),
		NewSnapshotSHA: sha(newSnapshot),
	}

	if oldSnapshot == newSnapshot {
		res.Changed = false
		return res, nil
	}

	res.Changed = true

	version := opts.NowUTC().Format("20060102150405")
	nameSan := sanitizeName(opts.Name)
	if nameSan == "" {
		return nil, fmt.Errorf("invalid name %q", opts.Name)
	}
	res.Version = version
	res.NameSanitized = nameSan
	res.TableChanges = DiffTableChanges(oldSnapshot, newSnapshot)

	upFile := fmt.Sprintf("%s_%s.up.sql", version, nameSan)
	downFile := fmt.Sprintf("%s_%s.down.sql", version, nameSan)
	upPath := filepath.Join(opts.MigrationsDir, upFile)
	downPath := filepath.Join(opts.MigrationsDir, downFile)

	upSQL, err := genMigrationSQL(oldSnapshot, newSnapshot, version, nameSan, true)
	if err != nil {
		return nil, fmt.Errorf("generate up migration: %w", err)
	}
	downSQL, err := genMigrationSQL(newSnapshot, oldSnapshot, version, nameSan, false)
	if err != nil {
		return nil, fmt.Errorf("generate down migration: %w", err)
	}

	if err := os.MkdirAll(opts.MigrationsDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir migrations dir: %w", err)
	}

	// Safety: do not overwrite existing files.
	if exists(upPath) || exists(downPath) {
		return nil, fmt.Errorf("migration file already exists: %s or %s", upPath, downPath)
	}

	if err := os.WriteFile(upPath, []byte(upSQL), 0o644); err != nil {
		return nil, fmt.Errorf("write up migration: %w", err)
	}
	if err := os.WriteFile(downPath, []byte(downSQL), 0o644); err != nil {
		return nil, fmt.Errorf("write down migration: %w", err)
	}

	// Update snapshot only after both files are successfully written.
	if err := os.WriteFile(baselinePath, []byte(newSnapshot), 0o644); err != nil {
		return nil, fmt.Errorf("update baseline snapshot: %w", err)
	}

	res.UpPath = upPath
	res.DownPath = downPath
	return res, nil
}

func withDefaults(opts Options) Options {
	if opts.DocsDir == "" {
		opts.DocsDir = filepath.FromSlash("serve/docs")
	}
	if opts.MigrationsDir == "" {
		opts.MigrationsDir = filepath.FromSlash("db/migrations")
	}
	if opts.NowUTC == nil {
		opts.NowUTC = func() time.Time { return time.Now().UTC() }
	}
	return opts
}

func validate(opts Options) error {
	if strings.TrimSpace(opts.Name) == "" {
		return errors.New("name is required")
	}
	return nil
}

func readMergeOrder(mergeShPath string) ([]string, error) {
	b, err := os.ReadFile(mergeShPath)
	if err != nil {
		return nil, err
	}
	matches := ddlFileRe.FindAllString(string(b), -1)
	// Keep order, de-dup defensively.
	seen := map[string]bool{}
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	return out, nil
}

func mergeDDL(docsDir string, ddlOrder []string) (string, error) {
	var buf bytes.Buffer
	for i, rel := range ddlOrder {
		p := filepath.Join(docsDir, filepath.FromSlash(rel))
		b, err := os.ReadFile(p)
		if err != nil {
			return "", fmt.Errorf("read %s: %w", p, err)
		}
		// Keep exactly one blank line between files, matching merge.sh (awk prints empty line between files).
		if i > 0 {
			buf.WriteByte('\n')
		}
		buf.Write(bytes.TrimRight(b, "\n"))
		buf.WriteByte('\n')
		buf.WriteByte('\n')
	}
	merged := buf.String()
	// Ensure file ends with newline.
	if !strings.HasSuffix(merged, "\n") {
		merged += "\n"
	}
	return merged, nil
}

func readFileIfExists(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	// Normalize to LF to avoid accidental diffs on Windows edits.
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	if !strings.HasSuffix(s, "\n") {
		s += "\n"
	}
	return s, nil
}

func genMigrationSQL(fromSnapshot, toSnapshot, version, name string, isUp bool) (string, error) {
	fromTables, fromOrder := extractCreateTables(fromSnapshot)
	toTables, toOrder := extractCreateTables(toSnapshot)

	// Determine change sets.
	removed := make([]string, 0)
	added := make([]string, 0)
	changed := make([]string, 0)

	for tbl := range fromTables {
		if _, ok := toTables[tbl]; !ok {
			removed = append(removed, tbl)
		}
	}
	for tbl := range toTables {
		if _, ok := fromTables[tbl]; !ok {
			added = append(added, tbl)
		} else if normalizeSQL(fromTables[tbl]) != normalizeSQL(toTables[tbl]) {
			changed = append(changed, tbl)
		}
	}

	// Stabilize order: removed by from order; added/changed by to order.
	removed = orderBy(removed, fromOrder)
	added = orderBy(added, toOrder)
	changed = orderBy(changed, toOrder)

	var b strings.Builder
	dir := "Up"
	if !isUp {
		dir = "Down"
	}

	b.WriteString("-- Auto-generated by migrate-gen\n")
	b.WriteString(fmt.Sprintf("-- version: %s\n", version))
	b.WriteString(fmt.Sprintf("-- name: %s\n", name))
	b.WriteString(fmt.Sprintf("-- direction: %s\n", dir))
	b.WriteString(fmt.Sprintf("-- from_sha256: %s\n", sha(fromSnapshot)))
	b.WriteString(fmt.Sprintf("-- to_sha256: %s\n", sha(toSnapshot)))
	b.WriteString("\n")

	// Minimal, deterministic, file-to-file schema reconciliation.
	// NOTE: This strategy is destructive for changed tables (drop & recreate).
	b.WriteString("SET FOREIGN_KEY_CHECKS=0;\n\n")

	for _, tbl := range removed {
		b.WriteString(fmt.Sprintf("DROP TABLE IF EXISTS %s;\n", quoteIdent(tbl)))
	}
	if len(removed) > 0 {
		b.WriteString("\n")
	}

	for _, tbl := range changed {
		b.WriteString(fmt.Sprintf("DROP TABLE IF EXISTS %s;\n", quoteIdent(tbl)))
		stmt := strings.TrimSpace(toTables[tbl])
		if !strings.HasSuffix(stmt, ";") {
			stmt += ";"
		}
		b.WriteString(stmt)
		b.WriteString("\n\n")
	}

	for _, tbl := range added {
		stmt := strings.TrimSpace(toTables[tbl])
		if !strings.HasSuffix(stmt, ";") {
			stmt += ";"
		}
		b.WriteString(stmt)
		b.WriteString("\n\n")
	}

	b.WriteString("SET FOREIGN_KEY_CHECKS=1;\n")
	return b.String(), nil
}

// extractCreateTables finds CREATE TABLE statements and returns a map[name]stmt plus an ordered list of names.
// It is intentionally simple and tailored to this repo's DDL style.
func extractCreateTables(snapshot string) (map[string]string, []string) {
	// Match "CREATE TABLE" ... "<name>" and take until the next semicolon.
	// Supports optional IF NOT EXISTS and optional backticks.
	// NOTE: Go regexp (RE2) does not support backreferences like \1, so we match backticked/non-backticked via alternation.
	re := regexp.MustCompile(`(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:` + "`" + `([^` + "`" + `]+)` + "`" + `|([A-Za-z0-9_]+))\s*\(`)

	m := map[string]string{}
	order := make([]string, 0)

	locs := re.FindAllStringSubmatchIndex(snapshot, -1)
	seen := map[string]bool{}

	for _, loc := range locs {
		// Submatch indices:
		// 0..1 full match, then groups: (backticked_name) or (plain_name)
		name := ""
		// group 1: backticked name
		if loc[2] != -1 && loc[3] != -1 {
			name = snapshot[loc[2]:loc[3]]
		} else if loc[4] != -1 && loc[5] != -1 {
			// group 2: plain name
			name = snapshot[loc[4]:loc[5]]
		}
		if name == "" {
			continue
		}

		start := loc[0]
		// Statement ends at the next semicolon after start.
		end := strings.Index(snapshot[start:], ";")
		if end < 0 {
			continue
		}
		stmt := strings.TrimSpace(snapshot[start : start+end+1])

		m[name] = stmt
		if !seen[name] {
			seen[name] = true
			order = append(order, name)
		}
	}
	return m, order
}

func orderBy(names []string, order []string) []string {
	if len(names) == 0 {
		return names
	}
	pos := map[string]int{}
	for i, n := range order {
		pos[n] = i
	}
	sort.SliceStable(names, func(i, j int) bool {
		pi, okI := pos[names[i]]
		pj, okJ := pos[names[j]]
		if okI && okJ {
			return pi < pj
		}
		if okI != okJ {
			return okI // known first
		}
		return names[i] < names[j]
	})
	return names
}

func normalizeSQL(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.TrimSpace(s)
	// Collapse runs of whitespace to reduce noisy diffs.
	ws := regexp.MustCompile(`\s+`)
	s = ws.ReplaceAllString(s, " ")
	return strings.ToLower(s)
}

func sanitizeName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.ToLower(name)
	var b strings.Builder
	b.Grow(len(name))
	lastUnderscore := false
	for _, r := range name {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if ok {
			b.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if !lastUnderscore {
			b.WriteByte('_')
			lastUnderscore = true
		}
	}
	out := strings.Trim(b.String(), "_")
	return out
}

func quoteIdent(name string) string {
	// Use backticks for MySQL identifiers; escape any backticks just in case.
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func sha(s string) string {
	sum := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", sum[:])
}

func DiffTableChanges(fromSnapshot, toSnapshot string) []TableChange {
	fromTables, fromOrder := extractCreateTables(fromSnapshot)
	toTables, toOrder := extractCreateTables(toSnapshot)

	removed := make([]string, 0)
	added := make([]string, 0)
	changed := make([]string, 0)

	for tbl := range fromTables {
		if _, ok := toTables[tbl]; !ok {
			removed = append(removed, tbl)
		}
	}
	for tbl := range toTables {
		if _, ok := fromTables[tbl]; !ok {
			added = append(added, tbl)
		} else if normalizeSQL(fromTables[tbl]) != normalizeSQL(toTables[tbl]) {
			changed = append(changed, tbl)
		}
	}

	removed = orderBy(removed, fromOrder)
	added = orderBy(added, toOrder)
	changed = orderBy(changed, toOrder)

	out := make([]TableChange, 0, len(removed)+len(added)+len(changed))
	for _, t := range removed {
		out = append(out, TableChange{
			Table:      t,
			Type:       TableChangeRemoved,
			FromCreate: fromTables[t],
		})
	}
	for _, t := range changed {
		out = append(out, TableChange{
			Table:      t,
			Type:       TableChangeChanged,
			FromCreate: fromTables[t],
			ToCreate:   toTables[t],
		})
	}
	for _, t := range added {
		out = append(out, TableChange{
			Table:    t,
			Type:     TableChangeAdded,
			ToCreate: toTables[t],
		})
	}
	return out
}
