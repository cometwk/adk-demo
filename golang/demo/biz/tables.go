package biz

import (
	"strconv"
	"time"
)

// Agent 代理
type Agent struct {
	ID           int64     `xorm:"bigint not null pk 'id'"               json:"id,string"`        // 分布式雪花ID
	AgentNo      string    `xorm:"varchar(64) not null 'agent_no'"       json:"agent_no"`         // 代理商编号
	Name         string    `xorm:"varchar(128) not null 'name'"          json:"name"`             // 代理商名称
	ContactName  string    `xorm:"varchar(64) 'contact_name'"            json:"contact_name"`     // 联系人姓名
	ContactPhone string    `xorm:"varchar(32) 'contact_phone'"           json:"contact_phone"`    // 联系人手机号
	Disabled     int       `xorm:"tinyint not null default 0 'disabled'" json:"disabled"`         // 是否禁用
	Rate         int64     `xorm:"bigint default 0 'rate'"               json:"rate"`             // 备注费率，十万分比，用于助记代理商的成本
	Notify       int       `xorm:"tinyint not null default 0 'notify'"   json:"notify"`           // 是否发送进件通知: 0=不发送, 1=发送
	CreatedAt    time.Time `xorm:"created 'created_at'"                  json:"created_at"`       // 创建时间
	UpdatedAt    time.Time `xorm:"updated 'updated_at'"                  json:"updated_at"`       // 更新时间
	ParentID     int64     `xorm:"bigint 'parent_id'"                    json:"parent_id,string"` // 上级代理ID, 0 is ROOT
	Sort         int       `xorm:"int not null default 0 'sort'"         json:"sort,string"`      // 同级排序

	Children []*Agent `xorm:"-" json:"children"` // 子代理商
}

// AgentClosure 代理层级闭包关系
type AgentClosure struct {
	AncestorID   int64 `xorm:"bigint not null pk 'ancestor_id'"   json:"ancestor_id,string"`   // 祖先代理ID
	DescendantID int64 `xorm:"bigint not null pk 'descendant_id'" json:"descendant_id,string"` // 后代代理ID
	Depth        int   `xorm:"int not null 'depth'"               json:"depth"`                // 层级距离（自身为0）
}

func (e *AgentClosure) TableName() string { return "agent_closure" }

// AgentRel 代理关系
type AgentRel struct {
	ID        int64     `xorm:"bigint not null pk 'id'"           json:"id,string"`       // 分布式雪花ID
	AgentNo   string    `xorm:"varchar(64) not null 'agent_no'"   json:"agent_no"`        // 代理商编号
	AgentType string    `xorm:"varchar(32) not null 'agent_type'" json:"agent_type"`      // 代理类型: MERCH or CHAN
	AgentID   int64     `xorm:"bigint not null 'agent_id'"        json:"agent_id,string"` // 代理商ID（冗余）
	ObjID     int64     `xorm:"bigint not null 'obj_id'"          json:"obj_id,string"`   // 对象ID: 商户ID或通道ID
	ObjNo     string    `xorm:"varchar(64) not null 'obj_no'"     json:"obj_no"`          // 对象编号: 商户编号或通道编号（冗余）
	ObjName   string    `xorm:"varchar(64) not null 'obj_name'"   json:"obj_name"`        // 对象名称: 商户名称或通道名称（冗余）
	Rate      int64     `xorm:"bigint default 0 'rate'"           json:"rate"`            // 分润比例, 十万分比率
	Mode      int       `xorm:"tinyint not null default 2 'mode'" json:"mode"`            // 分润模式: 1=PERCENT, 2=FIXED
	RateValue int64     `xorm:"bigint default 0 'rate_value'"     json:"rate_value"`      // 用户设置的值，不参与计算
	Apply     int       `xorm:"tinyint default 0 'apply'"         json:"apply"`           // 进件人标志：0=不是，1=是
	CreatedAt time.Time `xorm:"created 'created_at'"              json:"created_at"`      // 创建时间
	UpdatedAt time.Time `xorm:"updated 'updated_at'"              json:"updated_at"`      // 更新时间
}

