import { getRuleById } from "../ontology/constraints";
import type {
	CandidateAnswer,
	DecisionOutput,
	DecisionWorkspace,
	Evidence,
	Uncertainty,
} from "../ontology/decision";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 决策输出格式化
// 将 workspace 中的结构化数据转换为用户可读的决策输出
// ─────────────────────────────────────────────────────────────────────────────────

export type OutputFormatConfig = {
	workspace: DecisionWorkspace;
	debug?: boolean; // 是否包含完整 ID 和 trace
};

export function formatDecisionOutput(
	config: OutputFormatConfig,
): DecisionOutput {
	const { workspace, debug = false } = config;

	const candidates = workspace.getAllCandidates();
	const allEvidence = workspace.getAllEvidence();
	const allUncertainty = workspace.getAllUncertainty();

	// 选择最高评分的候选作为推荐
	const sortedCandidates = [...candidates].sort(
		(a, b) => (b.score ?? 0) - (a.score ?? 0),
	);
	const recommendation = sortedCandidates[0];
	const alternatives = sortedCandidates.slice(1);

	// 收集触发的规则 ID
	const triggeredConstraints = new Set<string>();
	for (const c of candidates) {
		for (const ruleId of c.triggeredConstraintIds) {
			triggeredConstraints.add(ruleId);
		}
	}
	for (const e of allEvidence) {
		for (const ruleId of e.constraintIds ?? []) {
			triggeredConstraints.add(ruleId);
		}
	}

	// 根据不确定性生成下一步查询建议
	const nextQueries = allUncertainty
		.filter((u) => u.impact === "high" || u.impact === "medium")
		.map((u) => u.suggestedQuery ?? `查询 ${u.missingFact}`)
		.filter((q) => q.length > 0);

	return {
		recommendation: {
			answer: recommendation?.answer ?? "INSUFFICIENT_DATA",
			summary: recommendation?.summary ?? "无法做出判断，信息不足",
			confidence: recommendation?.confidence ?? 0,
			supportingEvidenceIds: recommendation?.supportingEvidenceIds ?? [],
			triggeredConstraintIds: recommendation?.triggeredConstraintIds ?? [],
		},
		alternatives: alternatives.map((a) => ({
			answer: a.answer,
			summary: a.summary,
			confidence: a.confidence,
			reasonForNotChoosing: `评分低于推荐 (${a.score ?? 0} vs ${recommendation?.score ?? 0})`,
		})),
		evidence: allEvidence,
		triggeredConstraints: Array.from(triggeredConstraints),
		uncertainty: allUncertainty,
		nextQueries,
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// 用户可读格式
// ─────────────────────────────────────────────────────────────────────────────────

export function formatUserReadable(output: DecisionOutput): string {
	const lines: string[] = [];

	// 推荐判断
	lines.push("## 推荐判断");
	lines.push(`${output.recommendation.answer}`);
	lines.push(`${output.recommendation.summary}`);
	lines.push(`置信度: ${(output.recommendation.confidence * 100).toFixed(0)}%`);
	lines.push("");

	// 备选判断
	if (output.alternatives.length > 0) {
		lines.push("## 备选判断");
		for (const alt of output.alternatives) {
			lines.push(
				`- ${alt.answer}: ${alt.summary} (${alt.reasonForNotChoosing})`,
			);
		}
		lines.push("");
	}

	// 关键证据
	lines.push("## 关键证据");
	for (const e of output.evidence) {
		lines.push(
			`- [${e.id}] ${e.statement} (来源: ${e.source}, 置信度: ${e.confidence})`,
		);
	}
	lines.push("");

	// 触发规则
	if (output.triggeredConstraints.length > 0) {
		lines.push("## 触发规则");
		for (const ruleId of output.triggeredConstraints) {
			const rule = getRuleById(ruleId);
			if (rule) {
				lines.push(`- [${ruleId}] ${rule.description}`);
			} else {
				lines.push(`- [${ruleId}] (规则详情未知)`);
			}
		}
		lines.push("");
	}

	// 不确定性
	if (output.uncertainty.length > 0) {
		lines.push("## 不确定性");
		for (const u of output.uncertainty) {
			lines.push(`- 缺失: ${u.missingFact} (影响: ${u.impact})`);
			if (u.suggestedQuery) {
				lines.push(`  建议: ${u.suggestedQuery}`);
			}
		}
		lines.push("");
	}

	// 下一步建议
	if (output.nextQueries.length > 0) {
		lines.push("## 建议下一步");
		for (const q of output.nextQueries) {
			lines.push(`- ${q}`);
		}
	}

	return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────────
// 调试格式（包含完整 ID 和 trace）
// ─────────────────────────────────────────────────────────────────────────────────

export function formatDebugOutput(output: DecisionOutput): string {
	const userReadable = formatUserReadable(output);

	const debugInfo: string[] = [
		"\n--- DEBUG INFO ---",
		`Evidence IDs: ${output.evidence.map((e) => e.id).join(", ")}`,
		`Triggered Rules: ${output.triggeredConstraints.join(", ")}`,
		`Recommendation Evidence IDs: ${output.recommendation.supportingEvidenceIds.join(", ")}`,
		`Recommendation Rule IDs: ${output.recommendation.triggeredConstraintIds.join(", ")}`,
	];

	return userReadable + debugInfo.join("\n");
}
