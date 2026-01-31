package log

import (
	"testing"
)

func TestGetLogFiles(t *testing.T) {

	t.Run("GetLogFiles", func(t *testing.T) {
		files, err := GetLogFiles()
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("files: %v", files)
	})

	t.Run("CheckRequiredCommands", func(t *testing.T) {
		err := CheckRequiredCommands()
		if err != nil {
			t.Fatal(err)
		}
	})

	t.Run("SearchLog", func(t *testing.T) {
		qb := newBuilder()
		qb.Build(map[string]string{
			"q.level.eq": "debug",
			"q.file.eq":  "job.go",
		})
		result, err := SearchLog(qb, "/tmp/main.log")
		if err != nil {
			t.Fatal(err)
		}
		t.Logf("result: %v", result)
	})
}
