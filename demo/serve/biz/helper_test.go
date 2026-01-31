package biz

import (
	"fmt"
	"testing"
	"time"
)

type fakeIdGenerator struct {
	next int64
}

func (g *fakeIdGenerator) GetNextId() int64 {
	g.next++
	return g.next
}

func TestGenerateMerchNo(t *testing.T) {
	idGenerator = &fakeIdGenerator{next: 0}

	t.Run("生成序列号", func(t *testing.T) {
		got := GenerateNo()
		want := "X0000000001"
		if got != want {
			t.Fatalf("got=%s want=%s", got, want)
		}
	})

}

func Test_createdAtRangeAroundUTC(t *testing.T) {
	cst := time.FixedZone("CST", 8*3600)
	createdAt := time.Date(2025, 12, 10, 10, 0, 0, 0, cst) // 2025-12-10 02:00:00Z

	start, end := createdAtRangeAroundUTC(createdAt)
	wantStart := createdAt.UTC().Add(-24 * time.Hour)
	wantEnd := createdAt.UTC().Add(24 * time.Hour)
	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("start=%v end=%v wantStart=%v wantEnd=%v", start, end, wantStart, wantEnd)
	}
	fmt.Printf("local=%v\nUTC  =%v\n", createdAt.Local(), createdAt.UTC())
	fmt.Printf("start=%v end=%v\n", start, end)
	fmt.Printf("wantStart=%v wantEnd=%v\n", wantStart, wantEnd)
	fmt.Printf("wantStartLocal=%v wantEndLocal=%v\n", wantStart.Local(), wantEnd.Local())
}

func Test_localDayRangeUTC_CST(t *testing.T) {
	oldLocal := time.Local
	defer func() { time.Local = oldLocal }()

	time.Local = time.FixedZone("CST", 8*3600)
	nowLocal := time.Date(2025, 12, 10, 10, 0, 0, 0, time.Local)

	start, end := localDayRangeUTC(nowLocal)
	// 2025-12-10 00:00:00 CST == 2025-12-09 16:00:00 UTC
	wantStart := time.Date(2025, 12, 9, 16, 0, 0, 0, time.UTC)
	wantEnd := wantStart.Add(24 * time.Hour)
	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("start=%v end=%v wantStart=%v wantEnd=%v", start, end, wantStart, wantEnd)
	}
	fmt.Printf("local=%v\nUTC  =%v\n", nowLocal.Local(), nowLocal.UTC())
	fmt.Printf("start=%v end=%v\n", start, end)
	fmt.Printf("wantStart=%v wantEnd=%v\n", wantStart, wantEnd)
	fmt.Printf("wantStartLocal=%v wantEndLocal=%v\n", wantStart.Local(), wantEnd.Local())
}

func Test_recent3DaysRangeUTC_CST(t *testing.T) {
	oldLocal := time.Local
	defer func() { time.Local = oldLocal }()

	time.Local = time.FixedZone("CST", 8*3600)
	nowLocal := time.Date(2025, 12, 10, 10, 0, 0, 0, time.Local)

	todayStartUTC, _ := localDayRangeUTC(nowLocal)
	start := todayStartUTC.Add(-2 * 24 * time.Hour)
	end := todayStartUTC.Add(24 * time.Hour)

	wantTodayStartUTC := time.Date(2025, 12, 9, 16, 0, 0, 0, time.UTC)
	wantStart := wantTodayStartUTC.Add(-48 * time.Hour)
	wantEnd := wantTodayStartUTC.Add(24 * time.Hour)

	if !start.Equal(wantStart) || !end.Equal(wantEnd) {
		t.Fatalf("start=%v end=%v wantStart=%v wantEnd=%v", start, end, wantStart, wantEnd)
	}
}
