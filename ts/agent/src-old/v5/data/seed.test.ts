import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../agent/prompt";
import {
	clearConstraints,
	registerProjectPortalConstraints,
} from "../ontology/constraints";
import { projectOntology } from "../ontology/schema";
import { Engineer, type Project, seedGraph, Team } from "./seed";

describe("seed graph", () => {
	it("contains expected node IDs", () => {
		const g = seedGraph();
		for (const id of [
			"project_portal",
			"project_api",
			"team_frontend",
			"team_backend",
			"alice",
			"bob",
			"carol",
			"dave",
			"eve",
		]) {
			expect(g.getNode(id)).toBeTruthy();
		}
	});

	it("project_portal is high priority and depends on project_api", () => {
		const g = seedGraph();
		const portal = g.getNode("project_portal") as Project;
		expect(portal.priority).toBe("high");

		const outEdges = g.getOutEdges("project_portal");
		expect(outEdges.depends_on).toContain("project_api");
	});

	it("project_portal has assigned engineers", () => {
		const g = seedGraph();
		const inEdges = g.getInEdges("project_portal");
		expect(inEdges.assigned_to).toContain("alice");
		expect(inEdges.assigned_to).toContain("bob");
	});

	it("contains expected relation types", () => {
		const g = seedGraph();
		const types = new Set(g.edges.map((e) => e.type));
		expect(types.has("member_of")).toBe(true);
		expect(types.has("assigned_to")).toBe(true);
		expect(types.has("owned_by")).toBe(true);
		expect(types.has("depends_on")).toBe(true);
	});
});

describe("V5 progressive disclosure", () => {
	it("V5 prompt uses entry entity, not all node IDs", () => {
		clearConstraints();
		registerProjectPortalConstraints();

		const prompt = buildSystemPrompt({
			goal: "评估 project_portal 的综合交付风险",
			entryEntities: ["project_portal"],
			ontology: projectOntology,
		});

		expect(prompt).toContain("project_portal");
		for (const name of ["alice", "bob", "carol", "dave", "eve"]) {
			expect(prompt).not.toContain(name);
		}
	});
});

describe("V5 vs V4 comparison", () => {
	it("V5 methods use object args ABI", () => {
		const g = seedGraph();
		const portal = g.getNode("project_portal") as Project;
		const result = portal.evaluateRisk({ teamLoad: 150, seniorCount: 1 });
		expect(result.risk).toBeDefined();
		expect(result.reasons).toBeDefined();
	});

	it("V5 methods include requiredFacts and relatedRuleIds", () => {
		const g = seedGraph();
		const portal = g.getNode("project_portal") as Project;
		const caps = portal.getCapabilities();
		const evalRisk = caps.find((m) => m.methodName === "evaluateRisk");
		expect(evalRisk?.requiredFacts).toContain("teamLoad");
		expect(evalRisk?.relatedRuleIds).toContain("senior_coverage");
	});
});
