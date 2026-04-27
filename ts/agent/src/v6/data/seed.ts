import { z } from "zod";
import {
	AgentMethodRegistry,
	agentMethod,
	agentProperty,
	type MethodSchema,
} from "../runtime/decorator";
import { BaseNode, Graph } from "../runtime/graph";
import { EventStore, FactStore } from "../runtime/eventStore";
import { buildProjectPortalCausalGraph } from "../ontology/causal";
import type { FactBinding } from "../runtime/types";
import { registerProjectPortalRules, clearRules } from "../ontology/rules";

// ── Entity classes (same topology as V5, with typed properties) ──

export class Engineer extends BaseNode {
	@agentProperty({ returns: "number", description: "每周工作小时数" })
	workload: number;

	@agentProperty({ returns: "'junior' | 'mid' | 'senior'", description: "资历等级" })
	seniority: "junior" | "mid" | "senior";

	constructor(id: string, workload: number, seniority: "junior" | "mid" | "senior") {
		super(id);
		this.workload = workload;
		this.seniority = seniority;
	}

	@agentMethod({
		returns: "{ risk: 'HIGH' | 'LOW'; threshold: number }",
		description: "基于资历阈值评估倦怠风险 (senior: 80h, mid: 70h, junior: 55h)",
		requiredFacts: ["workload", "seniority"],
		relatedRuleIds: ["engineer_burnout_threshold"],
	})
	assessBurnoutRisk(_args: Record<string, never> = {}): { risk: "HIGH" | "LOW"; threshold: number } {
		const thresholds = { senior: 80, mid: 70, junior: 55 } as const;
		const threshold = thresholds[this.seniority];
		return { risk: this.workload > threshold ? "HIGH" : "LOW", threshold };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Engineer");
	}
}

export class Team extends BaseNode {
	@agentProperty({ returns: "string", description: "所属部门" })
	department: string;

	@agentProperty({ returns: "number", description: "最大并行项目数" })
	capacity: number;

	constructor(id: string, department: string, capacity: number) {
		super(id);
		this.department = department;
		this.capacity = capacity;
	}

	@agentMethod({
		params: z.object({ memberCount: z.number() }),
		returns: "{ overloaded: boolean; surplus: number }",
		description: "检查团队是否超载",
		requiredFacts: ["memberCount", "capacity"],
		relatedRuleIds: ["team_capacity_overload"],
		preconditions: [
			{
				param: "memberCount",
				check: "must_be_positive",
				description: "memberCount must come from a real graph query",
			},
		],
	})
	checkOverload(args: { memberCount: number }): { overloaded: boolean; surplus: number } {
		const surplus = this.capacity - args.memberCount;
		return { overloaded: surplus < 0, surplus };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Team");
	}
}

export class Project extends BaseNode {
	@agentProperty({ returns: "'low' | 'medium' | 'high'", description: "业务优先级" })
	priority: "low" | "medium" | "high";

	deadlineRisk: number;

	constructor(id: string, priority: "low" | "medium" | "high", deadlineRisk: number) {
		super(id);
		this.priority = priority;
		this.deadlineRisk = deadlineRisk;
	}

	@agentMethod({
		params: z.object({ teamLoad: z.number(), seniorCount: z.number() }),
		returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
		description: "基于团队总负载、高级工程师数量和截止日期压力评估交付风险",
		requiredFacts: ["teamLoad", "seniorCount"],
		relatedRuleIds: ["project_team_load", "senior_coverage", "high_priority_pressure"],
		preconditions: [
			{
				param: "teamLoad",
				check: "must_be_positive",
				description: "teamLoad must be aggregated from real engineer workloads",
			},
		],
	})
	evaluateRisk(args: { teamLoad: number; seniorCount: number }): {
		risk: "HIGH" | "MEDIUM" | "LOW";
		reasons: string[];
	} {
		const reasons: string[] = [];
		if (args.teamLoad > 200) reasons.push(`团队超载 (${args.teamLoad}h 总计)`);
		if (args.seniorCount === 0) reasons.push("没有高级工程师");
		if (this.deadlineRisk > 0.75) reasons.push(`截止日期压力严重 (${this.deadlineRisk})`);
		else if (this.deadlineRisk > 0.5) reasons.push(`截止日期压力升高 (${this.deadlineRisk})`);
		const risk: "HIGH" | "MEDIUM" | "LOW" =
			reasons.length >= 2 ? "HIGH" : reasons.length === 1 ? "MEDIUM" : "LOW";
		return { risk, reasons };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Project");
	}
}

// ── Graph seed (same topology as V5) ──

export function seedGraph(): Graph {
	const g = new Graph();

	const teamFrontend = new Team("team_frontend", "Product", 2);
	const teamBackend = new Team("team_backend", "Platform", 3);

	const alice = new Engineer("alice", 85, "senior");    // over 80h threshold → burnout
	const bob = new Engineer("bob", 65, "mid");
	const carol = new Engineer("carol", 72, "senior");    // over 70h? No, threshold is 80; fine
	const dave = new Engineer("dave", 50, "mid");
	const eve = new Engineer("eve", 60, "junior");       // over 55h → burnout

	const projectPortal = new Project("project_portal", "high", 0.85);
	const projectApi = new Project("project_api", "medium", 0.55);

	for (const node of [teamFrontend, teamBackend, alice, bob, carol, dave, eve, projectPortal, projectApi]) {
		g.addNode(node);
	}

	g.addEdge({ from: "alice", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "bob", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "carol", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "dave", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "eve", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "alice", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "bob", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "carol", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "dave", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "eve", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "project_portal", to: "team_frontend", type: "owned_by" });
	g.addEdge({ from: "project_api", to: "team_backend", type: "owned_by" });
	g.addEdge({ from: "project_portal", to: "project_api", type: "depends_on" });

	return g;
}

