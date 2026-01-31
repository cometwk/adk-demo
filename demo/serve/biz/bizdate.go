package biz

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// BizDate represents a business date (MySQL DATE) in YYYY-MM-DD form.
//
// Background:
// - Project convention: DATE fields represent business dates (not timepoints) and map to string.
// - With MySQL DSN parseTime=true, DATE often scans as time.Time. Scanning that into a plain string
//   produces "YYYY-MM-DD 00:00:00 +0000 UTC", which violates the convention.
//
// BizDate implements sql.Scanner + driver.Valuer to keep DATE stable as "YYYY-MM-DD".
type BizDate string

func (d BizDate) String() string { return string(d) }

func (d BizDate) Value() (driver.Value, error) {
	// Stored as DATE; passing string is fine and keeps it unambiguous.
	return string(d), nil
}

func (d *BizDate) Scan(src any) error {
	switch v := src.(type) {
	case time.Time:
		*d = BizDate(v.Format("2006-01-02"))
		return nil
	case []byte:
		s := string(v)
		if len(s) >= 10 {
			*d = BizDate(s[:10])
			return nil
		}
		return fmt.Errorf("BizDate: invalid DATE bytes %q", s)
	case string:
		if len(v) >= 10 {
			*d = BizDate(v[:10])
			return nil
		}
		return fmt.Errorf("BizDate: invalid DATE string %q", v)
	case nil:
		*d = ""
		return nil
	default:
		return fmt.Errorf("BizDate: unsupported scan type %T", src)
	}
}


