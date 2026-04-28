import { registerRule } from "../../ontology/rules";

// ── Agent-Merchant Apply Rules ──

export function registerAgentMerchRules(): void {
	// ── hard_constraint: agent_disabled ──
	// Triggers when the agent attempting to apply is disabled.
	registerRule({
		id: "agent_disabled",
		version: "1.0.0",
		kind: "hard_constraint",
		appliesTo: ["Agent"],
		description: "代理商已禁用 → 无法进件，直接阻断",
		requiredFacts: [{ property: "disabled", scope: "entity" }],
		direction: "risk_up",
		weight: 1.0,
		veto: { candidatesByLabel: ["LOW"] },
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const disabled = ctx.facts.getValue(entityId, "disabled");
			if (disabled === undefined) {
				return { triggered: false, missingFacts: [{ entityId, property: "disabled" }] };
			}
			const triggered = Boolean(disabled);
			return {
				triggered,
				severity: triggered ? "high" : "low",
				explanation: triggered
					? `代理商 ${entityId} 已禁用，无法发起进件申请`
					: `代理商 ${entityId} 状态正常，可发起进件`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── soft_criterion: merch_info_incomplete ──
	// Triggers when merchant info is incomplete (missing contact name or phone).
	registerRule({
		id: "merch_info_incomplete",
		version: "1.0.0",
		kind: "soft_criterion",
		appliesTo: ["Merch"],
		description: "商户信息不完整 → 进件可能被通道拒绝",
		requiredFacts: [
			{ property: "contactName", scope: "entity" },
			{ property: "contactPhone", scope: "entity" },
		],
		direction: "risk_up",
		weight: 0.75,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const contactName = ctx.facts.getValue(entityId, "contactName");
			const contactPhone = ctx.facts.getValue(entityId, "contactPhone");
			const missing: Array<{ entityId: string; property: string }> = [];
			if (contactName === undefined) missing.push({ entityId, property: "contactName" });
			if (contactPhone === undefined) missing.push({ entityId, property: "contactPhone" });
			if (missing.length > 0) return { triggered: false, missingFacts: missing };

			// Safe string check - handle both string and non-string values
			const nameStr = typeof contactName === "string" ? contactName : String(contactName ?? "");
			const phoneStr = typeof contactPhone === "string" ? contactPhone : String(contactPhone ?? "");
			const nameEmpty = nameStr.trim() === "";
			const phoneEmpty = phoneStr.trim() === "";
			const triggered = nameEmpty || phoneEmpty;

			return {
				triggered,
				severity: triggered ? "high" : "low",
				explanation: triggered
					? `商户 ${entityId} 信息不完整（联系人: ${nameStr || "空"}, 手机: ${phoneStr || "空"}），进件可能被通道拒绝`
					: `商户 ${entityId} 信息完整，联系人: ${nameStr}, 手机: ${phoneStr}`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── soft_criterion: apply_status_fail ──
	// Triggers when apply status is FAIL.
	registerRule({
		id: "apply_status_fail",
		version: "1.0.0",
		kind: "soft_criterion",
		appliesTo: ["Apply"],
		description: "进件申请失败 → 需诊断失败原因",
		requiredFacts: [{ property: "status", scope: "entity" }],
		direction: "risk_up",
		weight: 0.85,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const status = ctx.facts.getValue(entityId, "status");
			if (status === undefined) {
				return { triggered: false, missingFacts: [{ entityId, property: "status" }] };
			}
			const triggered = String(status) === "FAIL";
			return {
				triggered,
				severity: triggered ? "high" : "low",
				explanation: triggered
					? `进件申请 ${entityId} 已失败，状态: ${status}`
					: `进件申请 ${entityId} 状态: ${status}`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});
}