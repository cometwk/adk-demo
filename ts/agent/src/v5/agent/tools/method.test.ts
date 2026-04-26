import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
	agentMethod,
	agentProperty,
} from "../../runtime/decorator";
import { BaseNode, Graph } from "../../runtime/graph";
import type { MethodSchema } from "../../runtime/registry";
import type {
	ToolResult,
	ToolResultError,
	ToolResultSuccess,
} from "../../runtime/types";
import { createMethodTools } from "./method";

class TestProject extends BaseNode {
	@agentProperty({ returns: "'high'", description: "Priority" })
	priority = "high";

	deadlineRisk = 0.85;

	@agentMethod({
		params: z.object({ teamLoad: z.number(), seniorCount: z.number() }),
		returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
		description: "Evaluate delivery risk",
		requiredFacts: ["teamLoad", "seniorCount"],
		relatedRuleIds: [
			"project_team_load",
			"senior_coverage",
			"high_priority_pressure",
		],
	})
	evaluateRisk(args: { teamLoad: number; seniorCount: number }) {
		const reasons: string[] = [];
		if (args.teamLoad > 200) reasons.push("team overloaded");
		if (args.seniorCount === 0) reasons.push("no senior engineers");
		if (this.deadlineRisk > 0.75) reasons.push("deadline pressure critical");
		const risk =
			reasons.length >= 2 ? "HIGH" : reasons.length === 1 ? "MEDIUM" : "LOW";
		return { risk, reasons };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("TestProject");
	}
}

function buildGraph() {
	const g = new Graph();
	g.addNode(new TestProject("project_portal"));
	return g;
}

function asOk(r: any): ToolResultSuccess & { data: any } {
	expect(r.ok).toBe(true);
	return r;
}

function asErr(r: any): ToolResultError & { expected?: any } {
	expect(r.ok).toBe(false);
	return r;
}

describe("describe_method", () => {
	let tools: ReturnType<typeof createMethodTools>;

	beforeEach(() => {
		tools = createMethodTools(buildGraph());
	});

	it("returns full schema for evaluateRisk", async () => {
		const r = asOk(
			await tools.describe_method.execute!(
				{ nodeId: "project_portal", method: "evaluateRisk" },
				{} as any,
			),
		);
		expect(r.data.methodName).toBe("evaluateRisk");
		expect(r.data.params).toHaveProperty("teamLoad");
		expect(r.data.params).toHaveProperty("seniorCount");
		expect(r.data.returns).toContain("risk");
		expect(r.data.requiredFacts).toContain("teamLoad");
		expect(r.data.relatedRuleIds).toContain("senior_coverage");
	});

	it("returns METHOD_NOT_FOUND for unknown method", async () => {
		const r = asErr(
			await tools.describe_method.execute!(
				{ nodeId: "project_portal", method: "nonexistent" },
				{} as any,
			),
		);
		expect(r.code).toBe("METHOD_NOT_FOUND");
		expect(r.expected?.availableMethods).toContain("evaluateRisk");
	});

	it("returns NOT_FOUND for unknown node", async () => {
		const r = asErr(
			await tools.describe_method.execute!(
				{ nodeId: "nonexistent", method: "evaluateRisk" },
				{} as any,
			),
		);
		expect(r.code).toBe("NOT_FOUND");
	});
});

describe("call_method", () => {
	let tools: ReturnType<typeof createMethodTools>;

	beforeEach(() => {
		tools = createMethodTools(buildGraph());
	});

	it("calls evaluateRisk with object args", async () => {
		const r = asOk(
			await tools.call_method.execute!(
				{
					nodeId: "project_portal",
					method: "evaluateRisk",
					args: { teamLoad: 150, seniorCount: 1 },
				},
				{} as any,
			),
		);
		expect(r.data).toHaveProperty("risk");
		expect(r.data).toHaveProperty("reasons");
	});

	it("receives named values correctly regardless of key order", async () => {
		const r1 = asOk(
			await tools.call_method.execute!(
				{
					nodeId: "project_portal",
					method: "evaluateRisk",
					args: { seniorCount: 0, teamLoad: 250 },
				},
				{} as any,
			),
		);
		const r2 = asOk(
			await tools.call_method.execute!(
				{
					nodeId: "project_portal",
					method: "evaluateRisk",
					args: { teamLoad: 250, seniorCount: 0 },
				},
				{} as any,
			),
		);
		expect(r1.data).toEqual(r2.data);
		expect(r1.data.risk).toBe("HIGH");
	});

	it("returns INVALID_ARGS for missing required args", async () => {
		const r = asErr(
			await tools.call_method.execute!(
				{ nodeId: "project_portal", method: "evaluateRisk", args: {} },
				{} as any,
			),
		);
		expect(r.code).toBe("INVALID_ARGS");
	});

	it("returns METHOD_NOT_FOUND for unknown method", async () => {
		const r = asErr(
			await tools.call_method.execute!(
				{ nodeId: "project_portal", method: "nonexistent", args: {} },
				{} as any,
			),
		);
		expect(r.code).toBe("METHOD_NOT_FOUND");
		expect(r.expected?.availableMethods).toContain("evaluateRisk");
	});
});

describe("describe before call golden trace", () => {
	it("describe_method appears before successful call_method", async () => {
		const tools = createMethodTools(buildGraph());
		const trace: string[] = [];

		const descResult: any = await tools.describe_method.execute!(
			{ nodeId: "project_portal", method: "evaluateRisk" },
			{} as any,
		);
		trace.push("describe_method");
		expect(descResult.ok).toBe(true);

		const callResult: any = await tools.call_method.execute!(
			{
				nodeId: "project_portal",
				method: "evaluateRisk",
				args: { teamLoad: 150, seniorCount: 1 },
			},
			{} as any,
		);
		trace.push("call_method");
		expect(callResult.ok).toBe(true);

		expect(trace.indexOf("describe_method")).toBeLessThan(
			trace.indexOf("call_method"),
		);
	});
});
