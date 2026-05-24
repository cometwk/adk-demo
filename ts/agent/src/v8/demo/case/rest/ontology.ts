import {
	agentProperty,
	agentRelations,
	agentType,
	BaseNode,
} from "../../../ontology";

// ── Agent（agent.sql）──

@agentType({
	description: "代理商；parent_id 为直接上级，层级全貌见 AgentClosure",
})
@agentRelations([
	{
		type: "parent",
		toType: "Agent",
		description: "上级代理商（本节点的 parent_id 指向该代理商）",
	},
	{
		type: "children",
		toType: "Agent",
		description: "直接下级代理商（parent_id 指向本节点）",
	},
	{
		type: "descendant_of",
		toType: "Agent",
		description: "所有下级代理商（经 agent_closure 闭包）",
	},
	{
		type: "ancestor_of",
		toType: "Agent",
		description: "所有上级代理商（经 agent_closure 闭包）",
	},
	{
		type: "binds_merch",
		toType: "Merch",
		description: "代理绑定的商户（agent_rel, agent_type=MERCH）",
	},
	{
		type: "submitted_apply",
		toType: "Apply",
		description: "该代理商发起的进件申请",
	},
	{
		type: "has_profit_daily",
		toType: "ProfitDaily",
		description: "代理商日分润统计",
	},
])
export class Agent extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({
		type: "string",
		description: "代理商编号",
		agentVisible: true,
	})
	agent_no!: string;

	@agentProperty({
		type: "string",
		description: "代理商名称",
		agentVisible: true,
	})
	name!: string;

	@agentProperty({ type: "string", description: "联系人姓名" })
	contact_name!: string;

	@agentProperty({ type: "string", description: "联系人手机号" })
	contact_phone!: string;

	@agentProperty({ type: "number", description: "是否禁用：0 否，1 是" })
	disabled!: number;

	@agentProperty({ type: "number", description: "备注费率（十万分比）" })
	rate!: number;

	@agentProperty({ type: "number", description: "是否发送进件通知" })
	notify!: number;

	@agentProperty({ type: "string", description: "直接父节点 id" })
	parent_id!: string;

	@agentProperty({ type: "number", description: "同级排序（数值越小越靠前）" })
	sort!: number;
}

// ── Merch（merch.sql）──

@agentType({ description: "商户主表" })
@agentRelations([
	{
		type: "bound_by",
		toType: "Agent",
		description: "绑定该商户的代理商（agent_rel）",
	},
	{
		type: "created_from",
		toType: "Apply",
		description: "进件申请记录（apply.merch_no）",
	},
	{
		type: "has_order_daily",
		toType: "OrderDaily",
		description: "商户日交易统计",
	},
])
export class Merch extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({
		type: "string",
		description: "商户编号",
		agentVisible: true,
	})
	merch_no!: string;

	@agentProperty({
		type: "string",
		description: "商户名称",
		agentVisible: true,
	})
	name!: string;

	@agentProperty({ type: "number", description: "签约费率（十万分比）" })
	rate!: number;

	@agentProperty({ type: "string", description: "进件日期" })
	apply_date!: string;

	@agentProperty({ type: "number", description: "是否禁用" })
	disabled!: number;

	@agentProperty({ type: "string", description: "联系人姓名" })
	contact_name!: string;

	@agentProperty({ type: "string", description: "联系人手机号" })
	contact_phone!: string;

	@agentProperty({ type: "string", description: "商户地址" })
	address!: string;

	@agentProperty({ type: "string", description: "当前机构商户 ID" })
	chan_merch_id!: string;

	@agentProperty({ type: "string", description: "机构商户编号" })
	chan_merch_no!: string;

	@agentProperty({ type: "string", description: "机构商户名称" })
	chan_merch_name!: string;

	@agentProperty({ type: "string", description: "商户 API 密钥" })
	api_key!: string;

	@agentProperty({ type: "string", description: "备注" })
	remark!: string;
}

// ── Apply（apply.sql）──

@agentType({ description: "商户进件申请；成功后关联 merch" })
@agentRelations([
	{
		type: "submitted_by",
		toType: "Agent",
		description: "发起进件的代理商（agent_no）",
	},
	{
		type: "creates",
		toType: "Merch",
		description: "申请成功后创建的商户（merch_no）",
	},
])
export class Apply extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({ type: "string", description: "代理商编号" })
	agent_no!: string;

	@agentProperty({
		type: "string",
		description: "平台进件单号",
		agentVisible: true,
	})
	apply_no!: string;

	@agentProperty({ type: "string", description: "商户编号（成功后）" })
	merch_no!: string;

	@agentProperty({ type: "string", description: "商户名称（申请时录入）" })
	merch_name!: string;

	@agentProperty({
		type: "number",
		description: "申请状态：0-INIT,1-PENDING,2-SUCCESS,3-FAIL",
	})
	status!: number;

	@agentProperty({ type: "number", description: "签约费率（十万分比）" })
	rate!: number;

	@agentProperty({ type: "string", description: "网点 ID" })
	branch_id!: string;

	@agentProperty({ type: "string", description: "申请状态原因说明" })
	status_reason!: string;

	@agentProperty({
		type: "string",
		description: "机构商户 ID（申请成功后分配）",
	})
	chan_merch_id!: string;

	@agentProperty({ type: "string", description: "机构商户号" })
	chan_merch_no!: string;

	@agentProperty({ type: "string", description: "机构商户名称" })
	chan_merch_name!: string;

	@agentProperty({ type: "string", description: "联系人姓名" })
	contact_name!: string;

	@agentProperty({ type: "string", description: "联系人手机号" })
	contact_phone!: string;

	@agentProperty({
		type: "number",
		description: "通知状态：1-PENDING, 2-SUCCESS, 3-FAIL",
	})
	notify!: number;

	@agentProperty({ type: "string", description: "通知状态原因说明" })
	notify_reason!: string;
}

