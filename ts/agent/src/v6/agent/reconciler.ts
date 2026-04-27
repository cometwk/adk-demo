import type {
	ModelVerdict_Predictive,
	Reconciliation,
	ReconciliationLikelyCause,
	SystemVerdict_Predictive,
	DiagnosticVerdict,
} from "../ontology/decision";

// ── Predictive reconciliation ──

export function reconcilePredictive(
	systemVerdict: SystemVerdict_Predictive,
	modelVerdict: ModelVerdict_Predictive,
): Reconciliation {
	const agree = systemVerdict.recommendedCandidateId === modelVerdict.recommendedCandidateId;

	if (agree) {
		return { agree: true, surfacedToUser: false };
	}

	// Diagnose conflict
	const likelyCause = diagnoseConflict(systemVerdict, modelVerdict);

	return {
		agree: false,
		surfacedToUser: true,
		diff: {
			systemPick: systemVerdict.recommendedCandidateId,
			modelPick: modelVerdict.recommendedCandidateId,
			likelyCause,
			explanation: buildConflictExplanation(systemVerdict, modelVerdict, likelyCause),
		},
	};
}

// ── Diagnostic reconciliation ──

export function reconcileDiagnostic(
	systemVerdict: DiagnosticVerdict,
	modelVerdict: DiagnosticVerdict,
): Reconciliation {
	const sysTop = systemVerdict.rankedAttributions[0]?.causeId;
	const modTop = modelVerdict.rankedAttributions?.[0]?.causeId;

	if (!sysTop || !modTop || sysTop === modTop) {
		return { agree: true, surfacedToUser: false };
	}

	return {
		agree: false,
		surfacedToUser: true,
		diff: {
			systemPick: sysTop,
			modelPick: modTop,
			likelyCause: "attribution_rank_mismatch",
			explanation:
				`系统归因最高权重给 '${sysTop}'（基于 but-for + 路径完整性），` +
				`模型判断最高权重给 '${modTop}'。` +
				`请核对因果路径的时序合理性，或提供更多事件时间线证据。`,
		},
	};
}

// ── Helpers ──

function diagnoseConflict(
	sys: SystemVerdict_Predictive,
	model: ModelVerdict_Predictive,
): ReconciliationLikelyCause {
	// If system confidence is low (many missing facts), model may have more context
	if (sys.confidence < 0.5) return "missing_facts";

	// If model cited rules that system also used, it's a weight issue
	const sysRuleIds = new Set(sys.ranking.flatMap((r) => r.triggeredRuleIds));
	const modelCited = model.citedRuleIds ?? [];
	const overlap = modelCited.filter((id) => sysRuleIds.has(id));
	if (overlap.length > 0) return "rule_weight_misalignment";

	// If model pick is the higher-risk option, it may be overriding conservatively
	const systemLabel = sys.ranking.find((r) => r.candidateId === sys.recommendedCandidateId)?.label ?? "";
	const modelLabel = model.recommendedCandidateId;
	if (isHigherRisk(modelLabel, systemLabel)) return "model_overrides_system";

	return "unknown";
}

function isHigherRisk(a: string, b: string): boolean {
	const order: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
	return (order[a.toUpperCase()] ?? 0) > (order[b.toUpperCase()] ?? 0);
}

function buildConflictExplanation(
	sys: SystemVerdict_Predictive,
	model: ModelVerdict_Predictive,
	cause: ReconciliationLikelyCause,
): string {
	const sysLabel = sys.ranking.find((r) => r.candidateId === sys.recommendedCandidateId)?.label ?? sys.recommendedCandidateId;
	const modelCandidateId = model.recommendedCandidateId;
	const conflictMap: Record<ReconciliationLikelyCause, string> = {
		missing_facts: `系统因缺失事实（置信度 ${(sys.confidence * 100).toFixed(0)}%）推荐 ${sysLabel}，但模型基于上下文推理选择 ${modelCandidateId}。建议补充缺失事实后重新评估。`,
		rule_weight_misalignment: `系统规则权重与模型直觉不一致。系统推荐 ${sysLabel}，模型推荐 ${modelCandidateId}。可通过 CalibrationConfig 调整规则权重。`,
		model_overrides_system: `模型选择了更高风险的 ${modelCandidateId}，而系统基于规则评分推荐 ${sysLabel}。模型可能考虑了系统规则未覆盖的信号。`,
		system_too_coarse: `系统规则粒度不足，推荐 ${sysLabel}，而模型认为应选 ${modelCandidateId}。可考虑新增规则覆盖此场景。`,
		attribution_rank_mismatch: `诊断归因排名不一致。`,
		unknown: `系统推荐 ${sysLabel}，模型推荐 ${modelCandidateId}，冲突原因待分析。`,
	};
	return conflictMap[cause];
}
