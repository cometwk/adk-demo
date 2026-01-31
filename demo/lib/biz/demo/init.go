package demo

import (
	"github.com/cometwk/lib/pkg/orm"
	"xorm.io/xorm"
)

func Init(engine *xorm.Engine) {
	// engine.Sync2(new(Demo1))
	orm.MustLoadStructModel[Demo1]()
	// bean.RegisterCrudBean[Demo1]("demo1", "demo test 1", "demo test 1")

	// beans.RegisterFetchBean("fetch", "http fetch", "http fetch request", nil)
}
