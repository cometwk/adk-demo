import { CausalGraph, type CausalEdge } from "../../ontology/causal";

// ── dbt data pipeline causal graph ──
// Models the causal mechanisms behind data quality incidents.

export function buildDbtCausalGraph(): CausalGraph {
	const edges: CausalEdge[] = [
		{
			id: "ce_source_incident_late_refresh",
			cause: { kind: "event_type", matcher: "source_incident" },
			effect: { kind: "event_type", matcher: "late_refresh" },
			mechanism: "上游数据源发生延迟或故障，导致依赖该源的 dbt 模型无法按时刷新",
			typicalLag: "0-6 hours",
			strength: "strong",
			relatedRuleIds: ["source_reliability_low"],
		},
		{
			id: "ce_late_refresh_stale_data",
			cause: { kind: "event_type", matcher: "late_refresh" },
			effect: { kind: "state", matcher: "stale_data" },
			mechanism: "模型未按 SLA 刷新，表中数据陈旧，不再反映最新业务状态",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["data_freshness_violation"],
		},
		{
			id: "ce_stale_data_dashboard_incorrect",
			cause: { kind: "state", matcher: "stale_data" },
			effect: { kind: "event_type", matcher: "dashboard_incorrect" },
			mechanism: "看板查询陈旧数据，展示错误指标，误导业务决策",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["data_freshness_violation", "high_downstream_impact"],
		},
		{
			id: "ce_schema_drift_model_failure",
			cause: { kind: "event_type", matcher: "schema_drift" },
			effect: { kind: "event_type", matcher: "model_failure" },
			mechanism: "上游表字段变更或类型不兼容，导致 dbt 模型编译或运行失败",
			typicalLag: "0-1 hours",
			strength: "strong",
			relatedRuleIds: ["low_test_coverage"],
		},
		{
			id: "ce_model_failure_downstream_blocked",
			cause: { kind: "event_type", matcher: "model_failure" },
			effect: { kind: "state", matcher: "downstream_blocked" },
			mechanism: "模型构建失败，其下游模型和看板无法获得更新数据，整条血缘链路阻塞",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["high_downstream_impact"],
		},
	];
	return new CausalGraph(edges);
}
