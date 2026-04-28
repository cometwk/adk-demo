import { Graph } from "../../runtime/graph";
import { EventStore, FactStore } from "../../runtime/eventStore";
import { clearRules } from "../../ontology/rules";
import type { FactBinding } from "../../runtime/types";
import { Agent, Merch, Apply, AgentRel } from "./entities";
import { registerAgentMerchRules } from "./rules";
import { buildAgentMerchCausalGraph } from "./causal";

// ── Graph seed ──
// Scenario: Agent A001 (disabled) applies for Merch M001 → Apply fails
//           Agent A002 (active) applies for Merch M002 → Apply pending

export function seedAgentMerchGraph(): Graph {
	const g = new Graph();

	// Agents
	const agentA001 = new Agent("agent_a001", "A001", "一级代理商", true, "0"); // disabled!
	const agentA002 = new Agent("agent_a002", "A002", "二级代理商", false, "agent_a001"); // active, child of A001
	const agentA003 = new Agent("agent_a003", "A003", "三级代理商", false, "agent_a002"); // active, child of A002

	// Merchants
	const merchM001 = new Merch("merch_m001", "M001", "测试商户一", 500, "", ""); // info incomplete!
	const merchM002 = new Merch("merch_m002", "M002", "测试商户二", 600, "张三", "13800138000"); // info complete
	const merchM003 = new Merch("merch_m003", "M003", "测试商户三", 400, "李四", "13900139000");

	// Applys
	const applyAP001 = new Apply(
		"apply_ap001",
		"AP001",
		"A001",
		"M001",
		"测试商户一",
		"FAIL",
		"商户信息不完整，通道拒绝",
		"",
		500,
	);
	const applyAP002 = new Apply(
		"apply_ap002",
		"AP002",
		"A002",
		"M002",
		"测试商户二",
		"PENDING",
		"等待通道审核",
		"",
		600,
	);

	// AgentRels
	const agentRelA002M002 = new AgentRel(
		"agentrel_a002_m002",
		"A002",
		"MERCH",
		"M002",
		"测试商户二",
		100,
		true, // isApplier
	);

	for (const node of [
		agentA001, agentA002, agentA003,
		merchM001, merchM002, merchM003,
		applyAP001, applyAP002,
		agentRelA002M002,
	]) {
		g.addNode(node);
	}

	// Apply edges: Agent → Apply
	g.addEdge({ from: "agent_a001", to: "apply_ap001", type: "applies" });
	g.addEdge({ from: "agent_a002", to: "apply_ap002", type: "applies" });

	// Apply → Merch edges
	g.addEdge({ from: "apply_ap001", to: "merch_m001", type: "for_merch" });
	g.addEdge({ from: "apply_ap002", to: "merch_m002", type: "for_merch" });

	// AgentRel edges: Agent → AgentRel → Merch
	g.addEdge({ from: "agent_a002", to: "agentrel_a002_m002", type: "binds" });
	g.addEdge({ from: "agentrel_a002_m002", to: "merch_m002", type: "relates_to" });

	// Agent hierarchy: has_parent
	g.addEdge({ from: "agent_a002", to: "agent_a001", type: "has_parent" });
	g.addEdge({ from: "agent_a003", to: "agent_a002", type: "has_parent" });

	return g;
}

// ── FactStore seed (predictive: current state snapshot) ──

