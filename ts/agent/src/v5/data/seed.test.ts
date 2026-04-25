import { beforeEach, describe, expect, it } from "vitest";
import { getRuleById } from "../ontology/constraints";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
} from "../runtime/registry";
import { defaultScenario, Engineer, Project, seedGraph, Team } from "./seed";

describe("V5 Seed Graph", () => {
	let graph: ReturnType<typeof seedGraph>;

	beforeEach(() => {
		// 注意：装饰器只在类首次定义时执行注册，不清空 AgentMethodRegistry
		// 只清空 PropertyRegistry（不影响方法测试）
		AgentPropertyRegistry.clear();
		graph = seedGraph();
	});

	describe("graph structure", () => {
		it("should contain expected node IDs", () => {
			const nodeIds = graph.getNodeIds();

			expect(nodeIds).toContain("alice");
			expect(nodeIds).toContain("bob");
			expect(nodeIds).toContain("carol");
			expect(nodeIds).toContain("dave");
			expect(nodeIds).toContain("eve");
			expect(nodeIds).toContain("team_frontend");
			expect(nodeIds).toContain("team_backend");
			expect(nodeIds).toContain("project_portal");
			expect(nodeIds).toContain("project_api");
		});

		it("should have correct node types", () => {
			expect(graph.getNode("alice")).toBeInstanceOf(Engineer);
			expect(graph.getNode("team_frontend")).toBeInstanceOf(Team);
			expect(graph.getNode("project_portal")).toBeInstanceOf(Project);
		});
	});

	describe("engineer nodes", () => {
		it("should have alice with high workload", () => {
			const alice = graph.getNode("alice") as Engineer;
			expect(alice.workload).toBe(85);
			expect(alice.seniority).toBe("senior");
		});

		it("should have bob with moderate workload", () => {
			const bob = graph.getNode("bob") as Engineer;
			expect(bob.workload).toBe(65);
			expect(bob.seniority).toBe("mid");
		});

		it("should have assessBurnoutRisk method", () => {
			const methods = AgentMethodRegistry.getMethodsForClass("Engineer");
			expect(
				methods.find((m) => m.methodName === "assessBurnoutRisk"),
			).toBeDefined();
		});
	});

	describe("project nodes", () => {
		it("should have project_portal as high priority with high deadline pressure", () => {
			const portal = graph.getNode("project_portal") as Project;
			expect(portal.priority).toBe("high");
			expect(portal.deadlineRisk).toBe(0.85);
		});

		it("should have project_api as medium priority", () => {
			const api = graph.getNode("project_api") as Project;
			expect(api.priority).toBe("medium");
			expect(api.deadlineRisk).toBe(0.55);
		});

		it("should have evaluateRisk method with related rule IDs", () => {
			const schema = AgentMethodRegistry.get("Project", "evaluateRisk");
			expect(schema).toBeDefined();
			expect(schema?.relatedRuleIds).toContain("project_team_load");
			expect(schema?.relatedRuleIds).toContain("senior_coverage");
			expect(schema?.relatedRuleIds).toContain("high_priority_pressure");
			expect(schema?.relatedRuleIds).toContain("deadline_pressure");
		});
	});

	describe("edges", () => {
		it("should have alice and bob assigned to project_portal", () => {
			const inEdges = graph.getInEdges("project_portal");
			expect(inEdges.assigned_to).toContain("alice");
			expect(inEdges.assigned_to).toContain("bob");
		});

		it("should have project_portal depends_on project_api", () => {
			const outEdges = graph.getOutEdges("project_portal");
			expect(outEdges.depends_on).toContain("project_api");
		});

		it("should have project_portal owned_by team_frontend", () => {
			const outEdges = graph.getOutEdges("project_portal");
			expect(outEdges.owned_by).toContain("team_frontend");
		});

		it("should have alice and bob member_of team_frontend", () => {
			const inEdges = graph.getInEdges("team_frontend");
			expect(inEdges.member_of).toContain("alice");
			expect(inEdges.member_of).toContain("bob");
		});
	});

	describe("methods", () => {
		it("should have evaluateRisk returning correct result", () => {
			const portal = graph.getNode("project_portal") as Project;
			const result = portal.evaluateRisk(150, 1);

			expect(result.risk).toBeDefined();
			expect(result.reasons.length).toBeGreaterThan(0);
			expect(
				result.reasons.some((r) => r.includes("deadline pressure critical")),
			).toBe(true);
		});

		it("should have assessBurnoutRisk returning HIGH for alice", () => {
			const alice = graph.getNode("alice") as Engineer;
			const result = alice.assessBurnoutRisk();

			expect(result.risk).toBe("HIGH");
			expect(result.threshold).toBe(80);
		});
	});

	describe("default scenario", () => {
		it("should have goal for project_portal risk assessment", () => {
			expect(defaultScenario.goal).toContain("project_portal");
			expect(defaultScenario.goal).toContain("风险");
		});

		it("should have project_portal as entry entity", () => {
			expect(defaultScenario.entryEntities).toContain("project_portal");
		});
	});

	describe("V5 vs V4 comparison", () => {
		it("should have method with requiredFacts (V5 feature)", () => {
			const schema = AgentMethodRegistry.get("Project", "evaluateRisk");
			expect(schema?.requiredFacts).toBeDefined();
			expect(schema?.requiredFacts?.length).toBeGreaterThan(0);
		});

		it("should have method with relatedRuleIds (V5 feature)", () => {
			const schema = AgentMethodRegistry.get("Project", "evaluateRisk");
			expect(schema?.relatedRuleIds).toBeDefined();
			expect(schema?.relatedRuleIds?.length).toBeGreaterThan(0);

			// 验证规则 ID 存在于约束中
			for (const ruleId of schema!.relatedRuleIds!) {
				expect(getRuleById(ruleId)).toBeDefined();
			}
		});
	});
});
