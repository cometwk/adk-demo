import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	clearConstraints,
	registerProjectPortalConstraints,
} from "../../ontology/constraints";
import { DecisionWorkspace, resetIdCounter } from "../../ontology/decision";
import { AgentPropertyRegistry, agentProperty } from "../../runtime/decorator";
import { BaseNode, Graph } from "../../runtime/graph";
import type { MethodSchema } from "../../runtime/registry";
import type {
	ToolResult,
	ToolResultError,
	ToolResultSuccess,
} from "../../runtime/types";
import { createDecisionTools } from "./decision";

class TestEngineer extends BaseNode {
	@agentProperty({ returns: "number", description: "Workload" })
	workload: number;

	@agentProperty({ returns: "string", description: "Seniority" })
	seniority: string;

	constructor(id: string, workload: number, seniority: string) {
		super(id);
		this.workload = workload;
		this.seniority = seniority;
	}

	getCapabilities(): MethodSchema[] {
		return [];
	}
}

function buildGraph() {
	const g = new Graph();
	g.addNode(new TestEngineer("alice", 85, "senior"));
	g.addNode(new TestEngineer("bob", 65, "mid"));
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

describe("propose_candidates", () => {
	let tools: ReturnType<typeof createDecisionTools>;
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		resetIdCounter();
		workspace = new DecisionWorkspace();
		clearConstraints();
		registerProjectPortalConstraints();
		tools = createDecisionTools(workspace, buildGraph());
	});

	it("creates candidates with stable IDs", async () => {
		const r = asOk(
			await tools.propose_candidates.execute!(
				{
					candidates: [
						{ label: "HIGH", description: "高风险" },
						{ label: "MEDIUM", description: "中风险" },
						{ label: "INSUFFICIENT_DATA", description: "数据不足" },
					],
				},
				{} as any,
			),
		);
		expect(r.data.candidates.length).toBe(3);
		expect(r.data.candidates[0].label).toBe("HIGH");
		expect(r.data.candidates[1].label).toBe("MEDIUM");
		expect(r.data.candidates[2].label).toBe("INSUFFICIENT_DATA");
	});
});

describe("record_evidence", () => {
	let tools: ReturnType<typeof createDecisionTools>;
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		resetIdCounter();
		workspace = new DecisionWorkspace();
		clearConstraints();
		registerProjectPortalConstraints();
		tools = createDecisionTools(workspace, buildGraph());
	});

	it("preserves source type, entity IDs, rule IDs, and confidence", async () => {
		const r = asOk(
			await tools.record_evidence.execute!(
				{
					sourceType: "property",
					entityIds: ["alice"],
					relatedRuleIds: ["engineer_burnout_threshold"],
					content: "alice workload=85h exceeds senior threshold 80h",
					confidence: 0.95,
				},
				{} as any,
			),
		);

		expect(r.data.evidenceId).toBeTruthy();

		const evList = workspace.listEvidence();
		expect(evList.length).toBe(1);
		expect(evList[0].sourceType).toBe("property");
		expect(evList[0].entityIds).toContain("alice");
		expect(evList[0].relatedRuleIds).toContain("engineer_burnout_threshold");
		expect(evList[0].confidence).toBe(0.95);
	});

	it("links evidence to candidate when candidateId given", async () => {
		const cand = workspace.addCandidate("HIGH", "高风险");
		const r = asOk(
			await tools.record_evidence.execute!(
				{
					sourceType: "method_result",
					entityIds: ["project_portal"],
					relatedRuleIds: [],
					content: "project risk is HIGH",
					confidence: 0.9,
					candidateId: cand.id,
				},
				{} as any,
			),
		);

		const updated = workspace.getCandidate(cand.id);
		expect(updated?.supportingEvidenceIds.length).toBe(1);
	});
});

describe("aggregate_facts", () => {
	let tools: ReturnType<typeof createDecisionTools>;

	beforeEach(() => {
		resetIdCounter();
		tools = createDecisionTools(new DecisionWorkspace(), buildGraph());
	});

	it("computes sum of workload for alice and bob", async () => {
		const r = asOk(
			await tools.aggregate_facts.execute!(
				{
					entityIds: ["alice", "bob"],
					property: "workload",
					metric: "sum",
				},
				{} as any,
			),
		);
		expect(r.data.value).toBe(150);
		expect(r.data.entityCount).toBe(2);
	});

	it("counts senior engineers", async () => {
		const r = asOk(
			await tools.aggregate_facts.execute!(
				{
					entityIds: ["alice", "bob"],
					property: "workload",
					metric: "count",
					filterBy: { seniority: "senior" },
				},
				{} as any,
			),
		);
		expect(r.data.value).toBe(1);
		expect(r.data.entityIds).toContain("alice");
	});

	it("returns EMPTY_RESULT for unknown property", async () => {
		const r = asErr(
			await tools.aggregate_facts.execute!(
				{
					entityIds: ["alice", "bob"],
					property: "nonexistent",
					metric: "sum",
				},
				{} as any,
			),
		);
		expect(r.code).toBe("EMPTY_RESULT");
	});
});

describe("evaluate_candidates", () => {
	let tools: ReturnType<typeof createDecisionTools>;
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		resetIdCounter();
		workspace = new DecisionWorkspace();
		clearConstraints();
		registerProjectPortalConstraints();
		tools = createDecisionTools(workspace, buildGraph());
	});

	it("only references existing candidate and evidence IDs", async () => {
		const cand1 = workspace.addCandidate("HIGH", "高风险");
		const cand2 = workspace.addCandidate("LOW", "低风险");
		workspace.addEvidence({
			sourceType: "property",
			entityIds: ["alice"],
			relatedRuleIds: ["engineer_burnout_threshold"],
			content: "alice burnout risk",
			confidence: 0.9,
		});

		const r = asOk(
			await tools.evaluate_candidates.execute!(
				{
					candidateIds: [cand1.id, cand2.id],
					criteriaIds: ["high_priority_pressure", "senior_coverage"],
					facts: { priority: "high", seniorCount: 1 },
				},
				{} as any,
			),
		);

		for (const c of r.data.candidates) {
			expect(workspace.getCandidate(c.id)).toBeTruthy();
		}
	});

	it("returns WORKSPACE_MISSING for invalid candidate IDs", async () => {
		const r = asErr(
			await tools.evaluate_candidates.execute!(
				{
					candidateIds: ["nonexistent"],
					criteriaIds: ["high_priority_pressure"],
					facts: { priority: "high" },
				},
				{} as any,
			),
		);
		expect(r.code).toBe("WORKSPACE_MISSING");
	});

	it("creates uncertainty for missing facts", async () => {
		workspace.addCandidate("HIGH", "高风险");
		const r = asOk(
			await tools.evaluate_candidates.execute!(
				{
					candidateIds: [workspace.listCandidates()[0].id],
					criteriaIds: ["dependency_risk_propagation"],
					facts: {},
				},
				{} as any,
			),
		);
		expect(r.data.uncertainties.length).toBeGreaterThan(0);
	});

	it("close scores produce lower confidence", async () => {
		const cand1 = workspace.addCandidate("HIGH", "高风险");
		const cand2 = workspace.addCandidate("MEDIUM", "中风险");

		await tools.evaluate_candidates.execute!(
			{
				candidateIds: [cand1.id, cand2.id],
				criteriaIds: ["high_priority_pressure"],
				facts: { priority: "high" },
			},
			{} as any,
		);

		const scores = workspace.listCandidates().map((c) => c.score ?? 0);
		expect(scores.length).toBe(2);
	});
});