// ── Initial FactStore snapshot ──
// Binds current property values from graph nodes for predictive session.

export function seedFactStore(): FactStore {
	const now = "2026-04-27T00:00:00.000Z";
	const bindings: FactBinding[] = [
		// Engineers
		{ entityId: "alice", property: "workload", value: 85, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "alice", property: "seniority", value: "senior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "bob", property: "workload", value: 65, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "bob", property: "seniority", value: "mid", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "carol", property: "workload", value: 72, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "carol", property: "seniority", value: "senior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "dave", property: "workload", value: 50, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "dave", property: "seniority", value: "mid", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "eve", property: "workload", value: 60, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "eve", property: "seniority", value: "junior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Teams
		{ entityId: "team_frontend", property: "capacity", value: 2, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "team_backend", property: "capacity", value: 3, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Projects
		{ entityId: "project_portal", property: "priority", value: "high", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "priority", value: "medium", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Derived / aggregated
		{ entityId: "project_portal", property: "teamLoad", value: 150, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now }, // alice 85 + bob 65
		{ entityId: "project_portal", property: "seniorCount", value: 1, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "teamLoad", value: 182, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "seniorCount", value: 1, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		// Member counts
		{ entityId: "team_frontend", property: "memberCount", value: 2, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "team_backend", property: "memberCount", value: 3, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now },
	];
	return new FactStore(bindings);
}

// ── EventStore seed (V6.5 diagnostic scenario) ──
// Timeline for project_portal delay root cause analysis demo.

export function seedEventStore(): EventStore {
	const store = new EventStore();

	// 2026-04-08: Scope added to project_portal
	store.addEvent({
		id: "evt_scope_added",
		type: "scope_added",
		occurredAt: "2026-04-08T09:00:00.000Z",
		actorId: "product_manager",
		affectedEntities: ["project_portal"],
		payload: {
			featureCount: 3,
			estimatedDaysAdded: 10,
			causalEdgeId: "ce_scope_added_pressure",
		},
	});

	// 2026-04-10: Alice's workload spikes (scope added → pressure)
	store.addEvent({
		id: "evt_alice_workload_spike",
		type: "workload_changed",
		occurredAt: "2026-04-10T09:00:00.000Z",
		actorId: "system",
		affectedEntities: ["alice"],
		payload: { from: 75, to: 92, causalEdgeId: "ce_workload_burnout" },
		derivedBindings: [
			{
				entityId: "alice",
				property: "workload",
				value: 92,
				source: { kind: "derived", ref: "evt_alice_workload_spike" },
				confidence: 1.0,
				validFrom: "2026-04-10T09:00:00.000Z",
				observedAt: "2026-04-10T09:00:00.000Z",
			},
		],
	});

	// 2026-04-15: project_api misses API delivery (dependency slip)
	store.addEvent({
		id: "evt_api_delivery_slip",
		type: "delivery_slip",
		occurredAt: "2026-04-15T17:00:00.000Z",
		actorId: "team_backend",
		affectedEntities: ["project_api", "project_portal"],
		payload: {
			delayDays: 7,
			reason: "Backend capacity overloaded",
			causalEdgeId: "ce_dep_slip_portal_blocked",
		},
	});

	// 2026-04-16: project_portal becomes blocked
	store.addEvent({
		id: "evt_portal_blocked",
		type: "downstream_blocked",
		occurredAt: "2026-04-16T09:00:00.000Z",
		actorId: "system",
		affectedEntities: ["project_portal"],
		payload: {
			blockedBy: "project_api",
			causalEdgeId: "ce_blocked_milestone_miss",
		},
	});

	// 2026-04-21: project_portal milestone missed
	store.addEvent({
		id: "evt_milestone_missed",
		type: "milestone_missed",
		occurredAt: "2026-04-21T23:59:00.000Z",
		actorId: "system",
		affectedEntities: ["project_portal"],
		payload: {
			milestoneName: "v2.0 feature complete",
			originalDeadline: "2026-04-21",
			newDeadline: "2026-05-05",
		},
	});

	return store;
}

// ── Rule fixtures for unit tests ──

export { buildProjectPortalCausalGraph } from "../ontology/causal";

// ── Full scenario setup ──

export function setupScenario(): {
	graph: Graph;
	factStore: FactStore;
	eventStore: EventStore;
	causalGraph: ReturnType<typeof buildProjectPortalCausalGraph>;
} {
	clearRules();
	// NOTE: Do NOT clear AgentMethodRegistry — @agentMethod decorators run at class-definition
	// time and cannot be re-registered without reloading the module.
	registerProjectPortalRules();

	return {
		graph: seedGraph(),
		factStore: seedFactStore(),
		eventStore: seedEventStore(),
		causalGraph: buildProjectPortalCausalGraph(),
	};
}
