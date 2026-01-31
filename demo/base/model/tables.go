package model

const ID_GENERATOR_NAME = "next.dbid"

type PropertyEntity struct {
	Name     string `xorm:"'name' pk varchar(64)"` // 主键
	Value    string `xorm:"'value' varchar(300)"`  // 值
	Revision int64  `xorm:"'revision' version"`    // 乐观锁版本号
}

func (p *PropertyEntity) TableName() string {
	return "property"
}
