package db

import "time"

// 以当前时间区域解析外部传入的日期
func ParseDate(date string) (time.Time, error) {
	return time.ParseInLocation("2006/01/02", date, time.Local)
}
