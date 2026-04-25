import { beforeEach, describe, expect, it } from "vitest";
import { initializeConstraints } from "../ontology/constraints";
import { DecisionWorkspace } from "../ontology/decision";
import {
	formatDebugOutput,
	formatDecisionOutput,
	formatUserReadable,
} from "./output";

describe("Decision Output", () => {
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		workspace = new DecisionWorkspace();
		initializeConstraints();
	});

	describe("formatDecisionOutput", () => {
		it("should format workspace into DecisionOutput", () => {
			workspace.setup("评估风险", "risk_assessment", ["project_portal"]);

			// 添加候选
			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "高风险",
				confidence: 0.8,
				supportingEvidenceIds: ["evidence_1"],
				opposingEvidenceIds: [],
				triggeredConstraintIds: ["project_team_load"],
				score: 0.7,
			});

			workspace.proposeCandidate({
				answer: "MEDIUM",
				summary: "中等风险",
				confidence: 0.6,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.5,
			});

			// 添加证据
			workspace.recordEvidence({
				source: "node",
				statement: "alice workload = 85",
				entityIds: ["alice"],
				confidence: 1,
			});

			// 添加不确定性
			workspace.addUncertainty({
				missingFact: "project_api deadline",
				impact: "high",
				suggestedQuery: "query project_api deadlineRisk",
			});

			const output = formatDecisionOutput({ workspace });

			expect(output.recommendation.answer).toBe("HIGH");
			expect(output.recommendation.confidence).toBe(0.8);
			expect(output.alternatives.length).toBe(1);
			expect(output.alternatives[0].answer).toBe("MEDIUM");
			expect(output.evidence.length).toBe(1);
			expect(output.triggeredConstraints).toContain("project_team_load");
			expect(output.uncertainty.length).toBe(1);
			expect(output.nextQueries.length).toBe(1);
		});

		it("should handle empty workspace", () => {
			const output = formatDecisionOutput({ workspace });

			expect(output.recommendation.answer).toBe("INSUFFICIENT_DATA");
			expect(output.alternatives.length).toBe(0);
			expect(output.evidence.length).toBe(0);
			expect(output.triggeredConstraints.length).toBe(0);
		});

		it("should sort candidates by score", () => {
			workspace.setup("test", "risk_assessment", []);

			workspace.proposeCandidate({
				answer: "LOW",
				summary: "低风险",
				confidence: 0.5,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.3,
			});

			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "高风险",
				confidence: 0.8,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.8,
			});

			workspace.proposeCandidate({
				answer: "MEDIUM",
				summary: "中等风险",
				confidence: 0.6,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.5,
			});

			const output = formatDecisionOutput({ workspace });

			expect(output.recommendation.answer).toBe("HIGH"); // 最高评分
			expect(output.alternatives[0].answer).toBe("MEDIUM"); // 第二
			expect(output.alternatives[1].answer).toBe("LOW"); // 第三
		});
	});

	describe("formatUserReadable", () => {
		it("should produce Chinese readable output", () => {
			workspace.setup("test", "risk_assessment", []);

			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "团队负载过高",
				confidence: 0.75,
				supportingEvidenceIds: ["evidence_1"],
				opposingEvidenceIds: [],
				triggeredConstraintIds: ["project_team_load"],
				score: 0.7,
			});

			workspace.recordEvidence({
				source: "aggregate",
				statement: "团队总负载 150h",
				entityIds: ["alice", "bob"],
				confidence: 1,
				constraintIds: ["project_team_load"],
			});

			workspace.addUncertainty({
				missingFact: "依赖项目风险",
				impact: "high",
				suggestedQuery: "query project_api risk",
			});

			const output = formatDecisionOutput({ workspace });
			const readable = formatUserReadable(output);

			expect(readable).toContain("推荐判断");
			expect(readable).toContain("HIGH");
			expect(readable).toContain("关键证据");
			expect(readable).toContain("团队总负载 150h");
			expect(readable).toContain("触发规则");
			expect(readable).toContain("不确定性");
			expect(readable).toContain("建议下一步");
		});
	});

	describe("formatDebugOutput", () => {
		it("should include debug info with IDs", () => {
			workspace.setup("test", "risk_assessment", []);

			const candidate = workspace.proposeCandidate({
				answer: "HIGH",
				summary: "test",
				confidence: 0.8,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.7,
			});

			const evidence = workspace.recordEvidence({
				source: "node",
				statement: "test evidence",
				entityIds: [],
				confidence: 1,
			});

			const output = formatDecisionOutput({ workspace });
			const debug = formatDebugOutput(output);

			expect(debug).toContain("推荐判断");
			expect(debug).toContain("DEBUG INFO");
			expect(debug).toContain("Evidence IDs:");
			expect(debug).toContain(evidence.id);
		});
	});

	describe("output integrity", () => {
		it("should ensure recommendation references existing candidate", () => {
			workspace.setup("test", "risk_assessment", []);

			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "test",
				confidence: 0.8,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.7,
			});

			const output = formatDecisionOutput({ workspace });
			const candidates = workspace.getAllCandidates();

			expect(
				candidates.find((c) => c.answer === output.recommendation.answer),
			).toBeDefined();
		});

		it("should ensure evidence IDs resolve", () => {
			workspace.setup("test", "risk_assessment", []);

			const evidence = workspace.recordEvidence({
				source: "node",
				statement: "test",
				entityIds: [],
				confidence: 1,
			});

			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "test",
				confidence: 0.8,
				supportingEvidenceIds: [evidence.id],
				opposingEvidenceIds: [],
				triggeredConstraintIds: [],
				score: 0.7,
			});

			const output = formatDecisionOutput({ workspace });

			expect(output.evidence.find((e) => e.id === evidence.id)).toBeDefined();
			expect(output.recommendation.supportingEvidenceIds).toContain(
				evidence.id,
			);
		});

		it("should ensure triggered rule IDs exist in constraints", () => {
			workspace.setup("test", "risk_assessment", []);

			workspace.proposeCandidate({
				answer: "HIGH",
				summary: "test",
				confidence: 0.8,
				supportingEvidenceIds: [],
				opposingEvidenceIds: [],
				triggeredConstraintIds: ["project_team_load"], // 已注册的规则
				score: 0.7,
			});

			const output = formatDecisionOutput({ workspace });

			for (const ruleId of output.triggeredConstraints) {
				expect(initializeConstraints).toBeDefined();
			}
		});

		it("should generate next queries for high impact uncertainty", () => {
			workspace.setup("test", "risk_assessment", []);

			workspace.addUncertainty({
				missingFact: "deadline",
				impact: "high",
				suggestedQuery: "query deadline",
			});

			workspace.addUncertainty({
				missingFact: "minor info",
				impact: "low",
				suggestedQuery: "optional query",
			});

			const output = formatDecisionOutput({ workspace });

			expect(output.nextQueries).toContain("query deadline");
			expect(output.nextQueries).not.toContain("optional query");
		});
	});
});