// Chan 通道
type Chan struct {
	ID        int64     `xorm:"bigint not null pk 'id'"               json:"id,string"`  // 分布式雪花ID
	ChanNo    string    `xorm:"varchar(64) not null 'chan_no'"        json:"chan_no"`    // 通道编号
	ChanType  string    `xorm:"varchar(64) 'chan_type'"               json:"chan_type"`  // 通道类型（跟代码绑定，如 mock: 沙箱, ccb: 建行）
	Rate      int64     `xorm:"bigint default 0 'rate'"               json:"rate"`       // 费率, 十万分比率
	Name      string    `xorm:"varchar(128) not null 'name'"          json:"name"`       // 通道名称
	Remark    string    `xorm:"varchar(255) 'remark'"                 json:"remark"`     // 备注, 作为通道参数的JSON字符串
	Disabled  int       `xorm:"tinyint not null default 0 'disabled'" json:"disabled"`   // 是否禁用
	CreatedAt time.Time `xorm:"created 'created_at'"                  json:"created_at"` // 创建时间
	UpdatedAt time.Time `xorm:"updated 'updated_at'"                  json:"updated_at"` // 更新时间
}

// ChanMerch 机构商户
type ChanMerch struct {
	ID            int64     `xorm:"bigint not null pk 'id'"                       json:"id,string"`       // 分布式雪花ID
	ChanNo        string    `xorm:"varchar(64) not null 'chan_no'"                json:"chan_no"`         // 通道编号
	ChanName      string    `xorm:"varchar(64) not null 'chan_name'"              json:"chan_name"`       // 通道名称（冗余）
	ChanType      string    `xorm:"varchar(64) not null 'chan_type'"              json:"chan_type"`       // 通道类型（冗余）
	ChanID        int64     `xorm:"bigint not null default 0 'chan_id'"           json:"chan_id,string"`  // 通道ID（冗余）
	ChanMerchNo   string    `xorm:"varchar(64) not null 'chan_merch_no'"          json:"chan_merch_no"`   // 机构商户号
	ChanMerchName string    `xorm:"varchar(128) not null 'chan_merch_name'"       json:"chan_merch_name"` // 机构商户名称
	ChanParam     string    `xorm:"json not null 'chan_param'"                    json:"chan_param"`      // 通道参数（通道类型不同，参数字段都可能不一样, 由代码负责解释）
	MerchID       int64     `xorm:"bigint not null default 0 'merch_id'"          json:"merch_id,string"` // 平台商户ID（为0表示还未绑定）
	MerchNo       string    `xorm:"varchar(64) not null default '' 'merch_no'"    json:"merch_no"`        // 平台商户编号（冗余）
	MerchName     string    `xorm:"varchar(128) not null default '' 'merch_name'" json:"merch_name"`      // 平台商户名称（冗余）
	Active        int       `xorm:"tinyint not null default 0 'active'"           json:"active"`          // 是否被激活（冗余 0: 未启用, 1: 启用 跟 merch.chan_merch_id = chan_merch.id 一致）
	Disabled      int       `xorm:"tinyint not null default 0 'disabled'"         json:"disabled"`        // 是否禁用
	CreatedAt     time.Time `xorm:"created 'created_at'"                          json:"created_at"`      // 创建时间
	UpdatedAt     time.Time `xorm:"updated 'updated_at'"                          json:"updated_at"`      // 更新时间
}

