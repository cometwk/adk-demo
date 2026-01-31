package bind

import (
	"time"
)

// 以当前时间区域解析外部传入的日期
func parseDate(date string) (time.Time, error) {
	return time.ParseInLocation("2006/01/02", date, time.Local)
}

type QueryDate time.Time

func (t *QueryDate) UnmarshalParam(src string) error {
	if len(src) == 0 {
		return nil
	}
	a, err := parseDate(src)
	if err != nil {
		return err
	}
	*t = QueryDate(a)
	return nil
}
