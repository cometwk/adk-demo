package testutil

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"xorm.io/xorm"
)

type Demo1 struct {
	ID         string         `xorm:"'id' varchar(64) pk" json:"id"`             // 主键
	StrField   string         `xorm:"'str_field' varchar(255)" json:"str_field"` // 字符串
	IntField   int            `xorm:"'int_field' int" json:"int_field"`          // 整数
	Int64Field int64          `xorm:"'int64_field' bigint" json:"int64_field"`   // 64位整数
	FloatField float64        `xorm:"'float_field' double" json:"float_field"`   // 浮点数
	BoolField  bool           `xorm:"'bool_field' bool" json:"bool_field"`       // 布尔值
	TimeField  time.Time      `xorm:"'time_field' datetime" json:"time_field"`   // 时间
	DateField  time.Time      `xorm:"'date_field' date" json:"date_field"`       // 日期
	TextField  string         `xorm:"'text_field' text" json:"text_field"`       // 文本
	BlobField  []byte         `xorm:"'blob_field' blob" json:"blob_field"`       // 二进制数据
	JsonField  map[string]any `xorm:"'json_field' json" json:"json_field"`       // JSON 字段（仅适用于支持 JSON 的数据库）
	CreatedAt  time.Time      `xorm:"'created_at' created" json:"created_at"`    // 创建时间
	UpdatedAt  time.Time      `xorm:"'updated_at' updated" json:"updated_at"`    // 更新时间
}

func (Demo1) TableName() string {
	return "demo1"
}

var Demo1Data = []Demo1{
	{ID: "test1", StrField: "测试1", IntField: 1, Int64Field: 1, FloatField: 1, BoolField: true, TimeField: time.Now(), DateField: time.Now(), TextField: "测试1", BlobField: []byte("测试1"), JsonField: map[string]any{"key": "value"}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	{ID: "test2", StrField: "测试2", IntField: 2, Int64Field: 2, FloatField: 2, BoolField: true, TimeField: time.Now(), DateField: time.Now(), TextField: "测试2", BlobField: []byte("测试2"), JsonField: map[string]any{"key": "value"}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	{ID: "test3", StrField: "测试3", IntField: 3, Int64Field: 3, FloatField: 3, BoolField: true, TimeField: time.Now(), DateField: time.Now(), TextField: "测试3", BlobField: []byte("测试3"), JsonField: map[string]any{"key": "value"}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
}

// 准备测试数据的辅助函数
func PrepareDemo1(t *testing.T, db *xorm.Session) []Demo1 {
	_, err := db.Exec("DELETE FROM demo1")
	assert.NoError(t, err, "清理初始数据失败")

	for _, data := range Demo1Data {
		_, err := db.Insert(&data)
		assert.NoError(t, err, "插入测试数据失败")
	}

	return Demo1Data
}
