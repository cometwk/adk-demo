/**
 * Demo ex3: Library Lending Decision Support
 *
 * Run:
 *   npx tsx src/v6/demo/ex3/main.ts
 *
 * Runs two rounds:
 *   1. Predictive  — "小明可以借 book_new_ai 这本书吗？"
 *   2. Diagnostic  — "小明借 book_new_ai 为什么被拒绝"
 */

import { runDecisionAssistant } from "../../index";
import type { DiagnosticVerdict, SystemVerdict_Predictive } from "../../ontology/decision";
import { libraryOntology } from "./ontology";
import { setupLibraryScenario } from "./seed";

async function main() {
	console.log("══════════════════════════════════════════════");
	console.log(" Ex3 — Library Lending Decision Support Demo ");
	console.log("══════════════════════════════════════════════\n");

	// ── Round 1: Predictive (小明借书评估) ──
	console.log("【Round 1】Predictive: 小明可以借 book_new_ai 这本书吗？\n");

	const { graph, factStore } = setupLibraryScenario();

	const predictiveResult = await runDecisionAssistant({
		userQuery: "小明可以借 book_new_ai 这本书吗？",
		graph,
		ontology: libraryOntology,
		factStore,
		entryEntities: ["xiaoming", "book_new_ai", "main_library"],
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

	// ── Round 2: Diagnostic (借阅被拒绝归因) ──
	console.log("\n\n【Round 2】Diagnostic: 小明借 book_new_ai 为什么被拒绝\n");

	const { graph: g2, factStore: fs2, eventStore: es2, causalGraph: cg2 } = setupLibraryScenario();

	const diagnosticResult = await runDecisionAssistant({
		userQuery: "小明借 book_new_ai 为什么被拒绝",
		graph: g2,
		ontology: libraryOntology,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
		outcome: {
			entityId: "xiaoming",
			eventType: "borrow_rejected",
			occurredAt: "2026-05-03T14:00:00.000Z",
		},
		verbose: true,
	});

	if (diagnosticResult.systemVerdict?.mode === "diagnostic") {
		const sv = diagnosticResult.systemVerdict as DiagnosticVerdict;
		console.log("\n── System Verdict (Diagnostic) ──");
		for (const a of sv.rankedAttributions) {
			console.log(`  Cause: ${a.causeId}  attributionScore=${a.attributionScore.toFixed(3)}`);
			console.log(`    necessity=${a.necessity.toFixed(2)}  sufficiency=${a.sufficiency.toFixed(2)}`);
			console.log(`    rationale: ${a.rationale}`);
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

	// ── Round 3: Additional scenarios ──
	console.log("\n\n【Round 3】Predictive: 张三可以借 book_design_patterns 吗？\n");

	const { graph: g3, factStore: fs3 } = setupLibraryScenario();

	const zhangsanResult = await runDecisionAssistant({
		userQuery: "张三可以借 book_design_patterns 吗？",
		graph: g3,
		ontology: libraryOntology,
		factStore: fs3,
		entryEntities: ["zhangsan", "book_design_patterns"],
		verbose: false,
	});

	if (zhangsanResult.systemVerdict?.mode === "predictive") {
		const sv = zhangsanResult.systemVerdict as SystemVerdict_Predictive;
		console.log("\n── System Verdict ──");
		console.log(`  Recommended: ${sv.recommendedCandidateId}`);
		console.log(`  Notes: 已借 3 本，达到上限`);
	}

	// ── Round 4: Overdue block ──
	console.log("\n\n【Round 4】Predictive: 李四可以借 book_new_ai 吗？\n");

	const { graph: g4, factStore: fs4 } = setupLibraryScenario();

	const lisiResult = await runDecisionAssistant({
		userQuery: "李四可以借 book_new_ai 吗？",
		graph: g4,
		ontology: libraryOntology,
		factStore: fs4,
		entryEntities: ["lisi", "book_new_ai"],
		verbose: false,
	});

	if (lisiResult.systemVerdict?.mode === "predictive") {
		const sv = lisiResult.systemVerdict as SystemVerdict_Predictive;
		console.log("\n── System Verdict ──");
		console.log(`  Recommended: ${sv.recommendedCandidateId}`);
		console.log(`  Notes: 有逾期未还，禁止借新书`);
	}

	console.log("\n\nDemo ex3 completed.");
}

main().catch((err) => {
	console.error("Demo ex3 failed:", err);
	process.exit(1);
});