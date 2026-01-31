package biz

import (
	"github.com/cometwk/base/util"
	"github.com/cometwk/lib/pkg/orm"
)

var FileBlobModel orm.EntityOps[FileBlob]
var PKeyModel orm.EntityOps[PKey]

func InitDB() {
	idGenerator = util.NewIdGenerator(orm.MustDB())

	orm.MustLoadStructModel[PKey]()
	orm.MustLoadStructModel[FileBlob]()

	PKeyModel = orm.MustEntityOps[PKey]()
	FileBlobModel = orm.MustEntityOps[FileBlob]()

}
