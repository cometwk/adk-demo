import type {
	DecisionOutput,
	DecisionRecommendation,
	DecisionWorkspace,
} from "../ontology/decision";

export function formatDecisionOutput(
	workspace: DecisionWorkspace,
	goal: string,
): DecisionOutput | null {
	const candidates = workspace.listCandidates();
	if (candidates.length === 0) return null;

	const sorted = [...candidates].sort(
		(a, b) => (b.score ?? 0) - (a.score ?? 0),
	);
	const best = sorted[0];

	const allEvidence = workspace.listEvidence();
	const uncertainties = workspace.listUncertainties();
	const triggeredRules = workspace.listTriggeredRules();

	const topScore = best.score ?? 0;
	const runnerUp = sorted[1];
	const scoreDiff = runnerUp ? topScore - (runnerUp.score ?? 0) : topScore;
	const confidence = Math.min(
		1,
		Math.max(0, scoreDiff > 0.2 ? 0.8 : 0.5 + scoreDiff),
	);

	const recommendation: DecisionRecommendation = {
		candidateId: best.id,
		confidence: Math.round(confidence * 100) / 100,
		explanation: `基于 ${triggeredRules.length} 条触发规则和 ${allEvidence.length} 条证据，推荐 ${best.label}`,
	};

	const alternatives = sorted.slice(1);

	return {
		goal,
		recommendation,
		alternatives,
		evidence: allEvidence,
		triggeredRules,
		uncertainties,
		nextQueries: uncertainties.map((u) => u.nextQuery),
	};
}

export function renderDecisionText(output: DecisionOutput): string {
	const lines: string[] = [];

	lines.push(`## 决策分析：${output.goal}\n`);

	const rec = output.recommendation;
	lines.push(`### 推荐结论`);
	lines.push(`- 候选方案 ID: ${rec.candidateId}`);
	lines.push(`- 置信度: ${(rec.confidence * 100).toFixed(0)}%`);
	lines.push(`- ${rec.explanation}\n`);

	if (output.alternatives.length > 0) {
		lines.push(`### 备选方案`);
		for (const alt of output.alternatives) {
			lines.push(
				`- **${alt.label}** (得分: ${alt.score ?? "N/A"}): ${alt.description}`,
			);
		}
		lines.push("");
	}

	if (output.evidence.length > 0) {
		lines.push(`### 关键证据`);
		for (const ev of output.evidence) {
			lines.push(
				`- [${ev.id}] ${ev.content} (置信度: ${(ev.confidence * 100).toFixed(0)}%, 来源: ${ev.sourceType})`,
			);
		}
		lines.push("");
	}

	if (output.triggeredRules.length > 0) {
		lines.push(`### 触发的规则`);
		for (const ruleId of output.triggeredRules) {
			lines.push(`- ${ruleId}`);
		}
		lines.push("");
	}

	if (output.uncertainties.length > 0) {
		lines.push(`### 不确定性`);
		for (const unc of output.uncertainties) {
			lines.push(`- [${unc.impact.toUpperCase()}] ${unc.description}`);
			lines.push(`  建议查询: ${unc.nextQuery}`);
		}
		lines.push("");
	}

	if (output.nextQueries.length > 0) {
		lines.push(`### 下一步信息收集`);
		for (const q of output.nextQueries) {
			lines.push(`- ${q}`);
		}
	}

	return lines.join("\n");
}