// Merch 商户
type Merch struct {
	ID            int64   `xorm:"bigint not null pk 'id'"               json:"id,string"`            // 分布式雪花ID
	MerchNo       string  `xorm:"varchar(64) not null 'merch_no'"       json:"merch_no"`             // 商户编号
	Rate          int64   `xorm:"bigint default 0 'rate'"               json:"rate"`                 // 费率, 十万分比率
	Name          string  `xorm:"varchar(128) not null 'name'"          json:"name"`                 // 商户名称
	ContactName   string  `xorm:"varchar(64) 'contact_name'"            json:"contact_name"`         // 联系人姓名
	ContactPhone  string  `xorm:"varchar(32) 'contact_phone'"           json:"contact_phone"`        // 联系人手机号
	Address       string  `xorm:"varchar(255) 'address'"                json:"address"`              // 商户地址
	ApplyDate     BizDate `xorm:"date not null 'apply_date'"            json:"apply_date"`           // 进件签约日期
	ChanMerchId   int64   `xorm:"bigint 'chan_merch_id'"                json:"chan_merch_id,string"` // 当前机构商户
	ChanMerchNo   string  `xorm:"varchar(64) 'chan_merch_no'"           json:"chan_merch_no"`        // 机构商户编号（冗余）
	ChanMerchName string  `xorm:"varchar(128) 'chan_merch_name'"        json:"chan_merch_name"`      // 机构商户名称（冗余）
	APIKey        string  `xorm:"varchar(128) 'api_key'"                json:"api_key"`              // 商户API密钥, 不返回
	Remark        string  `xorm:"varchar(255) 'remark'"                 json:"remark"`               // 备注

	// ApplyInfo 包含原始请求参数信息
	ApplyInfo string `xorm:"text 'apply_info'"                     json:"apply_info"` // 对应于 apply_info struct

	Disabled  int       `xorm:"tinyint not null default 0 'disabled'" json:"disabled"`   // 是否禁用
	CreatedAt time.Time `xorm:"created 'created_at'"                  json:"created_at"` // 创建时间
	UpdatedAt time.Time `xorm:"updated 'updated_at'"                  json:"updated_at"` // 更新时间
}

// Apply 商户进件申请（代理侧）
type Apply struct {
	ID int64 `xorm:"bigint not null pk 'id'" json:"id,string"` // 分布式雪花ID, 平台进件申请ID

	AgentNo    string `xorm:"varchar(32) not null 'agent_no'"                json:"agent_no"`     // 代理商编号
	SaasNo     string `xorm:"varchar(32) not null default '' 'saas_no'"      json:"saas_no"`      // 服务商编号
	OutApplyNo string `xorm:"varchar(32) not null default '' 'out_apply_no'" json:"out_apply_no"` // 服务商进件单号
	ApplyNo    string `xorm:"varchar(32) not null 'apply_no'"                json:"apply_no"`     // 平台进件单号
	Rate       int64  `xorm:"bigint default 0 'rate'"                        json:"rate"`         // 签约费率, 十万分比率
	BranchID   string `xorm:"varchar(32) not null 'branch_id'"               json:"branch_id"`    // 网点ID

	UserID string `xorm:"varchar(32) not null default '' 'userid'" json:"userid"` // 经办人ID, 若为 '' 则API操作
	Remark string `xorm:"varchar(256) 'remark'"                    json:"remark"` // 备注/摘要

	Status        int        `xorm:"int default 1 'status'"       json:"status"`          // 申请状态:0-INIT, 1-PENDING, 2-SUCCESS, 3-FAIL
	StatusReason  string     `xorm:"varchar(128) 'status_reason'" json:"status_reason"`   // 造成申请状态的原因说明
	QueryCount    int        `xorm:"int default 0 'query_count'"  json:"query_count"`     // 已查询次数
	NextQueryTime *time.Time `xorm:"datetime 'next_query_time'"   json:"next_query_time"` // 下次查询时间

	Notify         int        `xorm:"int default 1 'notify'"       json:"notify"`           // 通知状态: 1-PENDING, 2-SUCCESS, 3-FAIL
	NotifyReason   string     `xorm:"varchar(128) 'notify_reason'" json:"notify_reason"`    // 造成通知状态的原因说明
	NotifyCount    int        `xorm:"int default 0 'notify_count'" json:"notify_count"`     // 已重试次数
	NextNotifyTime *time.Time `xorm:"datetime 'next_notify_time'"  json:"next_notify_time"` // 下次通知时间
	NotifyURL      string     `xorm:"varchar(256) 'notify_url'"    json:"notify_url"`       // 商户异步通知URL

	MerchName string `xorm:"varchar(128) not null 'merch_name'" json:"merch_name"` // 商户名称
	MerchID   int64  `xorm:"bigint not null 'merch_id'"         json:"merch_id,string"`
	MerchNo   string `xorm:"varchar(32) not null 'merch_no'"    json:"merch_no"`

	ChanMerchID   int64  `xorm:"bigint not null 'chan_merch_id'"         json:"chan_merch_id,string"`
	ChanMerchNo   string `xorm:"varchar(64) not null 'chan_merch_no'"    json:"chan_merch_no"`
	ChanMerchName string `xorm:"varchar(128) not null 'chan_merch_name'" json:"chan_merch_name"`

	ContactName  string `xorm:"varchar(64) 'contact_name'"  json:"contact_name"`
	ContactPhone string `xorm:"varchar(32) 'contact_phone'" json:"contact_phone"`

	// ReqParams 包含原始请求参数与文件映射信息
	ReqParams string `xorm:"text 'req_params'" json:"req_params"`

	Disabled  int       `xorm:"tinyint not null default 0 'disabled'" json:"disabled"`
	CreatedAt time.Time `xorm:"created 'created_at'"                  json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'"                  json:"updated_at"`
}