export function seedAgentMerchFactStore(): FactStore {
	const now = "2026-04-28T00:00:00.000Z";
	const bindings: FactBinding[] = [
		// Agent properties
		{ entityId: "agent_a001", property: "agentNo", value: "A001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a001", property: "name", value: "一级代理商", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a001", property: "disabled", value: true, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a001", property: "parentId", value: "0", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		{ entityId: "agent_a002", property: "agentNo", value: "A002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a002", property: "name", value: "二级代理商", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a002", property: "disabled", value: false, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a002", property: "parentId", value: "agent_a001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		{ entityId: "agent_a003", property: "agentNo", value: "A003", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a003", property: "name", value: "三级代理商", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a003", property: "disabled", value: false, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agent_a003", property: "parentId", value: "agent_a002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		// Merch properties
		{ entityId: "merch_m001", property: "merchNo", value: "M001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m001", property: "name", value: "测试商户一", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m001", property: "rate", value: 500, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m001", property: "contactName", value: "", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now }, // empty!
		{ entityId: "merch_m001", property: "contactPhone", value: "", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now }, // empty!

		{ entityId: "merch_m002", property: "merchNo", value: "M002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m002", property: "name", value: "测试商户二", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m002", property: "rate", value: 600, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m002", property: "contactName", value: "张三", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "merch_m002", property: "contactPhone", value: "13800138000", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		// Apply properties
		{ entityId: "apply_ap001", property: "applyNo", value: "AP001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "agentNo", value: "A001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "merchNo", value: "M001", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "merchName", value: "测试商户一", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "status", value: "FAIL", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "statusReason", value: "商户信息不完整，通道拒绝", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "chanNo", value: "", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap001", property: "rate", value: 500, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		{ entityId: "apply_ap002", property: "applyNo", value: "AP002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "agentNo", value: "A002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "merchNo", value: "M002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "merchName", value: "测试商户二", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "status", value: "PENDING", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "statusReason", value: "等待通道审核", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "chanNo", value: "", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "apply_ap002", property: "rate", value: 600, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },

		// AgentRel properties
		{ entityId: "agentrel_a002_m002", property: "agentNo", value: "A002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agentrel_a002_m002", property: "agentType", value: "MERCH", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agentrel_a002_m002", property: "objNo", value: "M002", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agentrel_a002_m002", property: "objName", value: "测试商户二", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agentrel_a002_m002", property: "rate", value: 100, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "agentrel_a002_m002", property: "isApplier", value: true, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
	];
	return new FactStore(bindings);
}

// ── EventStore seed (diagnostic: incident timeline) ──
// T-0 = 2026-04-28T09:00Z (Apply AP001 failure discovered)

export function seedAgentMerchEventStore(): EventStore {
	const store = new EventStore();

	// T-3d: Agent disabled event — agent A001 was disabled
	store.addEvent({
		id: "evt_agent_disabled",
		type: "agent_disabled",
		occurredAt: "2026-04-25T10:00:00.000Z",
		actorId: "admin_system",
		affectedEntities: ["agent_a001"],
		payload: {
			description: "代理商 A001 因违规被禁用",
			causalEdgeId: "ce_agent_disabled_apply_block",
		},
	});

	// T-3d: Merch info missing event — merch M001 info incomplete
	store.addEvent({
		id: "evt_merch_info_missing",
		type: "merch_info_missing",
		occurredAt: "2026-04-25T14:00:00.000Z",
		actorId: "apply_system",
		affectedEntities: ["merch_m001", "apply_ap001"],
		payload: {
			description: "商户 M001 信息不完整，缺少联系人和手机号",
			causalEdgeId: "ce_merch_info_missing_channel_reject",
		},
	});

	// T-2d: Channel reject event — channel rejected the apply
	store.addEvent({
		id: "evt_channel_reject",
		type: "channel_reject",
		occurredAt: "2026-04-26T08:00:00.000Z",
		actorId: "channel_api",
		affectedEntities: ["apply_ap001"],
		payload: {
			description: "通道审核拒绝进件申请，原因：商户信息不完整",
			causalEdgeId: "ce_channel_reject_apply_fail",
		},
	});

	// T-1d: Apply fail event — apply AP001 status changed to FAIL
	store.addEvent({
		id: "evt_apply_fail",
		type: "apply_fail",
		occurredAt: "2026-04-27T09:00:00.000Z",
		actorId: "apply_scheduler",
		affectedEntities: ["apply_ap001"],
		payload: {
			description: "进件申请 AP001 状态变为 FAIL",
			statusReason: "商户信息不完整，通道拒绝",
			causalEdgeId: "ce_channel_reject_apply_fail",
		},
	});

	// T-0: Apply failure discovered
	store.addEvent({
		id: "evt_apply_failure_discovered",
		type: "apply_failure_discovered",
		occurredAt: "2026-04-28T09:00:00.000Z",
		actorId: "operator",
		affectedEntities: ["apply_ap001", "merch_m001", "agent_a001"],
		payload: {
			description: "发现进件申请 AP001 已失败，商户 M001 无法交易",
			reportedBy: "客服",
		},
	});

	return store;
}

// ── Full scenario setup ──

export function setupAgentMerchScenario(): {
	graph: Graph;
	factStore: FactStore;
	eventStore: EventStore;
	causalGraph: ReturnType<typeof buildAgentMerchCausalGraph>;
} {
	clearRules();
	registerAgentMerchRules();

	return {
		graph: seedAgentMerchGraph(),
		factStore: seedAgentMerchFactStore(),
		eventStore: seedAgentMerchEventStore(),
		causalGraph: buildAgentMerchCausalGraph(),
	};
}