import { z } from "zod";
import {
	AgentMethodRegistry,
	agentMethod,
	agentProperty,
	type MethodSchema,
} from "../runtime/decorator";
import { BaseNode, Graph } from "../runtime/graph";

// ── 场景：工程组织交付风险评估（V5 决策支持版）──────────────────
//
//  图拓扑（与 V4 相同）：
//
//    alice ──member_of──▶ team_frontend ◀──member_of── bob
//    carol ──member_of──▶ team_backend  ◀──member_of── dave
//                                       ◀──member_of── eve
//
//    alice, bob ──assigned_to──▶ project_portal ◀──owned_by── team_frontend
//    carol, dave, eve ──assigned_to──▶ project_api ◀──owned_by── team_backend
//
//    project_portal ──depends_on──▶ project_api
//
//  V5 区别：
//    - 方法使用对象参数（不再是位置参数）
//    - 方法标注 requiredFacts 和 relatedRuleIds
//    - 不在 prompt 中暴露全量实体目录
// ─────────────────────────────────────────────────────────────────

export class Engineer extends BaseNode {
	@agentProperty({ returns: "number", description: "每周工作小时数" })
	workload: number;

	@agentProperty({
		returns: "'junior' | 'mid' | 'senior'",
		description: "资历等级",
	})
	seniority: "junior" | "mid" | "senior";

	constructor(
		id: string,
		workload: number,
		seniority: "junior" | "mid" | "senior",
	) {
		super(id);
		this.workload = workload;
		this.seniority = seniority;
	}

	@agentMethod({
		returns: "{ risk: 'HIGH' | 'LOW'; threshold: number }",
		description:
			"基于资历阈值评估倦怠风险 (senior: 80h, mid: 70h, junior: 55h)",
		requiredFacts: ["workload", "seniority"],
		relatedRuleIds: ["engineer_burnout_threshold"],
	})
	assessBurnoutRisk(_args: Record<string, never> = {}): {
		risk: "HIGH" | "LOW";
		threshold: number;
	} {
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
	})
	checkOverload(args: { memberCount: number }): {
		overloaded: boolean;
		surplus: number;
	} {
		const surplus = this.capacity - args.memberCount;
		return { overloaded: surplus < 0, surplus };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Team");
	}
}

export class Project extends BaseNode {
	@agentProperty({
		returns: "'low' | 'medium' | 'high'",
		description: "业务优先级",
	})
	priority: "low" | "medium" | "high";

	deadlineRisk: number;

	constructor(
		id: string,
		priority: "low" | "medium" | "high",
		deadlineRisk: number,
	) {
		super(id);
		this.priority = priority;
		this.deadlineRisk = deadlineRisk;
	}

	@agentMethod({
		params: z.object({
			teamLoad: z.number(),
			seniorCount: z.number(),
		}),
		returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
		description: "基于团队总负载、高级工程师数量和内部截止日期压力评估交付风险",
		requiredFacts: ["teamLoad", "seniorCount"],
		relatedRuleIds: [
			"project_team_load",
			"senior_coverage",
			"high_priority_pressure",
		],
	})
	evaluateRisk(args: { teamLoad: number; seniorCount: number }): {
		risk: "HIGH" | "MEDIUM" | "LOW";
		reasons: string[];
	} {
		const reasons: string[] = [];

		if (args.teamLoad > 200) reasons.push(`团队超载 (${args.teamLoad}h 总计)`);
		if (args.seniorCount === 0) reasons.push("没有高级工程师");
		if (this.deadlineRisk > 0.75)
			reasons.push(`截止日期压力严重 (${this.deadlineRisk})`);
		else if (this.deadlineRisk > 0.5)
			reasons.push(`截止日期压力升高 (${this.deadlineRisk})`);

		let risk: "HIGH" | "MEDIUM" | "LOW";
		if (reasons.length >= 2) risk = "HIGH";
		else if (reasons.length === 1) risk = "MEDIUM";
		else risk = "LOW";

		return { risk, reasons };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Project");
	}
}

export function seedGraph(): Graph {
	const g = new Graph();

	const teamFrontend = new Team("team_frontend", "Product", 2);
	const teamBackend = new Team("team_backend", "Platform", 3);

	const alice = new Engineer("alice", 85, "senior");
	const bob = new Engineer("bob", 65, "mid");

	const carol = new Engineer("carol", 72, "senior");
	const dave = new Engineer("dave", 50, "mid");
	const eve = new Engineer("eve", 60, "junior");

	const projectPortal = new Project("project_portal", "high", 0.85);
	const projectApi = new Project("project_api", "medium", 0.55);

	g.addNode(teamFrontend);
	g.addNode(teamBackend);
	g.addNode(alice);
	g.addNode(bob);
	g.addNode(carol);
	g.addNode(dave);
	g.addNode(eve);
	g.addNode(projectPortal);
	g.addNode(projectApi);

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
