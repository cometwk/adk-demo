import { beforeEach, describe, expect, it } from "vitest";
import { initializeConstraints } from "../ontology/constraints";
import { BaseNode, Graph } from "../runtime/graph";
import { AgentMethodRegistry } from "../runtime/registry";
import { buildSystemPrompt } from "./prompt";

// 简化的测试节点
class TestProject extends BaseNode {
	constructor(id: string) {
		super(id);
	}
	getCapabilities() {
		return [];
	}
}

describe("V5 Prompt", () => {
	beforeEach(() => {
		AgentMethodRegistry.clear();
		initializeConstraints();
	});

	it("should include entry entities in prompt", () => {
		const graph = new Graph();
		graph.addNode(new TestProject("project_portal"));

		const prompt = buildSystemPrompt({
			goal: "评估 project_portal 的综合交付风险",
			entryEntities: ["project_portal"],
			graph,
		});

		expect(prompt).toContain("project_portal");
		expect(prompt).toContain("ENTRY ENTITIES:");
	});

	it("should include type schema summary", () => {
		const graph = new Graph();

		const prompt = buildSystemPrompt({
			goal: "test",
			entryEntities: [],
			graph,
		});

		expect(prompt).toContain("Types:");
		expect(prompt).toContain("Engineer");
		expect(prompt).toContain("Project");
		expect(prompt).toContain("Team");
	});

	it("should include relation schema summary", () => {
		const graph = new Graph();

		const prompt = buildSystemPrompt({
			goal: "test",
			entryEntities: [],
			graph,
		});

		expect(prompt).toContain("Relation schema:");
		expect(prompt).toContain("member_of");
		expect(prompt).toContain("assigned_to");
		expect(prompt).toContain("depends_on");
	});

	it("should include rules summary for risk assessment", () => {
		const graph = new Graph();

		const prompt = buildSystemPrompt({
			goal: "评估风险",
			entryEntities: [],
			graph,
		});

		expect(prompt).toContain("Decision criteria");
		expect(prompt).toContain("project_team_load");
		expect(prompt).toContain("senior_coverage");
		expect(prompt).toContain("dependency_risk_propagation");
	});

	it("should NOT include all node IDs from graph", () => {
		const graph = new Graph();
		graph.addNode(new TestProject("project_portal"));
		graph.addNode(new TestProject("project_api"));
		graph.addNode(new TestProject("alice"));
		graph.addNode(new TestProject("bob"));

		const prompt = buildSystemPrompt({
			goal: "test",
			entryEntities: ["project_portal"], // 只有这个是入口实体
			graph,
		});

		// 入口实体应该出现
		expect(prompt).toContain("project_portal");

		// 其他实体不应该作为目录列出（不同于 V4）
		// 注意：这只是检查 prompt 的 "Nodes:" 目录部分不存在
		// entity IDs 可能出现在其他上下文中，但不是全量目录
		expect(prompt).not.toContain("Nodes:");
		expect(prompt).not.toMatch(/alice.*bob.*project_api/); // 不应该有全量列表
	});

	it("should include decision process guidance", () => {
		const graph = new Graph();

		const prompt = buildSystemPrompt({
			goal: "test",
			entryEntities: [],
			graph,
		});

		expect(prompt).toContain("DECISION PROCESS");
		expect(prompt).toContain("propose_candidates");
		expect(prompt).toContain("record_evidence");
		expect(prompt).toContain("evaluate_candidates");
	});

	it("should include output format guidance", () => {
		const graph = new Graph();

		const prompt = buildSystemPrompt({
			goal: "test",
			entryEntities: [],
			graph,
		});

		expect(prompt).toContain("OUTPUT FORMAT");
		expect(prompt).toContain("推荐判断");
		expect(prompt).toContain("备选判断");
		expect(prompt).toContain("关键证据");
		expect(prompt).toContain("不确定性");
	});
});
