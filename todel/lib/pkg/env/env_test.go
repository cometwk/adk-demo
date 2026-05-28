package env

import (
	"testing"
)

func TestGetString(t *testing.T) {
	t.Run("存在的环境变量", func(t *testing.T) {
		t.Logf("OPENAI_API_BASE: %s\n", MustString("OPENAI_API_BASE"))
	})

}