// ── AgentRel（agent_rel.sql）──

@agentType({ description: "代理商与商户/通道的绑定关系；rate 参与分润计算" })
@agentRelations([
	{ type: "for_agent", toType: "Agent", description: "关系所属代理商" },
	{
		type: "for_merch",
		toType: "Merch",
		description: "绑定的商户（agent_type=MERCH 时）",
	},
])
export class AgentRel extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({ type: "string", description: "代理商编号" })
	agent_no!: string;

	@agentProperty({ type: "string", description: "代理类型：MERCH | CHAN" })
	agent_type!: string;

	@agentProperty({ type: "string", description: "对象编号（商户号或通道号）" })
	obj_no!: string;

	@agentProperty({
		type: "number",
		description: "分润比例（十万分比，参与计算）",
	})
	rate!: number;

	@agentProperty({
		type: "number",
		description: "进件人标志：1 表示该代理为进件人",
	})
	apply!: number;

	@agentProperty({
		type: "string",
		description: "对象名称（商户名称或通道名称）",
	})
	obj_name!: string;

	@agentProperty({
		type: "number",
		description: "分润模式：1-PERCENT(百分比), 2-FIXED(十万分比)",
	})
	mode!: number;

	@agentProperty({
		type: "number",
		description: "用户设置的费率值，不参与计算",
	})
	rate_value!: number;
}

// ── AgentClosure（agent_closure.sql）──

@agentType({ description: "代理商层级闭包表（ancestor → descendant）" })
@agentRelations([
	{ type: "ancestor", toType: "Agent", description: "祖先代理商" },
	{ type: "descendant", toType: "Agent", description: "后代代理商" },
])
export class AgentClosure extends BaseNode {
	@agentProperty({ type: "string", description: "祖先节点 id" })
	ancestor_id!: string;

	@agentProperty({ type: "string", description: "后代节点 id" })
	descendant_id!: string;

	@agentProperty({ type: "number", description: "层级深度" })
	depth!: number;
}

// ── OrderDaily（order_daily.sql）──

@agentType({ description: "商户日交易统计（导入）" })
@agentRelations([
	{ type: "for_merch", toType: "Merch", description: "统计所属商户" },
])
export class OrderDaily extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({ type: "string", description: "结算日期" })
	report_date!: string;

	@agentProperty({ type: "string", description: "商户编号" })
	merch_no!: string;

	@agentProperty({ type: "number", description: "总订单数" })
	total_count!: number;

	@agentProperty({ type: "number", description: "总交易额（分）" })
	total_amount!: number;

	@agentProperty({ type: "string", description: "通道编号" })
	chan_no!: string;

	@agentProperty({ type: "string", description: "通道机构商户号" })
	chan_merch_no!: string;
}

// ── ProfitDaily（profit_daily.sql）──

@agentType({ description: "代理商日分润统计" })
@agentRelations([
	{ type: "for_agent", toType: "Agent", description: "分润所属代理商" },
])
export class ProfitDaily extends BaseNode {
	@agentProperty({ type: "string", description: "创建时间" })
	created_at!: string;

	@agentProperty({ type: "string", description: "更新时间" })
	updated_at!: string;

	@agentProperty({ type: "string", description: "统计日期" })
	stat_date!: string;

	@agentProperty({ type: "string", description: "代理商编号" })
	agent_no!: string;

	@agentProperty({ type: "number", description: "当日净分润（分）" })
	net_profit!: number;

	@agentProperty({ type: "number", description: "自己进件商户的净分润" })
	own_net_profit!: number;

	@agentProperty({ type: "number", description: "结算状态" })
	status!: number;

	@agentProperty({ type: "string", description: "代理类型：MERCH / CHAN" })
	agent_type!: string;

	@agentProperty({ type: "number", description: "分润比例（十万分比）" })
	rate!: number;

	@agentProperty({ type: "number", description: "当日交易总金额（分）" })
	total_trade_amt!: number;

	@agentProperty({ type: "number", description: "当日成功订单数" })
	order_cnt!: number;

	@agentProperty({ type: "number", description: "当日分润总收入（分）" })
	total_profit!: number;

	@agentProperty({ type: "number", description: "当日退款总金额（分）" })
	total_refund_amt!: number;

	@agentProperty({ type: "number", description: "当日退款笔数" })
	refund_cnt!: number;

	@agentProperty({ type: "number", description: "当日退款需扣除的分润（分）" })
	total_refund_deduct!: number;

	@agentProperty({
		type: "number",
		description: "自己进件商户的交易金额（分）",
	})
	own_trade_amt!: number;

	@agentProperty({ type: "number", description: "自己进件商户的订单数" })
	own_order_cnt!: number;

	@agentProperty({
		type: "number",
		description: "自己进件商户的分润收入（分）",
	})
	own_profit!: number;

	@agentProperty({
		type: "number",
		description: "自己进件商户的退款金额（分）",
	})
	own_refund_amt!: number;

	@agentProperty({ type: "number", description: "自己进件商户的退款笔数" })
	own_refund_cnt!: number;

	@agentProperty({
		type: "number",
		description: "自己进件商户的退款扣除分润（分）",
	})
	own_refund_deduct!: number;

	@agentProperty({ type: "string", description: "关联的结算记录 ID" })
	profit_settle_id!: string;
}
