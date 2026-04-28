import { z } from "zod";
import {
	AgentMethodRegistry,
	agentProperty,
	type MethodSchema,
} from "../../runtime/decorator";
import { BaseNode } from "../../runtime/graph";

// ── Agent ──
// 代理商，负责商户进件和分润

export class Agent extends BaseNode {
	@agentProperty({ returns: "string", description: "代理商编号" })
	agentNo: string;

	@agentProperty({ returns: "string", description: "代理商名称" })
	name: string;

	@agentProperty({ returns: "boolean", description: "是否禁用（禁用后不参与进件和分润）" })
	disabled: boolean;

	@agentProperty({ returns: "string", description: "直接父节点 ID（顶级代理商为 '0'）" })
	parentId: string;

	constructor(
		id: string,
		agentNo: string,
		name: string,
		disabled: boolean,
		parentId: string = "0",
	) {
		super(id);
		this.agentNo = agentNo;
		this.name = name;
		this.disabled = disabled;
		this.parentId = parentId;
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Agent");
	}
}

// ── Merch ──
// 商户，接入支付平台的商家

export class Merch extends BaseNode {
	@agentProperty({ returns: "string", description: "商户编号" })
	merchNo: string;

	@agentProperty({ returns: "string", description: "商户名称" })
	name: string;

	@agentProperty({ returns: "number", description: "商户费率（十万分比）" })
	rate: number;

	@agentProperty({ returns: "string", description: "联系人姓名" })
	contactName: string;

	@agentProperty({ returns: "string", description: "联系人手机号" })
	contactPhone: string;

	constructor(
		id: string,
		merchNo: string,
		name: string,
		rate: number,
		contactName: string = "",
		contactPhone: string = "",
	) {
		super(id);
		this.merchNo = merchNo;
		this.name = name;
		this.rate = rate;
		this.contactName = contactName;
		this.contactPhone = contactPhone;
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Merch");
	}
}

// ── Apply ──
// 商户进件申请

export class Apply extends BaseNode {
	@agentProperty({ returns: "string", description: "进件申请编号" })
	applyNo: string;

	@agentProperty({ returns: "string", description: "申请代理商编号" })
	agentNo: string;

	@agentProperty({ returns: "string", description: "商户编号" })
	merchNo: string;

	@agentProperty({ returns: "string", description: "商户名称（申请时录入）" })
	merchName: string;

	@agentProperty({ returns: "'INIT' | 'PENDING' | 'SUCCESS' | 'FAIL'", description: "申请状态" })
	status: "INIT" | "PENDING" | "SUCCESS" | "FAIL";

	@agentProperty({ returns: "string", description: "状态原因说明" })
	statusReason: string;

	@agentProperty({ returns: "string", description: "通道编号（仅属性，不定义 Channel 实体）" })
	chanNo: string;

	@agentProperty({ returns: "number", description: "签约费率（十万分比）" })
	rate: number;

	constructor(
		id: string,
		applyNo: string,
		agentNo: string,
		merchNo: string,
		merchName: string,
		status: "INIT" | "PENDING" | "SUCCESS" | "FAIL",
		statusReason: string = "",
		chanNo: string = "",
		rate: number = 0,
	) {
		super(id);
		this.applyNo = applyNo;
		this.agentNo = agentNo;
		this.merchNo = merchNo;
		this.merchName = merchName;
		this.status = status;
		this.statusReason = statusReason;
		this.chanNo = chanNo;
		this.rate = rate;
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Apply");
	}
}

// ── AgentRel ──
// 代理关系：代理商与商户的绑定关系

export class AgentRel extends BaseNode {
	@agentProperty({ returns: "string", description: "代理商编号" })
	agentNo: string;

	@agentProperty({ returns: "'MERCH' | 'CHAN'", description: "代理类型：MERCH 或 CHAN" })
	agentType: "MERCH" | "CHAN";

	@agentProperty({ returns: "string", description: "对象编号（商户编号或通道编号）" })
	objNo: string;

	@agentProperty({ returns: "string", description: "对象名称" })
	objName: string;

	@agentProperty({ returns: "number", description: "分润比例（十万分比）" })
	rate: number;

	@agentProperty({ returns: "boolean", description: "是否为进件人（apply=1）" })
	isApplier: boolean;

	constructor(
		id: string,
		agentNo: string,
		agentType: "MERCH" | "CHAN",
		objNo: string,
		objName: string,
		rate: number,
		isApplier: boolean = false,
	) {
		super(id);
		this.agentNo = agentNo;
		this.agentType = agentType;
		this.objNo = objNo;
		this.objName = objName;
		this.rate = rate;
		this.isApplier = isApplier;
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("AgentRel");
	}
}