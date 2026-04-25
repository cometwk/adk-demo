import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { BaseNode, Graph } from "../../runtime/graph";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
} from "../../runtime/registry";
import type { MethodSchema } from "../../runtime/types";
import { createMethodTools } from "./method";

// ─────────────────────────────────────────────────────────────────────────────────
// 测试用的节点类
// ─────────────────────────────────────────────────────────────────────────────────

class TestProject extends BaseNode {
	priority: string;
	deadlineRisk: number;

	constructor(id: string, priority: string, deadlineRisk: number) {
		super(id);
		this.priority = priority;
		this.deadlineRisk = deadlineRisk;
	}

	evaluateRisk(
		teamLoad: number,
		seniorCount: number,
	): { risk: string; reasons: string[] } {
		const reasons: string[] = [];
		if (teamLoad > 200) reasons.push(`team overloaded (${teamLoad}h)`);
		if (seniorCount === 0) reasons.push("no senior engineers");
		if (this.deadlineRisk > 0.75)
			reasons.push(`deadline critical (${this.deadlineRisk})`);

		const risk =
			reasons.length >= 2 ? "HIGH" : reasons.length === 1 ? "MEDIUM" : "LOW";
		return { risk, reasons };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("TestProject");
	}

	getProperties(): Record<string, any> {
		return { priority: this.priority };
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────────────────────────────────────────

describe("Method Tools", () => {
	let graph: Graph;
	let tools: ReturnType<typeof createMethodTools>;

	beforeEach(() => {
		AgentMethodRegistry.clear();
		AgentPropertyRegistry.clear();

		// 注册方法 schema，带有 requiredFacts 和 relatedRuleIds
		AgentMethodRegistry.register("TestProject", "evaluateRisk", {
			methodName: "evaluateRisk",
			params: z.object({
				teamLoad: z.number().describe("Team total workload in hours"),
				seniorCount: z.number().describe("Number of senior engineers"),
			}),
			returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
			description:
				"Evaluate delivery risk based on team load and senior coverage",
			requiredFacts: [
				"assigned engineers workload",
				"assigned engineers seniority",
			],
			relatedRuleIds: [
				"project_team_load",
				"senior_coverage",
				"deadline_pressure",
			],
		});

		graph = new Graph();

		const projectPortal = new TestProject("project_portal", "high", 0.85);
		graph.addNode(projectPortal);

		tools = createMethodTools(graph);
	});

	describe("describe_method", () => {
		it("should describe method with params schema", async () => {
			const result = await tools.describe_method.execute({
				nodeId: "project_portal",
				method: "evaluateRisk",
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.description).toBe(
					"Evaluate delivery risk based on team load and senior coverage",
				);
				expect(result.data.returns).toContain("risk");
				expect(result.data.requiredFacts).toContain(
					"assigned engineers workload",
				);
				expect(result.data.requiredFacts).toContain(
					"assigned engineers seniority",
				);
				expect(result.data.relatedRuleIds).toContain("project_team_load");
				expect(result.data.relatedRuleIds).toContain("senior_coverage");
				expect(result.data.params.teamLoad).toBeDefined();
				expect(result.data.params.seniorCount).toBeDefined();
			}
		});

		it("should return not_found for unknown node", async () => {
			const result = await tools.describe_method.execute({
				nodeId: "unknown_node",
				method: "evaluateRisk",
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("not_found");
			}
		});

		it("should return method_not_found for unknown method", async () => {
			const result = await tools.describe_method.execute({
				nodeId: "project_portal",
				method: "unknownMethod",
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("method_not_found");
				if (result.error.expected) {
					expect(result.error.expected.available).toContain("evaluateRisk");
				}
			}
		});
	});

	describe("call_method", () => {
		it("should call method with valid args", async () => {
			const result = await tools.call_method.execute({
				nodeId: "project_portal",
				method: "evaluateRisk",
				args: { teamLoad: 150, seniorCount: 1 },
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.result).toBeDefined();
				expect(result.data.result.risk).toBeDefined();
				expect(result.data.triggeredRules).toContain("project_team_load");
				expect(result.data.triggeredRules).toContain("senior_coverage");
				expect(result.meta?.source).toBe("TestProject.evaluateRisk");
			}
		});

		it("should return invalid_args for missing required fields", async () => {
			const result = await tools.call_method.execute({
				nodeId: "project_portal",
				method: "evaluateRisk",
				args: { teamLoad: 150 }, // missing seniorCount
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("invalid_args");
				expect(result.error.message).toContain("seniorCount");
			}
		});

		it("should return invalid_args for wrong type", async () => {
			const result = await tools.call_method.execute({
				nodeId: "project_portal",
				method: "evaluateRisk",
				args: { teamLoad: "invalid", seniorCount: 1 }, // wrong type for teamLoad
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("invalid_args");
			}
		});

		it("should return not_found for unknown node", async () => {
			const result = await tools.call_method.execute({
				nodeId: "unknown_node",
				method: "evaluateRisk",
				args: { teamLoad: 150, seniorCount: 1 },
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("not_found");
			}
		});

		it("should return method_not_found for unknown method", async () => {
			const result = await tools.call_method.execute({
				nodeId: "project_portal",
				method: "unknownMethod",
				args: {},
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("method_not_found");
			}
		});
	});

	describe("golden flow: describe before call", () => {
		it("should allow describe_method before call_method", async () => {
			// Step 1: describe method
			const descResult = await tools.describe_method.execute({
				nodeId: "project_portal",
				method: "evaluateRisk",
			});

			expect(descResult.ok).toBe(true);
			if (descResult.ok) {
				// Step 2: use description to construct valid args
				const args = {
					teamLoad: descResult.data.params.teamLoad ? 150 : 0,
					seniorCount: descResult.data.params.seniorCount ? 1 : 0,
				};

				const callResult = await tools.call_method.execute({
					nodeId: "project_portal",
					method: "evaluateRisk",
					args,
				});

				expect(callResult.ok).toBe(true);
			}
		});
	});
});
