package s3

import (
	"io"
	"strings"
)

func buildContentDisposition(dispositionType, filename string) string {
	name := sanitizeFilename(filename)
	if name == "" {
		name = "file"
	}
	// minimal, safe header value; avoids CRLF injection
	return dispositionType + `; filename="` + name + `"`
}

func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	s = strings.ReplaceAll(s, `"`, `'`)
	return s
}

func ioLimitReader(r io.Reader, n int64) io.Reader {
	return io.LimitReader(r, n)
}

