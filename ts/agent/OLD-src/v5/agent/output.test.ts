import { beforeEach, describe, expect, it } from "vitest";
import { DecisionWorkspace, resetIdCounter } from "../ontology/decision";
import { formatDecisionOutput, renderDecisionText } from "./output";

describe("formatDecisionOutput", () => {
	let workspace: DecisionWorkspace;

	beforeEach(() => {
		resetIdCounter();
		workspace = new DecisionWorkspace();
	});

	it("returns null when no candidates", () => {
		expect(formatDecisionOutput(workspace, "test")).toBeNull();
	});

	it("produces full decision output structure", () => {
		const high = workspace.addCandidate("HIGH", "高风险");
		const low = workspace.addCandidate("LOW", "低风险");
		workspace.setCandidateScore(high.id, 0.8);
		workspace.setCandidateScore(low.id, 0.2);

		const ev = workspace.addEvidence({
			sourceType: "method_result",
			entityIds: ["project_portal"],
			relatedRuleIds: ["high_priority_pressure"],
			content: "project is high priority",
			confidence: 0.9,
		});
		workspace.linkEvidenceToCandidate(high.id, ev.id);

		workspace.addTriggeredRule("high_priority_pressure");
		workspace.addTriggeredRule("senior_coverage");

		workspace.addUncertainty({
			description: "依赖项目 project_api 的风险未知",
			impact: "high",
			missingFacts: ["dependencyRisk"],
			nextQuery: "评估 project_api 的交付风险",
		});

		const output = formatDecisionOutput(
			workspace,
			"评估 project_portal 的综合交付风险",
		);
		expect(output).not.toBeNull();
		if (!output) return;

		expect(output.recommendation.candidateId).toBe(high.id);
		expect(output.alternatives.length).toBeGreaterThan(0);
		expect(output.evidence.length).toBe(1);
		expect(output.triggeredRules).toContain("high_priority_pressure");
		expect(output.uncertainties.length).toBe(1);
		expect(output.nextQueries.length).toBe(1);
	});

	it("recommendation references an existing candidate", () => {
		const cand = workspace.addCandidate("HIGH", "高风险");
		workspace.setCandidateScore(cand.id, 0.9);

		const output = formatDecisionOutput(workspace, "test")!;
		expect(
			workspace.getCandidate(output.recommendation.candidateId),
		).toBeTruthy();
	});

	it("every evidence reference resolves", () => {
		const cand = workspace.addCandidate("HIGH", "高风险");
		workspace.setCandidateScore(cand.id, 0.9);
		const ev = workspace.addEvidence({
			sourceType: "property",
			entityIds: ["alice"],
			relatedRuleIds: [],
			content: "evidence",
			confidence: 0.8,
		});
		workspace.linkEvidenceToCandidate(cand.id, ev.id);

		const output = formatDecisionOutput(workspace, "test")!;
		for (const e of output.evidence) {
			expect(workspace.getEvidence(e.id)).toBeTruthy();
		}
	});

	it("uncertainty entries produce next queries", () => {
		workspace.addCandidate("HIGH", "高风险");
		workspace.addUncertainty({
			description: "missing dep risk",
			impact: "high",
			missingFacts: ["dependencyRisk"],
			nextQuery: "evaluate project_api risk",
		});

		const output = formatDecisionOutput(workspace, "test")!;
		expect(output.uncertainties.length).toBe(1);
		expect(output.nextQueries).toContain("evaluate project_api risk");
	});
});

describe("renderDecisionText", () => {
	it("renders Chinese prose with all sections", () => {
		resetIdCounter();
		const workspace = new DecisionWorkspace();
		const cand = workspace.addCandidate("HIGH", "高风险");
		workspace.setCandidateScore(cand.id, 0.8);
		workspace.addEvidence({
			sourceType: "method_result",
			entityIds: ["portal"],
			relatedRuleIds: ["r1"],
			content: "portal is risky",
			confidence: 0.9,
		});
		workspace.addTriggeredRule("r1");
		workspace.addUncertainty({
			description: "missing data",
			impact: "high",
			missingFacts: ["x"],
			nextQuery: "find x",
		});

		const output = formatDecisionOutput(workspace, "风险评估")!;
		const text = renderDecisionText(output);

		expect(text).toContain("决策分析");
		expect(text).toContain("推荐结论");
		expect(text).toContain("关键证据");
		expect(text).toContain("触发的规则");
		expect(text).toContain("不确定性");
		expect(text).toContain("下一步信息收集");
	});
});
