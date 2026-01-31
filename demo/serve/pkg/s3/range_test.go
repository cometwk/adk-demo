package s3

import "testing"

func Test_parseRange(t *testing.T) {
	t.Run("valid start-end", func(t *testing.T) {
		start, end, err := parseRange("bytes=0-9", 100)
		if err != nil {
			t.Fatalf("err=%v", err)
		}
		if start != 0 || end != 9 {
			t.Fatalf("start=%d end=%d", start, end)
		}
	})

	t.Run("valid open-ended", func(t *testing.T) {
		start, end, err := parseRange("bytes=10-", 100)
		if err != nil {
			t.Fatalf("err=%v", err)
		}
		if start != 10 || end != 99 {
			t.Fatalf("start=%d end=%d", start, end)
		}
	})

	t.Run("valid suffix", func(t *testing.T) {
		start, end, err := parseRange("bytes=-10", 100)
		if err != nil {
			t.Fatalf("err=%v", err)
		}
		if start != 90 || end != 99 {
			t.Fatalf("start=%d end=%d", start, end)
		}
	})

	t.Run("suffix larger than size clamps", func(t *testing.T) {
		start, end, err := parseRange("bytes=-200", 100)
		if err != nil {
			t.Fatalf("err=%v", err)
		}
		if start != 0 || end != 99 {
			t.Fatalf("start=%d end=%d", start, end)
		}
	})

	t.Run("end beyond size clamps", func(t *testing.T) {
		start, end, err := parseRange("bytes=90-200", 100)
		if err != nil {
			t.Fatalf("err=%v", err)
		}
		if start != 90 || end != 99 {
			t.Fatalf("start=%d end=%d", start, end)
		}
	})

	t.Run("invalid unit", func(t *testing.T) {
		_, _, err := parseRange("items=0-1", 100)
		if err == nil {
			t.Fatalf("expected err")
		}
	})

	t.Run("invalid multi-range", func(t *testing.T) {
		_, _, err := parseRange("bytes=0-1,2-3", 100)
		if err == nil {
			t.Fatalf("expected err")
		}
	})

	t.Run("invalid start >= size", func(t *testing.T) {
		_, _, err := parseRange("bytes=100-101", 100)
		if err == nil {
			t.Fatalf("expected err")
		}
	})

	t.Run("invalid end < start", func(t *testing.T) {
		_, _, err := parseRange("bytes=10-9", 100)
		if err == nil {
			t.Fatalf("expected err")
		}
	})

	t.Run("invalid suffix zero", func(t *testing.T) {
		_, _, err := parseRange("bytes=-0", 100)
		if err == nil {
			t.Fatalf("expected err")
		}
	})
}
