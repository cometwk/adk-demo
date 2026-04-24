import { z } from "zod";
import {
	AgentMethodRegistry,
	agentMethod,
	agentProperty,
	type MethodSchema,
} from "../runtime/decorator";
import { BaseNode, Graph } from "../runtime/graph";

// ── 场景：工程组织交付风险评估 ────────────────────────────────────
//
//  图拓扑：
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
//  目标：评估 project_portal 的综合交付风险
//    - 前端团队是否超载？
//    - 依赖的后端项目 project_api 是否高风险？
//    - 综合得出最终交付结论
// ─────────────────────────────────────────────────────────────────

// ────────── Engineer 节点 ──────────────────────────────────────────

export class Engineer extends BaseNode {
	@agentProperty({ returns: "number", description: "Weekly workload in hours" })
	workload: number;

	@agentProperty({
		returns: "'junior' | 'mid' | 'senior'",
		description: "Engineer seniority level",
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
			"Assess burnout risk based on seniority-aware workload threshold (senior: 80h, mid: 70h, junior: 55h)",
	})
	assessBurnoutRisk(): { risk: "HIGH" | "LOW"; threshold: number } {
		const thresholds = { senior: 80, mid: 70, junior: 55 } as const;
		const threshold = thresholds[this.seniority];
		return { risk: this.workload > threshold ? "HIGH" : "LOW", threshold };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Engineer");
	}
}

// ────────── Team 节点 ─────────────────────────────────────────────

export class Team extends BaseNode {
	@agentProperty({ returns: "string", description: "Department the team belongs to" })
	department: string;

	@agentProperty({
		returns: "number",
		description: "Maximum number of concurrent project assignments the team can handle",
	})
	capacity: number;

	constructor(id: string, department: string, capacity: number) {
		super(id);
		this.department = department;
		this.capacity = capacity;
	}

	@agentMethod({
		params: z.object({ memberCount: z.number() }),
		returns: "{ overloaded: boolean; surplus: number }",
		description: "Check if the team is overloaded given the current active member count",
	})
	checkOverload(memberCount: number): { overloaded: boolean; surplus: number } {
		const surplus = this.capacity - memberCount;
		return { overloaded: surplus < 0, surplus };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("Team");
	}
}

// ────────── Project 节点 ──────────────────────────────────────────

export class Project extends BaseNode {
	@agentProperty({
		returns: "'low' | 'medium' | 'high'",
		description: "Business priority of this project",
	})
	priority: "low" | "medium" | "high";

	// deadlineRisk 是内部字段，不加 @agentProperty，LLM 不可直接读取
	// LLM 必须通过 evaluateRisk() 间接感知它的影响
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
		description:
			"Evaluate delivery risk based on team's total workload, senior engineer count, and internal deadline pressure",
	})
	evaluateRisk(
		teamLoad: number,
		seniorCount: number,
	): { risk: "HIGH" | "MEDIUM" | "LOW"; reasons: string[] } {
		const reasons: string[] = [];

		if (teamLoad > 200) reasons.push(`team overloaded (${teamLoad}h total)`);
		if (seniorCount === 0) reasons.push("no senior engineers assigned");
		if (this.deadlineRisk > 0.75) reasons.push(`deadline pressure critical (${this.deadlineRisk})`);
		else if (this.deadlineRisk > 0.5) reasons.push(`deadline pressure elevated (${this.deadlineRisk})`);

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

// ────────── 图初始化 ──────────────────────────────────────────────

export function seedGraph(): Graph {
	const g = new Graph();

	// 团队
	const teamFrontend = new Team("team_frontend", "Product", 2);
	const teamBackend = new Team("team_backend", "Platform", 3);

	// 前端工程师：alice 高负载资深 + bob 中等负载
	const alice = new Engineer("alice", 85, "senior"); // 超出 senior 阈值(80h)
	const bob = new Engineer("bob", 65, "mid");

	// 后端工程师：carol 接近上限 + dave 正常 + eve 高负载但 junior
	const carol = new Engineer("carol", 72, "senior");
	const dave = new Engineer("dave", 50, "mid");
	const eve = new Engineer("eve", 60, "junior"); // 超出 junior 阈值(55h)

	// 项目
	const projectPortal = new Project("project_portal", "high", 0.85); // 高优先级，截止日期压力大
	const projectApi = new Project("project_api", "medium", 0.55);     // 中优先级，有一定压力

	// 添加节点
	g.addNode(teamFrontend);
	g.addNode(teamBackend);
	g.addNode(alice);
	g.addNode(bob);
	g.addNode(carol);
	g.addNode(dave);
	g.addNode(eve);
	g.addNode(projectPortal);
	g.addNode(projectApi);

	// 团队成员关系
	g.addEdge({ from: "alice", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "bob", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "carol", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "dave", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "eve", to: "team_backend", type: "member_of" });

	// 项目分配关系
	g.addEdge({ from: "alice", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "bob", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "carol", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "dave", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "eve", to: "project_api", type: "assigned_to" });

	// 项目归属
	g.addEdge({ from: "project_portal", to: "team_frontend", type: "owned_by" });
	g.addEdge({ from: "project_api", to: "team_backend", type: "owned_by" });

	// 项目依赖：project_portal 的交付依赖 project_api 先就绪
	g.addEdge({ from: "project_portal", to: "project_api", type: "depends_on" });

	return g;
}

// ────────── 配套的黑板 Schema（供 index.ts 使用）──────────────────
//
// 预期推理链（接入真实 LLM 后验证）：
//
//  1. read_node { node: "project_portal" }
//     → edges: { owned_by: ["team_frontend"], depends_on: ["project_api"] }
//  2. traverse { from: "team_frontend", relation: ... }  或
//     read_node { node: "team_frontend" }
//     → edges: 得知成员 alice, bob
//  3. read_node { node: "alice" } → { workload: 85, seniority: "senior" }
//  4. update_state { key: "portalTeamLoad", value: 85 }
//  5. update_state { key: "portalSeniorCount", value: 1 }
//  6. read_node { node: "bob" } → { workload: 65, seniority: "mid" }
//  7. update_state { key: "portalTeamLoad", value: 150 }
//  8. read_node { node: "project_api" }   ← 顺着 depends_on 边检查依赖
//     → edges: { owned_by: ["team_backend"] }
//  9. (读后端团队成员 carol/dave/eve，累积后端负载)
// 10. call { node: "project_portal", method: "evaluateRisk",
//            args: { teamLoad: 150, seniorCount: 1 } }
//     → { risk: "HIGH", reasons: ["deadline pressure critical (0.85)"] }
// 11. stop { reason: "project_portal is HIGH risk: ..." }
//
export const portalWorkflowSchema = z.object({
	portalTeamLoad: z.number().default(0),
	portalSeniorCount: z.number().default(0),
	apiTeamLoad: z.number().default(0),
	apiRisk: z.string().default("unknown"),
});
