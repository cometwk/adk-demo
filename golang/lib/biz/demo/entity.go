package demo

import "time"

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
