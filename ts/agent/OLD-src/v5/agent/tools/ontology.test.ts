import { beforeEach, describe, expect, it } from "vitest";
import {
	clearConstraints,
	registerProjectPortalConstraints,
} from "../../ontology/constraints";
import { projectOntology } from "../../ontology/schema";
import type {
	ToolResult,
	ToolResultError,
	ToolResultSuccess,
} from "../../runtime/types";
import { createOntologyTools } from "./ontology";

function asOk(r: any): ToolResultSuccess & { data: any } {
	expect(r.ok).toBe(true);
	return r;
}

function asErr(r: any): ToolResultError & { expected?: any } {
	expect(r.ok).toBe(false);
	return r;
}

beforeEach(() => {
	clearConstraints();
	registerProjectPortalConstraints();
});

describe("inspect_schema", () => {
	const tools = createOntologyTools(projectOntology);

	it("returns all types when no typeName given", async () => {
		const r = asOk(await tools.inspect_schema.execute!({}, {} as any));
		const typeNames = r.data.types.map((t: any) => t.name);
		expect(typeNames).toContain("Engineer");
		expect(typeNames).toContain("Team");
		expect(typeNames).toContain("Project");
		expect(r.data.relations.length).toBeGreaterThan(0);
	});

	it("returns specific type with relations", async () => {
		const r = asOk(
			await tools.inspect_schema.execute!({ typeName: "Project" }, {} as any),
		);
		expect(r.data.type.name).toBe("Project");
		expect(r.data.relations.length).toBeGreaterThan(0);
	});

	it("returns NOT_FOUND for unknown type", async () => {
		const r = asErr(
			await tools.inspect_schema.execute!(
				{ typeName: "UnknownType" },
				{} as any,
			),
		);
		expect(r.code).toBe("NOT_FOUND");
		expect(r.expected?.availableTypes).toContain("Project");
	});
});

describe("inspect_rules", () => {
	const tools = createOntologyTools(projectOntology);

	it("returns constraints by intent", async () => {
		const r = asOk(
			await tools.inspect_rules.execute!(
				{ intent: "risk_assessment" },
				{} as any,
			),
		);
		const ruleIds = r.data.rules.map((r: any) => r.id);
		expect(ruleIds).toContain("engineer_burnout_threshold");
	});

	it("returns constraints by entity type and kind", async () => {
		const r = asOk(
			await tools.inspect_rules.execute!(
				{ entityType: "Project", kind: "soft_criterion" },
				{} as any,
			),
		);
		expect(r.data.rules.length).toBeGreaterThan(0);
		expect(r.data.rules.every((r: any) => r.kind === "soft_criterion")).toBe(
			true,
		);
	});

	it("returns empty result for unmatched filter", async () => {
		const r = asOk(
			await tools.inspect_rules.execute!(
				{ entityType: "UnknownType" },
				{} as any,
			),
		);
		expect(r.data.rules).toEqual([]);
		expect(r.data.count).toBe(0);
	});
});
