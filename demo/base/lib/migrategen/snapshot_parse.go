package migrategen

import (
	"os"
	"regexp"
	"strings"
)

// ParseSnapshotTables extracts CREATE TABLE statements from a merged snapshot like serve/docs/table.sql.
// It is intentionally simple and tailored to this repo's DDL style.
func ParseSnapshotTables(snapshot string) map[string]string {
	// Match "CREATE TABLE" ... "<name>" and take until the next semicolon.
	// Supports optional IF NOT EXISTS and optional backticks.
	re := regexp.MustCompile(`(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:` + "`" + `([^` + "`" + `]+)` + "`" + `|([A-Za-z0-9_]+))\s*\(`)

	m := map[string]string{}
	locs := re.FindAllStringSubmatchIndex(snapshot, -1)
	for _, loc := range locs {
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
		end := strings.Index(snapshot[start:], ";")
		if end < 0 {
			continue
		}
		stmt := strings.TrimSpace(snapshot[start : start+end+1])
		m[name] = stmt
	}
	return m
}

func ReadSnapshotFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	s := strings.ReplaceAll(string(b), "\r\n", "\n")
	if !strings.HasSuffix(s, "\n") {
		s += "\n"
	}
	return s, nil
}


