package biz

import (
	"github.com/lucky-byte/lib/pkg/orm"
)

var AgentModel orm.EntityOps[Agent]
var AgentClosureModel orm.EntityOps[AgentClosure]
var AgentRelModel orm.EntityOps[AgentRel]
var ReaderModel orm.EntityOps[Reader]
var ApplyModel orm.EntityOps[Apply]
var ChanModel orm.EntityOps[Chan]
var ChanMerchModel orm.EntityOps[ChanMerch]
var MerchModel orm.EntityOps[Merch]
var OrderDailyModel orm.EntityOps[OrderDaily]
var PropsBranchModel orm.EntityOps[PropsBranch]
var ProfitDailyModel orm.EntityOps[ProfitDaily]
var ProfitSettleModel orm.EntityOps[ProfitSettle]
var AuthorModel orm.EntityOps[Author]
var BookModel orm.EntityOps[Book]
var LibBranchModel orm.EntityOps[Branch]
var CategoryModel orm.EntityOps[Category]
var SeriesModel orm.EntityOps[Series]

func InitDB() {
	// idGenerator = util.NewIdGenerator(orm.MustDB())

	orm.MustLoadStructModel[Agent]()
	orm.MustLoadStructModel[AgentClosure]()
	orm.MustLoadStructModel[AgentRel]()
	orm.MustLoadStructModel[Reader]()
	orm.MustLoadStructModel[Apply]()
	orm.MustLoadStructModel[Chan]()
	orm.MustLoadStructModel[ChanMerch]()
	orm.MustLoadStructModel[Merch]()
	orm.MustLoadStructModel[OrderDaily]()
	orm.MustLoadStructModel[PropsBranch]()
	orm.MustLoadStructModel[ProfitDaily]()
	orm.MustLoadStructModel[ProfitSettle]()
	orm.MustLoadStructModel[Author]()
	orm.MustLoadStructModel[Book]()
	orm.MustLoadStructModel[Branch]()
	orm.MustLoadStructModel[Category]()
	orm.MustLoadStructModel[Series]()

	AgentModel = orm.MustEntityOps[Agent]()
	AgentClosureModel = orm.MustEntityOps[AgentClosure]()
	AgentRelModel = orm.MustEntityOps[AgentRel]()
	ReaderModel = orm.MustEntityOps[Reader]()
	ApplyModel = orm.MustEntityOps[Apply]()
	ChanModel = orm.MustEntityOps[Chan]()
	ChanMerchModel = orm.MustEntityOps[ChanMerch]()
	MerchModel = orm.MustEntityOps[Merch]()
	OrderDailyModel = orm.MustEntityOps[OrderDaily]()
	PropsBranchModel = orm.MustEntityOps[PropsBranch]()
	ProfitDailyModel = orm.MustEntityOps[ProfitDaily]()
	ProfitSettleModel = orm.MustEntityOps[ProfitSettle]()
	AuthorModel = orm.MustEntityOps[Author]()
	BookModel = orm.MustEntityOps[Book]()
	LibBranchModel = orm.MustEntityOps[Branch]()
	CategoryModel = orm.MustEntityOps[Category]()
	SeriesModel = orm.MustEntityOps[Series]()

}
