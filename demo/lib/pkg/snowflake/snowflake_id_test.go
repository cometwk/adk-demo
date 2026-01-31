package snowflake

import (
	"fmt"
	"math/rand"
	"testing"
	"time"
)

func TestGenerateFixID(t *testing.T) {
	// 固定输入：时间 + seq + nodeID => 固定可复现的 ID
	wantT := time.Date(2026, 1, 11, 12, 34, 56, 789*1000000, time.UTC)
	wantSeq := int64(123)
	wantNode := int64(7)

	id, err := SnowflakeIdFixed(wantT, wantSeq, wantNode)
	if err != nil {
		t.Fatalf("SnowflakeIdFixed error: %v", err)
	}

	// 1) 反算时间（到毫秒）必须一致
	gotT := IdDatetime(id)
	if gotT.UnixMilli() != wantT.UnixMilli() {
		t.Fatalf("time mismatch: got=%s (%d) want=%s (%d)",
			gotT.UTC().Format(time.RFC3339Nano), gotT.UnixMilli(),
			wantT.UTC().Format(time.RFC3339Nano), wantT.UnixMilli(),
		)
	}

	// 2) 反算 node/seq 必须一致（按当前 NodeBits/StepBits）
	stepMask := int64(-1 ^ (-1 << StepBits))
	nodeMask := (int64(-1^(-1<<NodeBits)) << StepBits)

	gotSeq := int64(id) & stepMask
	gotNode := (int64(id) & nodeMask) >> StepBits

	if gotSeq != wantSeq {
		t.Fatalf("seq mismatch: got=%d want=%d", gotSeq, wantSeq)
	}
	if gotNode != wantNode {
		t.Fatalf("node mismatch: got=%d want=%d", gotNode, wantNode)
	}

	fmt.Printf("fixed: t=%s node=%d seq=%d id=%d\n", wantT.Format(time.RFC3339Nano), wantNode, wantSeq, id)

	t1 := time.Unix(Epoch/1000, (Epoch%1000)*1000000)
	t1 = t1.Add(1024 * time.Millisecond)
	id = MustSnowflakeIdFixed(t1, 0, 0)
	fmt.Printf("id=%d\n", id)
}

func Test0(t *testing.T) {
	for i := 0; i <= 24; i++ {
		id := SnowflakeId()
		time.Sleep(time.Duration(rand.Intn(1000)) * time.Millisecond)
		generatedTime := IdDatetime(id)
		str1 := generatedTime.Format("2006-01-02")
		str2 := generatedTime.UTC().Format("2006-01-02")
		// generatedTime.UnixMilli()
		fmt.Printf("--- %d -------------------------------------\n", id)
		fmt.Printf("str1: %s, str2: %s,  %v\n", str1, str2, generatedTime.UnixMilli())
	}
}

func Test00(t *testing.T) {
	now := time.Now()
	fmt.Printf("now: %v\n", now.Truncate(24*time.Hour))
	fmt.Printf("now: %v\n", DateOnlyLocal(now))
	fmt.Printf("now: %v\n", DateOnlyLocal(now).UTC())

}

func Test1(t *testing.T) {
	now := time.Now()
	for i := 0; i <= 24; i++ {
		generatedTime := now.Add(time.Hour * time.Duration(i))
		str1 := generatedTime.Format("2006-01-02")
		str2 := generatedTime.UTC().Format("2006-01-02")
		fmt.Printf("--- %d -------------------------------------\n", i)
		fmt.Printf("%v\n%v\n", generatedTime, generatedTime.UTC())
		fmt.Printf("str1: %s, str2: %s\n", str1, str2)
	}
}

func Test2(t *testing.T) {
	now := time.Now()
	for i := 0; i <= 24; i++ {
		s1 := now.Add(time.Hour * time.Duration(i))
		s2 := DateOnlyUTC(s1)
		fmt.Printf("--- %d -------------------------------------\n", i)
		fmt.Printf("%v\n%v\n", s1, s2)
		fmt.Printf("str1: %s, str2: %s\n", s1.Format("2006-01-02"), s2.Format("2006-01-02"))
	}
}

func TestIDCreatedAt(t *testing.T) {
	node, err := NewNode(1)
	if err != nil {
		t.Fatalf("创建 Node 失败: %v", err)
	}

	generatedTime := time.Now()
	id := node.Generate()
	createdAt := IdDatetime(id.Int64())
	generatedTime = DateOnlyUTC(generatedTime)

	// 比较生成时间与从 ID 中提取的时间，允许一定的误差
	// 因为时间戳在雪花 ID 中是以毫秒为单位存储的，所以误差应在毫秒级别
	diff := generatedTime.Sub(createdAt)
	if diff < 0 {
		diff = -diff
	}

	if diff > 10*time.Millisecond { // 允许 10 毫秒的误差
		t.Errorf("IdCreatedAt 返回的时间与生成时间相差过大. Generated: %v, Extracted: %v, Diff: %v", generatedTime, createdAt, diff)
	}
}

// 确保 IdCreatedAt 对于一个固定ID返回固定时间
func TestIDCreatedAtConsistency(t *testing.T) {
	// 这是一个在 2025年12月8日星期一 某个时间点生成的雪花ID的示例
	// 假设 NodeBits=10, StepBits=12, Epoch=1288834974657
	// 这个值是为了测试方便，实际ID应该通过 NewNode().Generate() 获得
	// 具体值可以根据实际 Epoch, timeShift, NodeShift, StepMask, NodeMask 计算
	// 简化测试，直接使用一个已知时间戳计算的ID
	knownID := int64(1469116170669299712) // 这是一个示例 ID，对应的时间是 2025-12-08T12:00:00.000Z 左右

	// 计算预期的创建时间
	expectedMs := (knownID >> timeShift) + Epoch
	expectedTime := time.Unix(expectedMs/1000, (expectedMs%1000)*1000000)

	createdAt := IdDatetime(knownID)
	expectedTime = DateOnlyUTC(expectedTime)

	// 再次允许一些毫秒的误差
	diff := expectedTime.Sub(createdAt)
	if diff < 0 {
		diff = -diff
	}

	if diff > time.Millisecond {
		t.Errorf("IdCreatedAt Consistency 失败. Expected: %v, Got: %v, Diff: %v", expectedTime, createdAt, diff)
	}
}
