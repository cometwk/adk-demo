package db_test

import (
	"fmt"
	"testing"
	"time"
)

func TestUTCDate(t *testing.T) {
	// 假设前端传递的时间是本地时间字符串
	localStart := "2025-01-01 00:00:00"
	localEnd := "2025-01-02 00:00:00"

	// 本地时区为 Asia/Shanghai
	loc, _ := time.LoadLocation("Asia/Shanghai")
	startTime, _ := time.ParseInLocation("2006-01-02 15:04:05", localStart, loc)
	endTime, _ := time.ParseInLocation("2006-01-02 15:04:05", localEnd, loc)

	// 转换为 UTC 时间
	startTimeUTC := startTime.UTC()
	endTimeUTC := endTime.UTC()

	// 格式化为 SQL 查询可以使用的字符串
	fmt.Println(startTimeUTC.Format("2006-01-02 15:04:05"))
	fmt.Println(endTimeUTC.Format("2006-01-02 15:04:05"))
}
