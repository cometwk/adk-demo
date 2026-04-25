import { beforeEach, describe, expect, it } from "vitest";
import type {
	CandidateAnswer,
	Evidence,
	Uncertainty,
} from "../ontology/decision";
import { DecisionWorkspace } from "../ontology/decision";

describe("DecisionWorkspace", () => {
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		workspace = new DecisionWorkspace();
	});

	describe("setup", () => {
		it("should initialize question, intent and entry entities", () => {
			workspace.setup("评估 project_portal 的综合交付风险", "risk_assessment", [
				"project_portal",
			]);

			expect(workspace.getQuestion()).toBe(
				"评估 project_portal 的综合交付风险",
			);
			expect(workspace.getIntent()).toBe("risk_assessment");
			expect(workspace.getEntryEntities()).toEqual(["project_portal"]);
		});
	});

	describe("evidence operations", () => {
		it("should record evidence with stable ID", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const evidence = workspace.recordEvidence({
				source: "node",
				statement: "alice workload = 85",
				entityIds: ["alice"],
				confidence: 1,
			});

			expect(evidence.id).toBe("evidence_1");
			expect(evidence.source).toBe("node");
			expect(evidence.statement).toBe("alice workload = 85");
		});

		it("should generate sequential evidence IDs", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const e1 = workspace.recordEvidence({
				source: "node",
				statement: "evidence 1",
				entityIds: ["a"],
				confidence: 1,
			});
			const e2 = workspace.recordEvidence({
				source: "node",
				statement: "evidence 2",
				entityIds: ["b"],
				confidence: 1,
			});

			expect(e1.id).toBe("evidence_1");
			expect(e2.id).toBe("evidence_2");
		});

		it("should retrieve evidence by ID", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const recorded = workspace.recordEvidence({
				source: "node",
				statement: "test",
				entityIds: ["a"],
				confidence: 1,
			});

			const retrieved = workspace.getEvidence(recorded.id);
			expect(retrieved).toEqual(recorded);
		});

		it("should get all evidence", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			workspace.recordEvidence({
				source: "node",
				statement: "e1",
				entityIds: ["a"],
				confidence: 1,
			});
			workspace.recordEvidence({
				source: "node",
				statement: "e2",
				entityIds: ["b"],
				confidence: 1,
			});

			const all = workspace.getAllEvidence();
			expect(all.length).toBe(2);
		});
	});

	describe("candidate operations", () => {
		it("should propose candidate with stable ID", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const candidate = workspace.proposeCandidate({
				answer: "HIGH",
				summary: "高风险",
				confidence: 0.8,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
			});

			expect(candidate.id).toBe("candidate_1");
			expect(candidate.answer).toBe("HIGH");
		});

		it("should update existing candidate", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const candidate = workspace.proposeCandidate({
				answer: "HIGH",
				summary: "高风险",
				confidence: 0.5,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
			});

			const updated = workspace.updateCandidate(candidate.id, {
				confidence: 0.8,
				supportingEvidenceIds: ["evidence_1"],
			});

			expect(updated).toBe(true);
			const retrieved = workspace.getCandidate(candidate.id);
			expect(retrieved?.confidence).toBe(0.8);
			expect(retrieved?.supportingEvidenceIds).toEqual(["evidence_1"]);
		});

		it("should return false when updating non-existent candidate", () => {
			const result = workspace.updateCandidate("nonexistent", {
				confidence: 0.9,
			});
			expect(result).toBe(false);
		});
	});

	describe("uncertainty operations", () => {
		it("should add uncertainty with stable ID", () => {
			workspace.setup("test", "risk_assessment", ["test"]);

			const uncertainty = workspace.addUncertainty({
				missingFact: "deadline",
				impact: "high",
				suggestedQuery: "query project_portal deadline",
			});

			expect(uncertainty.id).toBe("uncertainty_1");
			expect(uncertainty.missingFact).toBe("deadline");
			expect(uncertainty.impact).toBe("high");
		});
	});

	describe("criteria operations", () => {
		it("should set and get selected criteria", () => {
			workspace.setCriteria(["risk_rule_1", "risk_rule_2"]);
			expect(workspace.getCriteria()).toEqual(["risk_rule_1", "risk_rule_2"]);
		});
	});

	describe("clear", () => {
		it("should reset all state", () => {
			workspace.setup("test", "risk_assessment", ["test"]);
			workspace.recordEvidence({
				source: "node",
				statement: "e",
				entityIds: ["a"],
				confidence: 1,
			});
			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "高",
				confidence: 0.5,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
			});
			workspace.addUncertainty({ missingFact: "x", impact: "low" });

			workspace.clear();

			expect(workspace.getAllEvidence()).toEqual([]);
			expect(workspace.getAllCandidates()).toEqual([]);
			expect(workspace.getAllUncertainty()).toEqual([]);
			expect(workspace.getQuestion()).toBe("");
			expect(workspace.getIntent()).toBe("unknown");
		});
	});
});
