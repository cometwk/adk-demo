package env

import (
	"os"
	"strings"
	"testing"
)

func withClearedEnv(keys []string, fn func()) {
	saved := make(map[string]string, len(keys))
	for _, k := range keys {
		saved[k] = os.Getenv(k)
		os.Unsetenv(k)
	}
	defer func() {
		for _, k := range keys {
			os.Setenv(k, saved[k])
		}
	}()
	fn()
}

func assertPanicContains(t *testing.T, wantSubstrings []string, fn func()) {
	t.Helper()
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic, got none")
		}
		msg, ok := r.(string)
		if !ok {
			t.Fatalf("expected string panic, got %T: %v", r, r)
		}
		for _, s := range wantSubstrings {
			if !strings.Contains(msg, s) {
				t.Errorf("panic message missing %q\ngot: %s", s, msg)
			}
		}
	}()
	fn()
}

func TestMustOpenAIConfig_AllMissing(t *testing.T) {
	keys := []string{"OPENAI_API_BASE", "OPENAI_API_KEY", "OPENAI_MODEL"}
	withClearedEnv(keys, func() {
		assertPanicContains(t, keys, func() {
			mustOpenAIConfig(true)
		})
	})
}

func TestMustOpenAIConfig_OnlyModelMissing(t *testing.T) {
	keys := []string{"OPENAI_API_BASE", "OPENAI_API_KEY", "OPENAI_MODEL"}
	withClearedEnv(keys, func() {
		os.Setenv("OPENAI_API_BASE", "http://localhost")
		os.Setenv("OPENAI_API_KEY", "test-key")

		assertPanicContains(t, []string{"OPENAI_MODEL"}, func() {
			mustOpenAIConfig(true)
		})
	})
}

func TestMustOpenAIConfig_ModelNotRequired(t *testing.T) {
	keys := []string{"OPENAI_API_BASE", "OPENAI_API_KEY", "OPENAI_MODEL"}
	withClearedEnv(keys, func() {
		os.Setenv("OPENAI_API_BASE", "http://localhost")
		os.Setenv("OPENAI_API_KEY", "test-key")

		base, key, model := mustOpenAIConfig(false)
		if base != "http://localhost" {
			t.Errorf("base = %q, want %q", base, "http://localhost")
		}
		if key != "test-key" {
			t.Errorf("key = %q, want %q", key, "test-key")
		}
		if model != "" {
			t.Errorf("model = %q, want empty", model)
		}
	})
}