func (a Apply) TableName() string { return "apply" }
func (a Apply) ApplyID() string {
	return strconv.FormatInt(a.ID, 10)
}

// 商户日报统计记录(导入)
type OrderDaily struct {
	ID         int64   `xorm:"bigint not null pk 'id'"                      json:"id,string"`                                      // 分布式雪花ID
	ReportDate BizDate `xorm:"date not null unique(idx_report_date_merch_chan) 'report_date'"                  json:"report_date"` // 结算日期（业务日期，本地日）
	MerchID    int64   `xorm:"bigint not null 'merch_id'"                   json:"merch_id,string"`                                // 商户ID（冗余）
	MerchNo    string  `xorm:"varchar(32) not null default '' unique(idx_report_date_merch_chan) 'merch_no'"   json:"merch_no"`    // 商户编号
	MerchName  string  `xorm:"varchar(64) not null default '' 'merch_name'" json:"merch_name"`                                     // 商户名称

	ChanID      int64  `xorm:"bigint not null 'chan_id'"      json:"chan_id,string"`                             // 通道ID（冗余）
	ChanNo      string `xorm:"varchar(32) not null unique(idx_report_date_merch_chan) 'chan_no'" json:"chan_no"` // 通道编号
	ChanMerchNo string `xorm:"varchar(32) 'chan_merch_no'"    json:"chan_merch_no"`                              // 通道机构商户号

	TotalCount  int64 `xorm:"int not null default 0 'total_count'"     json:"total_count"`  // 总订单数
	TotalAmount int64 `xorm:"bigint not null default 0 'total_amount'" json:"total_amount"` // 总交易额(分)

	CreatedAt time.Time `xorm:"datetime not null 'created_at'" json:"created_at"` // 由代码设置
	UpdatedAt time.Time `xorm:"updated 'updated_at'"           json:"updated_at"`
}

func (e *OrderDaily) TableName() string { return "order_daily" }

// PropsBranch 支行行号字典表
type PropsBranch struct {
	ID         int64     `xorm:"bigint not null pk 'id'"                json:"id,string"`   // 分布式雪花ID, 只是前端使用
	BranchID   string    `xorm:"varchar(32) not null 'branch_id'"       json:"branch_id"`   // 联行行号
	BranchName string    `xorm:"varchar(128) not null 'branch_name'"    json:"branch_name"` // 网点名称
	BranchCode string    `xorm:"varchar(32) not null 'branch_code'"     json:"branch_code"` // 备用
	Remark     string    `xorm:"varchar(255) 'remark'"                  json:"remark"`      // 备注
	CreatedAt  time.Time `xorm:"created 'created_at'"                   json:"created_at"`  // 创建时间
	UpdatedAt  time.Time `xorm:"updated 'updated_at'"                   json:"updated_at"`  // 更新时间
}

func (e *PropsBranch) TableName() string { return "props_branch" }

