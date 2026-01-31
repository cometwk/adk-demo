package model

import (
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/queue"
)

var UserModel orm.EntityOps[db.User]
var SigninHistoryModel orm.EntityOps[db.SigninHistory]
var EventModel orm.EntityOps[db.Event]
var DictCatModel orm.EntityOps[db.DictCat]
var DictModel orm.EntityOps[db.Dict]
var OpsModel orm.EntityOps[db.Ops]
var TaskModel orm.EntityOps[db.Task]
var TaskInstModel orm.EntityOps[db.TaskInst]
var PropertyModel orm.EntityOps[PropertyEntity]
var JobQueueModel orm.EntityOps[queue.JobQueue]
var JobHistoryModel orm.EntityOps[queue.JobHistory]

func InitModels() {
	orm.MustLoadStructModel[db.User]()
	orm.MustLoadStructModel[db.SigninHistory]()
	orm.MustLoadStructModel[db.Event]()
	orm.MustLoadStructModel[db.DictCat]()
	orm.MustLoadStructModel[db.Dict]()
	orm.MustLoadStructModel[db.Ops]()
	orm.MustLoadStructModel[db.Task]()
	orm.MustLoadStructModel[db.TaskInst]()

	// kv参数表
	orm.MustLoadStructModel[PropertyEntity]()

	// job队列表
	orm.MustLoadStructModel[queue.JobQueue]()
	orm.MustLoadStructModel[queue.JobHistory]()

	//
	UserModel = orm.MustEntityOps[db.User]()
	SigninHistoryModel = orm.MustEntityOps[db.SigninHistory]()
	EventModel = orm.MustEntityOps[db.Event]()
	DictCatModel = orm.MustEntityOps[db.DictCat]()
	DictModel = orm.MustEntityOps[db.Dict]()
	OpsModel = orm.MustEntityOps[db.Ops]()
	TaskModel = orm.MustEntityOps[db.Task]()
	TaskInstModel = orm.MustEntityOps[db.TaskInst]()
	PropertyModel = orm.MustEntityOps[PropertyEntity]()
	JobQueueModel = orm.MustEntityOps[queue.JobQueue]()
	JobHistoryModel = orm.MustEntityOps[queue.JobHistory]()
}
