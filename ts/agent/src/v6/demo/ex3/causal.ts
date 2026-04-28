import { CausalGraph, type CausalEdge } from "../../ontology/causal";

// ── Agent-Merchant Apply Causal Graph ──
// Models the causal mechanisms behind apply (进件) failures.

export function buildAgentMerchCausalGraph(): CausalGraph {
	const edges: CausalEdge[] = [
		{
			id: "ce_merch_info_missing_channel_reject",
			cause: { kind: "event_type", matcher: "merch_info_missing" },
			effect: { kind: "event_type", matcher: "channel_reject" },
			mechanism: "商户信息不完整（缺少联系人或手机号），通道审核时拒绝进件申请",
			typicalLag: "0-1 days",
			strength: "strong",
			relatedRuleIds: ["merch_info_incomplete"],
		},
		{
			id: "ce_channel_reject_apply_fail",
			cause: { kind: "event_type", matcher: "channel_reject" },
			effect: { kind: "event_type", matcher: "apply_fail" },
			mechanism: "通道拒绝进件申请，导致进件状态变为 FAIL",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["apply_status_fail"],
		},
		{
			id: "ce_agent_disabled_apply_block",
			cause: { kind: "event_type", matcher: "agent_disabled" },
			effect: { kind: "event_type", matcher: "apply_block" },
			mechanism: "代理商被禁用，无法发起任何进件申请，直接阻断",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["agent_disabled"],
		},
		{
			id: "ce_apply_block_apply_fail",
			cause: { kind: "event_type", matcher: "apply_block" },
			effect: { kind: "event_type", matcher: "apply_fail" },
			mechanism: "进件被阻断，申请状态变为 FAIL，原因记录为代理商禁用",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["apply_status_fail"],
		},
		{
			id: "ce_rate_check_fail_apply_fail",
			cause: { kind: "event_type", matcher: "rate_check_fail" },
			effect: { kind: "event_type", matcher: "apply_fail" },
			mechanism: "费率校验失败（商户费率不足以覆盖代理分润），进件申请被拒绝",
			typicalLag: "immediate",
			strength: "moderate",
			relatedRuleIds: ["apply_status_fail"],
		},
	];
	return new CausalGraph(edges);
}