// ProfitDaily 代理商日分润统计
type ProfitDaily struct {
	ID        int64   `xorm:"bigint not null pk 'id'"           json:"id,string"`  // 分布式雪花ID
	StatDate  BizDate `xorm:"date not null 'stat_date'"         json:"stat_date"`  // 统计日期（本地日）
	AgentNo   string  `xorm:"varchar(64) not null 'agent_no'"   json:"agent_no"`   // 代理商编号
	AgentType string  `xorm:"varchar(32) not null 'agent_type'" json:"agent_type"` // 代理类型: MERCH / CHAN
	Rate      int64   `xorm:"bigint default 0 'rate'"           json:"rate"`       // （废弃）分润比例, 十万分比率（结算快照）

	// 交易/退款统计（所有金额单位: 分）
	TotalTradeAmt     int64 `xorm:"bigint not null default 0 'total_trade_amt'"     json:"total_trade_amt"`     // 当日交易总金额
	OrderCnt          int64 `xorm:"bigint not null default 0 'order_cnt'"           json:"order_cnt"`           // 当日成功订单数
	TotalProfit       int64 `xorm:"bigint not null default 0 'total_profit'"        json:"total_profit"`        // 当日分润总收入(基于交易)
	TotalRefundAmt    int64 `xorm:"bigint not null default 0 'total_refund_amt'"    json:"total_refund_amt"`    // 当日退款总金额(原交易金额)
	RefundCnt         int64 `xorm:"bigint not null default 0 'refund_cnt'"          json:"refund_cnt"`          // 当日退款笔数
	TotalRefundDeduct int64 `xorm:"bigint not null default 0 'total_refund_deduct'" json:"total_refund_deduct"` // 当日退款需扣除的分润(负向支出)
	NetProfit         int64 `xorm:"bigint not null default 0 'net_profit'"          json:"net_profit"`          // 当日净分润 = total_profit - total_refund_deduct

	// 自己进件商户交易统计（apply=1 时累加）
	OwnTradeAmt     int64 `xorm:"bigint not null default 0 'own_trade_amt'"     json:"own_trade_amt"`     // 自己进件商户的交易金额(apply=1)
	OwnOrderCnt     int64 `xorm:"bigint not null default 0 'own_order_cnt'"     json:"own_order_cnt"`     // 自己进件商户的订单数
	OwnProfit       int64 `xorm:"bigint not null default 0 'own_profit'"        json:"own_profit"`        // 自己进件商户的分润收入(基于交易)
	OwnRefundAmt    int64 `xorm:"bigint not null default 0 'own_refund_amt'"    json:"own_refund_amt"`    // 自己进件商户的退款金额(原交易金额)
	OwnRefundCnt    int64 `xorm:"bigint not null default 0 'own_refund_cnt'"    json:"own_refund_cnt"`    // 自己进件商户的退款笔数
	OwnRefundDeduct int64 `xorm:"bigint not null default 0 'own_refund_deduct'" json:"own_refund_deduct"` // 自己进件商户的退款扣除分润
	OwnNetProfit    int64 `xorm:"bigint not null default 0 'own_net_profit'"    json:"own_net_profit"`    // 自己进件商户的净分润 = own_profit - own_refund_deduct

	Status         int       `xorm:"int not null default 0 'status'" json:"status"`                               // 结算状态: 0=未结算, 1=审批中, 2=已审批/已结算
	ProfitSettleID int64     `xorm:"bigint not null default 0 'profit_settle_id'" json:"profit_settle_id,string"` // 关联的结算记录ID
	CreatedAt      time.Time `xorm:"created 'created_at'"            json:"created_at"`
	UpdatedAt      time.Time `xorm:"updated 'updated_at'"            json:"updated_at"`
}

func (e *ProfitDaily) TableName() string { return "profit_daily" }

