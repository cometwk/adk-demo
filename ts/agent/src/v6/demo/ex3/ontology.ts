import type { Ontology } from "../../ontology/schema";

// ── Agent-Merchant Apply Ontology ──

export const agentMerchOntology: Ontology = {
	version: "1.0.0",
	types: [
		{
			name: "Agent",
			description: "代理商，负责商户进件和分润",
			properties: [
				{ name: "agentNo", type: "string", description: "代理商编号", agentVisible: true },
				{ name: "name", type: "string", description: "代理商名称", agentVisible: true },
				{ name: "disabled", type: "boolean", description: "是否禁用（禁用后不参与进件和分润）", agentVisible: true },
				{ name: "parentId", type: "string", description: "直接父节点 ID（顶级代理商为 '0'）", agentVisible: true },
			],
			methods: [],
		},
		{
			name: "Merch",
			description: "商户，接入支付平台的商家",
			properties: [
				{ name: "merchNo", type: "string", description: "商户编号", agentVisible: true },
				{ name: "name", type: "string", description: "商户名称", agentVisible: true },
				{ name: "rate", type: "number", description: "商户费率（十万分比）", agentVisible: true },
				{ name: "contactName", type: "string", description: "联系人姓名", agentVisible: true },
				{ name: "contactPhone", type: "string", description: "联系人手机号", agentVisible: true },
			],
			methods: [],
		},
		{
			name: "Apply",
			description: "商户进件申请",
			properties: [
				{ name: "applyNo", type: "string", description: "进件申请编号", agentVisible: true },
				{ name: "agentNo", type: "string", description: "申请代理商编号", agentVisible: true },
				{ name: "merchNo", type: "string", description: "商户编号", agentVisible: true },
				{ name: "merchName", type: "string", description: "商户名称（申请时录入）", agentVisible: true },
				{ name: "status", type: "'INIT' | 'PENDING' | 'SUCCESS' | 'FAIL'", description: "申请状态", agentVisible: true },
				{ name: "statusReason", type: "string", description: "状态原因说明", agentVisible: true },
				{ name: "chanNo", type: "string", description: "通道编号（仅属性）", agentVisible: true },
				{ name: "rate", type: "number", description: "签约费率（十万分比）", agentVisible: true },
			],
			methods: [],
		},
		{
			name: "AgentRel",
			description: "代理关系：代理商与商户的绑定关系",
			properties: [
				{ name: "agentNo", type: "string", description: "代理商编号", agentVisible: true },
				{ name: "agentType", type: "'MERCH' | 'CHAN'", description: "代理类型", agentVisible: true },
				{ name: "objNo", type: "string", description: "对象编号（商户编号或通道编号）", agentVisible: true },
				{ name: "objName", type: "string", description: "对象名称", agentVisible: true },
				{ name: "rate", type: "number", description: "分润比例（十万分比）", agentVisible: true },
				{ name: "isApplier", type: "boolean", description: "是否为进件人（apply=1）", agentVisible: true },
			],
			methods: [],
		},
	],
	relations: [
		{ type: "applies", from: "Agent", to: "Apply", description: "代理商发起进件申请" },
		{ type: "for_merch", from: "Apply", to: "Merch", description: "进件申请关联商户" },
		{ type: "binds", from: "Agent", to: "AgentRel", description: "代理商建立代理关系" },
		{ type: "relates_to", from: "AgentRel", to: "Merch", description: "代理关系指向商户" },
		{ type: "has_parent", from: "Agent", to: "Agent", description: "代理商层级关系" },
	],
};