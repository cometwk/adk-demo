package biz

import (
	"fmt"
	"time"

	base "github.com/cometwk/base/util"
	"github.com/cometwk/lib/pkg/snowflake"
	"xorm.io/xorm"
)

var idGenerator base.IdGenerator

func GenerateNo() string {
	id := idGenerator.GetNextId()
	return fmt.Sprintf("X%010d", id)
}

// createdAtRangeAroundUTC 返回围绕某个 created_at 的查询范围（左闭右开）：
// [created_at-24hours, created_at+24hours)
func createdAtRangeAroundUTC(createdAt time.Time) (startTime, endTime time.Time) {
	t := createdAt.UTC()
	return t.Add(-24 * time.Hour), t.Add(24 * time.Hour)
}

// localDayRangeUTC 按“本地日界”划分当天范围，但返回用于数据库查询的 UTC 时间戳范围（左闭右开）：
// [local 00:00, local 00:00 + 24h)  -->  [startUTC, endUTC)
func localDayRangeUTC(now time.Time) (startUTC, endUTC time.Time) {
	lt := now.In(time.Local)
	y, m, d := lt.Date()
	localStart := time.Date(y, m, d, 0, 0, 0, 0, time.Local)
	startUTC = localStart.UTC()
	endUTC = startUTC.Add(24 * time.Hour)
	return startUTC, endUTC
}

// LocalDayRangeUTC 按“本地日界”划分当天范围，但返回用于数据库查询的 UTC 时间戳范围（左闭右开）：
// [local 00:00, local 00:00 + 24h)  -->  [startUTC, endUTC)
//
// 说明：提供给跨 package（如 profit）复用，避免重复实现。
func LocalDayRangeUTC(now time.Time) (startUTC, endUTC time.Time) {
	return localDayRangeUTC(now)
}

// 考虑到 orders 表分区，根据 created_at 范围查询（左闭右开）: [created_at-24hours, created_at+24hours)
func WhereCreatedAt(session *xorm.Session, created_at time.Time) *xorm.Session {
	startTime, endTime := createdAtRangeAroundUTC(created_at)
	session.Where("created_at >= ? AND created_at < ?", startTime, endTime)
	return session
}

// 根据创建时间范围和ID查询（左闭右开）: [created_at-24hours, created_at+24hours) AND id = ID
func WhereCreatedAtID(session *xorm.Session, created_at time.Time, ID int64) *xorm.Session {
	startTime, endTime := createdAtRangeAroundUTC(created_at)
	session.Where("created_at >= ? AND created_at < ?", startTime, endTime).And("id = ?", ID)
	return session
}

// 根据ID和ID内部的时间范围查询
func WhereCreatedAtByID(session *xorm.Session, ID int64) *xorm.Session {
	created_at := snowflake.IdDatetime(ID)
	return WhereCreatedAtID(session, created_at, ID)
}

// 限制访问“本地当天”的数据（左闭右开）：
// [local today 00:00, local tomorrow 00:00)  -->  转成 UTC 作为 created_at 查询条件
func WhereCreatedAtToday(session *xorm.Session) *xorm.Session {
	startTime, endTime := localDayRangeUTC(time.Now())
	session.Where("created_at >= ? AND created_at < ?", startTime, endTime)
	return session
}

// 最近三天（按本地日界，左闭右开）：
// [local today-2days 00:00, local tomorrow 00:00)  -->  转成 UTC 作为 created_at 查询条件
func WhereCreatedAtRecent3Days(session *xorm.Session) *xorm.Session {
	todayStartUTC, _ := localDayRangeUTC(time.Now())
	startTime := todayStartUTC.Add(-2 * 24 * time.Hour)
	endTime := todayStartUTC.Add(24 * time.Hour)
	session.Where("created_at >= ? AND created_at < ?", startTime, endTime)
	return session
}