// ProfitSettle 代理商分润结算
type ProfitSettle struct {
	ID        int64   `xorm:"bigint not null pk 'id'"           json:"id,string"`   // 分布式雪花ID
	StartDate BizDate `xorm:"date not null 'start_date'"        json:"start_date"`  // 结算开始日期（本地日）
	EndDate   BizDate `xorm:"date not null 'end_date'"          json:"end_date"`    // 结算结束日期（本地日）
	AgentNo   string  `xorm:"varchar(64) not null 'agent_no'"   json:"agent_no"`    // 代理商编号
	AgentType string  `xorm:"varchar(32) not null 'agent_type'" json:"agent_type"`  // 代理类型: MERCH / CHAN
	AgentName string  `xorm:"varchar(128) not null 'agent_name'" json:"agent_name"` // 代理商名称

	// 交易/退款统计（所有金额单位: 分）
	TotalTradeAmt     int64 `xorm:"bigint not null default 0 'total_trade_amt'"     json:"total_trade_amt"`     // 结算期间交易总金额
	OrderCnt          int64 `xorm:"bigint not null default 0 'order_cnt'"           json:"order_cnt"`           // 结算期间成功订单数
	TotalProfit       int64 `xorm:"bigint not null default 0 'total_profit'"        json:"total_profit"`        // 结算期间分润总收入(基于交易)
	TotalRefundAmt    int64 `xorm:"bigint not null default 0 'total_refund_amt'"    json:"total_refund_amt"`    // 结算期间退款总金额(原交易金额)
	RefundCnt         int64 `xorm:"bigint not null default 0 'refund_cnt'"          json:"refund_cnt"`          // 结算期间退款笔数
	TotalRefundDeduct int64 `xorm:"bigint not null default 0 'total_refund_deduct'" json:"total_refund_deduct"` // 结算期间退款需扣除的分润(负向支出)
	NetProfit         int64 `xorm:"bigint not null default 0 'net_profit'"          json:"net_profit"`          // 结算期间净分润

	Status int    `xorm:"int not null default 0 'status'" json:"status"`             // 结算状态: 0=未结算, 1=审批中, 2=已审批/已结算
	FileID int64  `xorm:"bigint not null default 0 'file_id'" json:"file_id,string"` // 结算凭证图片ID
	Remark string `xorm:"varchar(128) not null default '' 'remark'" json:"remark"`   // 结算备注

	CreatedAt time.Time `xorm:"created 'created_at'"            json:"created_at"`
	UpdatedAt time.Time `xorm:"updated 'updated_at'"              json:"updated_at"`
}

func (e *ProfitSettle) TableName() string { return "profit_settle" }

// Reader 图书馆读者
type Reader struct {
	ID                 int64     `xorm:"bigint not null pk 'id'"                       json:"id,string"`                  // 分布式雪花ID
	ReaderCode         string    `xorm:"varchar(64) not null unique 'reader_code'"     json:"reader_code"`                // 读者编号
	Name               string    `xorm:"varchar(128) not null 'name'"                  json:"name"`                       // 读者姓名
	MembershipLevel    string    `xorm:"varchar(16) not null default 'basic' 'membership_level'" json:"membership_level"` // 会员等级: gold/silver/basic
	CurrentBorrowCount int       `xorm:"int not null default 0 'current_borrow_count'" json:"current_borrow_count"`       // 当前已借出未归还数量
	RegisteredDays     int       `xorm:"int not null default 0 'registered_days'"      json:"registered_days"`            // 注册距今天数
	BranchID           int64     `xorm:"bigint not null 'branch_id'"                   json:"branch_id,string"`           // 注册分馆ID
	CreatedAt          time.Time `xorm:"created 'created_at'"                          json:"created_at"`                 // 创建时间
	UpdatedAt          time.Time `xorm:"updated 'updated_at'"                          json:"updated_at"`                 // 更新时间
}

func (e *Reader) TableName() string { return "lib_reader" }

// Author 书籍作者
type Author struct {
	ID              int64     `xorm:"bigint not null pk 'id'"                    json:"id,string"`         // 分布式雪花ID
	AuthorCode      string    `xorm:"varchar(64) not null unique 'author_code'"  json:"author_code"`       // 作者编号
	Name            string    `xorm:"varchar(128) not null 'name'"               json:"name"`              // 作者姓名
	Nationality     string    `xorm:"varchar(64) 'nationality'"                  json:"nationality"`       // 国籍
	ActiveBookCount int       `xorm:"int not null default 0 'active_book_count'" json:"active_book_count"` // 当前在馆作品数量
	CreatedAt       time.Time `xorm:"created 'created_at'"                       json:"created_at"`        // 创建时间
	UpdatedAt       time.Time `xorm:"updated 'updated_at'"                       json:"updated_at"`        // 更新时间
}

func (e *Author) TableName() string { return "lib_author" }

