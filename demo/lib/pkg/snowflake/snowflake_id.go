package snowflake

import (
	"fmt"
	"time"

	"github.com/cometwk/lib/pkg/env"
)

var node *Node

// MYSQL PARTITION 采用雪花算法生成唯一ID
func SnowflakeId() int64 {
	return node.Generate().Int64()
}

// IdCreatedAt 根据 snowflake-id, 得到 created_at , 用于查询时命中分区
// CREATE TABLE IF NOT EXISTS `orders` (
//
//	id                BIGINT NOT NULL COMMENT '分布式雪花ID',
//	order_date        DATE NOT NULL COMMENT '分区字段, 跟雪花时间的本地时区一致',
//	PRIMARY KEY (id, created_at),
//
// )
//
// 特别注意，date 在数据库中存储是 UTC，但含义是本地时间
func IdDatetime(id int64) time.Time {
	ms := (id >> timeShift) + Epoch
	tt := time.Unix(ms/1000, (ms%1000)*1000000)
	return tt
}

// Snowflake 同时生成雪花ID和创建时间
func Snowflake() (int64, time.Time) {
	id := SnowflakeId()
	return id, IdDatetime(id)
}

// SnowflakeIdFixed 生成一个“固定可复现”的雪花ID：
// 按照 Node.Generate() 的拼接规则，将 (t - Epoch) 的毫秒数、nodeID、seq(step) 组合成 ID。
//
// 参数说明：
// - t: 期望写入 ID 的时间（精度到毫秒）
// - seq: 同一毫秒内的序列号（step），范围 [0, 2^StepBits-1]
// - nodeID: 节点ID，范围 [0, 2^NodeBits-1]
func SnowflakeIdFixed(t time.Time, seq int64, nodeID int64) (int64, error) {
	if NodeBits+StepBits > 22 {
		return 0, fmt.Errorf("invalid bits: NodeBits(%d)+StepBits(%d) must be <= 22", NodeBits, StepBits)
	}

	nodeMax := int64(-1 ^ (-1 << NodeBits))
	stepMask := int64(-1 ^ (-1 << StepBits))

	if nodeID < 0 || nodeID > nodeMax {
		return 0, fmt.Errorf("nodeID out of range: %d (want 0..%d)", nodeID, nodeMax)
	}
	if seq < 0 || seq > stepMask {
		return 0, fmt.Errorf("seq out of range: %d (want 0..%d)", seq, stepMask)
	}

	epochTime := time.Unix(Epoch/1000, (Epoch%1000)*1000000).UTC()
	now := t.UTC().Sub(epochTime).Milliseconds()
	if now < 0 {
		return 0, fmt.Errorf("time before epoch: t=%s epoch=%s", t.UTC().Format(time.RFC3339Nano), epochTime.Format(time.RFC3339Nano))
	}

	timeShiftLocal := uint8(NodeBits + StepBits)
	nodeShiftLocal := StepBits

	id := ID((now)<<timeShiftLocal |
		(nodeID << nodeShiftLocal) |
		(seq),
	)
	return id.Int64(), nil
}
func MustSnowflakeIdFixed(t time.Time, seq int64, nodeID int64) int64 {
	id, err := SnowflakeIdFixed(t, seq, nodeID)
	if err != nil {
		panic(err)
	}
	return id
}

// DateOnlyUTC 对待日期字段，数据库保存的是 UTC 时间，但是含义是本地时间
// 特别注意，下面的时间，看起来date 一样，但是对数据库来说，是不同的：
//
//	2025-12-10 00:00:00 +0000 UTC // 数据库中存储的是UTC
//	2025-12-10 00:00:00 +0800 CST // 含义是本地时间
func DateOnlyUTC(t time.Time) time.Time {
	lt := t.In(time.Local)
	y, m, d := lt.Date()
	tt := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return tt
}

func DateOnlyLocal(t time.Time) time.Time {
	lt := t.In(time.Local)
	y, m, d := lt.Date()
	tt := time.Date(y, m, d, 0, 0, 0, 0, time.Local)
	return tt
}

// func DateOnlyString(t time.Time) string {
// 	lt := t.In(time.Local)
// 	y, m, d := lt.Date()
// 	tt := time.Date(y, m, d, 0, 0, 0, 0, time.Local)

// 	return tt.Format("2006-01-02")
// }

func init() {
	// 集群ID
	HOST_ID := env.Int("HOST_ID", 1)
	var err error
	node, err = NewNode(int64(HOST_ID))
	if err != nil {
		panic(err)
	}
}
