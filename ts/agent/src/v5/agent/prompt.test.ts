import { beforeEach, describe, expect, it } from "vitest";
import {
	clearConstraints,
	registerProjectPortalConstraints,
} from "../ontology/constraints";
import { projectOntology } from "../ontology/schema";
import { buildSystemPrompt } from "./prompt";

beforeEach(() => {
	clearConstraints();
	registerProjectPortalConstraints();
});

describe("buildSystemPrompt", () => {
	it("includes entry entity in prompt", () => {
		const prompt = buildSystemPrompt({
			goal: "评估 project_portal 的综合交付风险",
			entryEntities: ["project_portal"],
			ontology: projectOntology,
		});
		expect(prompt).toContain("project_portal");
	});

	it("includes type schema, relation schema, and rules summary", () => {
		const prompt = buildSystemPrompt({
			goal: "评估 project_portal 的综合交付风险",
			entryEntities: ["project_portal"],
			ontology: projectOntology,
		});
		expect(prompt).toContain("Engineer");
		expect(prompt).toContain("Team");
		expect(prompt).toContain("Project");
		expect(prompt).toContain("member_of");
		expect(prompt).toContain("depends_on");
		expect(prompt).toContain("engineer_burnout_threshold");
	});

	it("does not contain unrelated seed node IDs", () => {
		const prompt = buildSystemPrompt({
			goal: "评估 project_portal 的综合交付风险",
			entryEntities: ["project_portal"],
			ontology: projectOntology,
		});
		for (const name of ["alice", "bob", "carol", "dave", "eve"]) {
			expect(prompt).not.toContain(name);
		}
	});

	it("frames decision support, not single-answer reasoning", () => {
		const prompt = buildSystemPrompt({
			goal: "test goal",
			entryEntities: ["x"],
			ontology: projectOntology,
		});
		expect(prompt).toContain("候选");
		expect(prompt).toContain("证据");
		expect(prompt).toContain("不确定性");
	});
});
