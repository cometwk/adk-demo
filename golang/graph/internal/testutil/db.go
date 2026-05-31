package testutil

import (
	"testing"

	_ "github.com/mattn/go-sqlite3"
	"xorm.io/xorm"
)

// SetupGraphTestDB 创建内存 SQLite 并同步 graph 示例域三张表。
func SetupGraphTestDB(t *testing.T) *xorm.Engine {
	t.Helper()
	engine, err := xorm.NewEngine("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("new engine: %v", err)
	}
	if err := engine.Sync2(
		new(agentRelRow),
		new(merchRow),
		new(orderDailyRow),
	); err != nil {
		t.Fatalf("sync: %v", err)
	}
	return engine
}

// agentRelRow 为 graph 示例域测试表（含 merch_id 以匹配 for_merch 关系定义）。
type agentRelRow struct {
	ID      int64 `xorm:"pk autoincr 'id'"`
	MerchID int64 `xorm:"'merch_id'"`
	Apply   int   `xorm:"'apply'"`
	AgentNo string `xorm:"'agent_no'"`
	ObjNo   string `xorm:"'obj_no'"`
	ObjName string `xorm:"'obj_name'"`
}

func (agentRelRow) TableName() string { return "agent_rel" }

type merchRow struct {
	ID int64 `xorm:"pk autoincr 'id'"`
}

func (merchRow) TableName() string { return "merch" }

type orderDailyRow struct {
	ID         int64  `xorm:"pk autoincr 'id'"`
	MerchID    int64  `xorm:"'merch_id'"`
	ReportDate string `xorm:"'report_date'"`
}

func (orderDailyRow) TableName() string { return "order_daily" }
