/**
 * Demo ex3: Agent-Merchant Apply (进件) Decision Support
 *
 * Run:
 *   npx tsx src/v6/demo/ex3/main.ts
 *
 * Runs two rounds:
 *   1. Predictive  — "评估代理商 A002 进件商户的风险"
 *   2. Diagnostic  — "商户 M001 的进件申请为什么失败"
 */

import { runDecisionAssistant } from "../../index";
import type { DiagnosticVerdict, SystemVerdict_Predictive } from "../../ontology/decision";
import { agentMerchOntology } from "./ontology";
import { setupAgentMerchScenario } from "./seed";
import {
	queryAgent,
	queryMerch,
	queryApply,
	queryAgentChildren,
	queryAgentDescendants,
	queryMerchBoundAgents,
	queryProfitDaily,
	queryOrderDaily,
} from "./query";

async function main() {
	console.log("═══════════════════════════════════════════════════");
	console.log(" Ex3 — Agent-Merchant Apply Decision Support Demo ");
	console.log("═══════════════════════════════════════════════════\n");

	// ── Round 1: Predictive ──
	console.log("【Round 1】Predictive: 评估代理商 A002 进件商户的风险\n");

	const { graph, factStore } = setupAgentMerchScenario();

	const predictiveResult = await runDecisionAssistant({
		userQuery: "评估代理商 A002 进件商户的风险",
		graph,
		ontology: agentMerchOntology,
		factStore,
		entryEntities: ["agent_a002", "merch_m002"],
		verbose: true,
	});

	if (predictiveResult.systemVerdict?.mode === "predictive") {
		const sv = predictiveResult.systemVerdict as SystemVerdict_Predictive;
		console.log("\n── System Verdict ──");
		console.log(`  Recommended: ${sv.recommendedCandidateId}`);
		console.log(`  Confidence:  ${sv.confidence}`);
		console.log(`  Ranking:     ${sv.ranking.map((r) => r.label).join(" > ")}`);
	}

	if (predictiveResult.modelVerdict?.mode === "predictive") {
		const mv = predictiveResult.modelVerdict;
		console.log("\n── Model Verdict ──");
		console.log(`  Recommended: ${mv.recommendedCandidateId}`);
		console.log(`  Rationale:   ${mv.rationale}`);
	}

	console.log("\n── Reconciliation ──");
	console.log(`  Agree: ${predictiveResult.reconciliation.agree}`);
	if (!predictiveResult.reconciliation.agree) {
		console.log(`  Likely cause: ${predictiveResult.reconciliation.diff?.likelyCause}`);
	}

	console.log("\n── Evidence ──");
	for (const ev of predictiveResult.evidence.slice(0, 6)) {
		console.log(`  [${ev.sourceKind}] entities=${ev.entityIds.join(",")} — ${ev.content.slice(0, 80)}`);
	}

	// ── Round 2: Diagnostic ──
	console.log("\n\n【Round 2】Diagnostic: 商户 M001 的进件申请为什么失败\n");

	const { graph: g2, factStore: fs2, eventStore: es2, causalGraph: cg2 } = setupAgentMerchScenario();

	const diagnosticResult = await runDecisionAssistant({
		userQuery: "商户 M001 的进件申请为什么失败",
		graph: g2,
		ontology: agentMerchOntology,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
		outcome: {
			entityId: "apply_ap001",
			eventType: "apply_fail",
			occurredAt: "2026-04-27T09:00:00.000Z",
		},
		verbose: true,
	});

	if (diagnosticResult.systemVerdict?.mode === "diagnostic") {
		const sv = diagnosticResult.systemVerdict as DiagnosticVerdict;
		console.log("\n── System Verdict (Diagnostic) ──");
		for (const a of sv.rankedAttributions) {
			console.log(`  Cause: ${a.causeId}  attributionScore=${a.attributionScore.toFixed(3)}`);
		}
	}

	if (diagnosticResult.modelVerdict?.mode === "diagnostic") {
		const mv = diagnosticResult.modelVerdict as DiagnosticVerdict;
		console.log("\n── Model Verdict (Diagnostic) ──");
		for (const a of mv.rankedAttributions) {
			console.log(`  Cause: ${a.causeId}`);
		}
	}

	console.log("\n── Reconciliation ──");
	console.log(`  Agree: ${diagnosticResult.reconciliation.agree}`);

	if (diagnosticResult.counterfactuals.length > 0) {
		console.log("\n── Counterfactuals ──");
		for (const cf of diagnosticResult.counterfactuals) {
			console.log(`  [${cf.mode}] ${cf.description}`);
		}
	}

	// ── Query Statistics Demo ──
	console.log("\n\n【Query Statistics Demo】\n");

	// Single entity query
	console.log("── queryAgent('A002') ──");
	const agentInfo = queryAgent(graph, "A002");
	if (agentInfo) {
		console.log(`  agentNo: ${agentInfo.agentNo}`);
		console.log(`  name: ${agentInfo.name}`);
		console.log(`  disabled: ${agentInfo.disabled}`);
		console.log(`  children: ${agentInfo.children.join(", ") || "无"}`);
		console.log(`  boundMerchants: ${agentInfo.boundMerchants.join(", ") || "无"}`);
	}

	console.log("\n── queryMerch('M002') ──");
	const merchInfo = queryMerch(graph, "M002");
	if (merchInfo) {
		console.log(`  merchNo: ${merchInfo.merchNo}`);
		console.log(`  name: ${merchInfo.name}`);
		console.log(`  rate: ${merchInfo.rate}`);
		console.log(`  contactName: ${merchInfo.contactName}`);
		console.log(`  boundAgents: ${merchInfo.boundAgents.join(", ") || "无"}`);
	}

	console.log("\n── queryApply('AP001') ──");
	const applyInfo = queryApply(graph, "AP001");
	if (applyInfo) {
		console.log(`  applyNo: ${applyInfo.applyNo}`);
		console.log(`  agentNo: ${applyInfo.agentNo}`);
		console.log(`  merchNo: ${applyInfo.merchNo}`);
		console.log(`  status: ${applyInfo.status}`);
		console.log(`  statusReason: ${applyInfo.statusReason}`);
	}

	// Hierarchy query
	console.log("\n── queryAgentDescendants('A001') ──");
	const descendants = queryAgentDescendants(graph, "A001");
	console.log(`  Descendants: ${descendants.join(", ") || "无"}`);

	// Relationship aggregation
	console.log("\n── queryMerchBoundAgents('M002') ──");
	const boundAgents = queryMerchBoundAgents(graph, "M002");
	console.log(`  Bound agents: ${boundAgents.join(", ") || "无"}`);

	// SQL mock queries
	console.log("\n── queryProfitDaily('A002', '2026-04-01', '2026-04-30') (mock) ──");
	const profitResult = queryProfitDaily("A002", "2026-04-01", "2026-04-30");
	console.log(`  rowCount: ${profitResult.rowCount} (mock, returns empty)`);
	console.log(`  executionTimeMs: ${profitResult.executionTimeMs}`);

	console.log("\n\nDemo ex3 completed.");
}

main().catch((err) => {
	console.error("Demo ex3 failed:", err);
	process.exit(1);
});