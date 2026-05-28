package db

// 数据字典分类
type DictCat struct {
	Cat     string `json:"cat"     xorm:"varchar(36) pk notnull comment('分类KEY')"`
	Label   string `json:"label"   xorm:"varchar(64) notnull comment('分类名称')"`
	Remark  string `json:"remark"  xorm:"varchar(256) default '' comment('备注')"`
	Builtin bool   `json:"builtin" xorm:"boolean notnull default false comment('是否系统内置')"`
}

func (DictCat) TableName() string {
	return "dict_cats"
}

// 数据字典条目
type Dict struct {
	Cat     string `json:"cat"     xorm:"varchar(36) unique(cat_val) notnull comment('分类')"`
	Value   string `json:"value"   xorm:"varchar(256) unique(cat_val) notnull default '' comment('值')"`
	Label   string `json:"label"   xorm:"varchar(64) notnull comment('显示名称')"`
	Code    string `json:"code"    xorm:"varchar(256) default '' comment('编码')"`
	Seqno   string `json:"seqno"   xorm:"varchar(64) default '' comment('排序')"`
	Remark  string `json:"remark"  xorm:"varchar(256) default '' comment('备注')"`
	Builtin bool   `json:"builtin" xorm:"boolean notnull default false comment('内置不能修改')"`
	Parent  string `json:"parent"  xorm:"varchar(36) default '' comment('Tree 结构')"`
	UUID    string `json:"uuid"    xorm:"varchar(36) pk notnull comment('主键')"`
}

func (Dict) TableName() string {
	return "dicts"
}