// Book 馆藏书籍
type Book struct {
	ID              int64     `xorm:"bigint not null pk 'id'"                       json:"id,string"`         // 分布式雪花ID
	BookCode        string    `xorm:"varchar(64) not null unique 'book_code'"       json:"book_code"`         // 书籍编号
	Title           string    `xorm:"varchar(256) not null 'title'"                 json:"title"`             // 书名
	ISBN            string    `xorm:"varchar(32) not null 'isbn'"                   json:"isbn"`              // ISBN编号
	DaysOnShelf     int       `xorm:"int not null default 0 'days_on_shelf'"       json:"days_on_shelf"`      // 上架距今天数
	TotalCopies     int       `xorm:"int not null default 1 'total_copies'"        json:"total_copies"`       // 馆藏总册数
	AvailableCopies int       `xorm:"int not null default 1 'available_copies'"    json:"available_copies"`   // 当前可借册数
	SeriesVolume    int       `xorm:"int not null default 0 'series_volume'"       json:"series_volume"`      // 系列卷号（0=非系列书）
	AuthorID        int64     `xorm:"bigint not null 'author_id'"                  json:"author_id,string"`   // 作者ID
	CategoryID      int64     `xorm:"bigint not null 'category_id'"                json:"category_id,string"` // 类目ID
	SeriesID        int64     `xorm:"bigint not null default 0 'series_id'"        json:"series_id,string"`   // 系列ID（0=非系列书）
	CreatedAt       time.Time `xorm:"created 'created_at'"                          json:"created_at"`        // 创建时间
	UpdatedAt       time.Time `xorm:"updated 'updated_at'"                          json:"updated_at"`        // 更新时间
}

func (e *Book) TableName() string { return "lib_book" }

// LibBranch 图书馆分馆
type Branch struct {
	ID                    int64     `xorm:"bigint not null pk 'id'"                           json:"id,string"`                    // 分布式雪花ID
	BranchCode            string    `xorm:"varchar(64) not null unique 'branch_code'"        json:"branch_code"`                   // 分馆编号
	Name                  string    `xorm:"varchar(128) not null 'name'"                     json:"name"`                          // 分馆名称
	MaxBorrowPerReader    int       `xorm:"int not null default 3 'max_borrow_per_reader'"   json:"max_borrow_per_reader"`         // 每位读者可同时借阅上限
	NewBookProtectionDays int       `xorm:"int not null default 7 'new_book_protection_days'" json:"new_book_protection_days"`     // 新书保护期（天）
	AllowInterLibraryLoan int       `xorm:"tinyint not null default 0 'allow_inter_library_loan'" json:"allow_inter_library_loan"` // 是否支持馆际互借
	CreatedAt             time.Time `xorm:"created 'created_at'"                             json:"created_at"`                    // 创建时间
	UpdatedAt             time.Time `xorm:"updated 'updated_at'"                             json:"updated_at"`                    // 更新时间
}

func (e *Branch) TableName() string { return "lib_branch" }

// Category 图书类目
type Category struct {
	ID                      int64     `xorm:"bigint not null pk 'id'"                                json:"id,string"`                           // 分布式雪花ID
	CategoryCode            string    `xorm:"varchar(64) not null unique 'category_code'"            json:"category_code"`                       // 类目编号
	Name                    string    `xorm:"varchar(128) not null 'name'"                           json:"name"`                                // 类目名称
	IsRestricted            int       `xorm:"tinyint not null default 0 'is_restricted'"             json:"is_restricted"`                       // 是否为限制类目
	RequiredMembershipLevel string    `xorm:"varchar(16) not null default 'basic' 'required_membership_level'" json:"required_membership_level"` // 借阅所需最低会员等级
	CreatedAt               time.Time `xorm:"created 'created_at'"                                   json:"created_at"`                          // 创建时间
	UpdatedAt               time.Time `xorm:"updated 'updated_at'"                                   json:"updated_at"`                          // 更新时间
}

func (e *Category) TableName() string { return "lib_category" }

// Series 系列丛书
type Series struct {
	ID           int64     `xorm:"bigint not null pk 'id'"                    json:"id,string"`    // 分布式雪花ID
	SeriesCode   string    `xorm:"varchar(64) not null unique 'series_code'"  json:"series_code"`  // 系列编号
	Name         string    `xorm:"varchar(128) not null 'name'"               json:"name"`         // 系列名称
	TotalVolumes int       `xorm:"int not null 'total_volumes'"              json:"total_volumes"` // 系列总卷数
	CreatedAt    time.Time `xorm:"created 'created_at'"                       json:"created_at"`   // 创建时间
	UpdatedAt    time.Time `xorm:"updated 'updated_at'"                       json:"updated_at"`   // 更新时间
}

func (e *Series) TableName() string { return "lib_series" }
