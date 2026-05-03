/**
 * Demo ex4: Library Book Borrow Decision
 *
 * Run:
 *   npx tsx src/v6/demo/ex4/main.ts
 *
 * 场景：小明想借《人工智能简史》
 *
 * 图书馆规定：
 *   1. 每个读者最多只能借 3 本书；
 *   2. 新书（上架不到 7 天）不能外借，只能馆内阅读；
 *   3. 如果读者有逾期未还的书，就不能再借新书。
 *
 * 当前状态：
 *   - 小明已借 2 本（未超上限）
 *   - 小明有 1 本逾期未还（规则 3 触发）
 *   - 《人工智能简史》上架仅 3 天（规则 2 触发）
 *
 * Runs two rounds:
 *   1. Predictive  — "小明能借《人工智能简史》吗？"（ALLOWED / DENIED）
 *   2. Diagnostic  — "小明的借阅申请为什么被拒绝？"（归因）
 */

import { runDecisionAssistant } from "../../index";
import type { DiagnosticVerdict, SystemVerdict_Predictive } from "../../ontology/decision";
import { libraryOntology } from "./ontology";
import { setupLibraryScenario } from "./seed";

async function main1() {
	console.log("═══════════════════════════════════════════════");
	console.log(" Ex4 — Library Book Borrow Decision Demo       ");
	console.log(" 场景：小明想借《人工智能简史》                ");
	console.log("═══════════════════════════════════════════════\n");

	// ── Round 1: Predictive — 能否借书 ──
	console.log("【Round 1】Predictive: 小明能借《人工智能简史》吗？\n");

	const { graph, factStore } = setupLibraryScenario();

	const predictiveResult = await runDecisionAssistant({
		userQuery: "小明能借《人工智能简史》吗？请根据图书馆规定进行评估。",
		graph,
		ontology: libraryOntology,
		factStore,
		entryEntities: ["xiao_ming", "book_ai_history", "city_library"],
		verbose: true,
	});

	if (predictiveResult.systemVerdict?.mode === "predictive") {
		const sv = predictiveResult.systemVerdict as SystemVerdict_Predictive;
		console.log("\n── System Verdict ──");
		console.log(`  Decision:    ${sv.recommendedCandidateId}`);
		console.log(`  Confidence:  ${sv.confidence}`);
		console.log(`  Ranking:     ${sv.ranking.map((r) => r.label).join(" > ")}`);

		if (sv.ranking.length > 0) {
			console.log("\n  Scoring Detail:");
			for (const r of sv.ranking) {
				const blocked = r.blockingRuleIds?.length > 0 ? ` [BLOCKED by: ${r.blockingRuleIds.join(", ")}]` : "";
				console.log(`    ${r.label}: score=${r.normalizedScore.toFixed(3)}, confidence=${r.confidence.toFixed(2)}${blocked}`);
			}
		}
	}

	if (predictiveResult.modelVerdict?.mode === "predictive") {
		const mv = predictiveResult.modelVerdict;
		console.log("\n── Model Verdict ──");
		console.log(`  Decision:   ${mv.recommendedCandidateId}`);
		console.log(`  Rationale:  ${mv.rationale}`);
	}

	console.log("\n── Reconciliation ──");
	console.log(`  Agree: ${predictiveResult.reconciliation.agree}`);
	if (!predictiveResult.reconciliation.agree) {
		console.log(`  Diff — System: ${predictiveResult.reconciliation.diff?.systemPick}`);
		console.log(`        Model:  ${predictiveResult.reconciliation.diff?.modelPick}`);
		console.log(`  Likely cause: ${predictiveResult.reconciliation.diff?.likelyCause}`);
		console.log(`  Explanation:  ${predictiveResult.reconciliation.diff?.explanation}`);
	}

	console.log("\n── Evidence ──");
	for (const ev of predictiveResult.evidence.slice(0, 6)) {
		console.log(
			`  [${ev.sourceKind}] entities=${ev.entityIds.join(",")} — ${ev.content.slice(0, 100)}`,
		);
	}

	if (predictiveResult.counterfactuals.length > 0) {
		console.log("\n── Counterfactuals (What-If) ──");
		for (const cf of predictiveResult.counterfactuals) {
			console.log(`  [${cf.mode}] ${cf.description}`);
		}
	}

	// ── Round 2: Diagnostic — 为什么被拒绝 ──
	console.log("\n\n【Round 2】Diagnostic: 小明的借阅申请为什么被拒绝？\n");

	const {
		graph: g2,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
	} = setupLibraryScenario();

	const diagnosticResult = await runDecisionAssistant({
		userQuery: "小明今天申请借《人工智能简史》被拒了，为什么？",
		graph: g2,
		ontology: libraryOntology,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
		outcome: {
			entityId: "xiao_ming",
			eventType: "borrow_request_denied",
			occurredAt: "2026-05-03T10:00:00.000Z",
		},
		verbose: true,
	});

	if (diagnosticResult.systemVerdict?.mode === "diagnostic") {
		const sv = diagnosticResult.systemVerdict as DiagnosticVerdict;
		console.log("\n── System Verdict (Diagnostic) ──");
		console.log(`  Overdetermined: ${sv.overdetermined}`);
		console.log("\n  Attribution Ranking:");
		for (const a of sv.rankedAttributions) {
			console.log(
				`    Cause: ${a.causeId.padEnd(30)} score=${a.attributionScore.toFixed(3)}` +
				`  necessity=${a.necessity.toFixed(2)}  sufficiency=${a.sufficiency.toFixed(2)}`,
			);
		}
		if (sv.notes.length > 0) {
			console.log("\n  Notes:");
			for (const note of sv.notes) {
				console.log(`    - ${note}`);
			}
		}
	}

	if (diagnosticResult.modelVerdict?.mode === "diagnostic") {
		const mv = diagnosticResult.modelVerdict as DiagnosticVerdict;
		console.log("\n── Model Verdict (Diagnostic) ──");
		for (const a of mv.rankedAttributions) {
			console.log(`    Cause: ${a.causeId}  rationale: ${a.rationale?.slice(0, 80) ?? ""}`);
		}
	}

	console.log("\n── Reconciliation ──");
	console.log(`  Agree: ${diagnosticResult.reconciliation.agree}`);
	if (!diagnosticResult.reconciliation.agree) {
		console.log(`  Likely cause: ${diagnosticResult.reconciliation.diff?.likelyCause}`);
		console.log(`  Explanation:  ${diagnosticResult.reconciliation.diff?.explanation}`);
	}

	if (diagnosticResult.counterfactuals.length > 0) {
		console.log("\n── Counterfactuals (But-For) ──");
		for (const cf of diagnosticResult.counterfactuals) {
			console.log(`  [${cf.mode}] ${cf.description}`);
		}
	}

	console.log("\n── Summary ──");
	console.log("  小明被拒绝的场景同时触发了两条 hard_constraint：");
	console.log("    ① 《人工智能简史》上架仅 3 天（< 7 天新书保护期）→ 不可外借");
	console.log("    ② 小明的《老人与海》已逾期未还 → 借阅权限暂停");
	console.log("  ③ 已借 2 本（< 3 本上限）→ 此规则未触发");
	console.log("\n  如果想成功借书，需要同时解决：");
	console.log("    · 先归还《老人与海》（消除逾期标记）");
	console.log("    · 等待《人工智能简史》上架满 7 天（2026-05-07 后）");

	console.log("\n\nDemo ex4 completed.");
}


async function main2() {
	console.log("═══════════════════════════════════════════════");
	console.log(" Ex4 — Library Book Borrow Decision Demo       ");
	console.log(" 场景：小明想借《人工智能简史》                ");
	console.log("═══════════════════════════════════════════════\n");

	// ── Round 2: Diagnostic — 为什么被拒绝 ──
	console.log("\n\n【Round 2】Diagnostic: 小明的借阅申请为什么被拒绝？\n");

	const {
		graph: g2,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
	} = setupLibraryScenario();

	const diagnosticResult = await runDecisionAssistant({
		userQuery: "小明今天申请借《人工智能简史》被拒了，为什么？",
		graph: g2,
		ontology: libraryOntology,
		factStore: fs2,
		eventStore: es2,
		causalGraph: cg2,
		outcome: {
			entityId: "xiao_ming",
			eventType: "borrow_request_denied",
			occurredAt: "2026-05-03T10:00:00.000Z",
		},
		verbose: true,
	});

	if (diagnosticResult.systemVerdict?.mode === "diagnostic") {
		const sv = diagnosticResult.systemVerdict as DiagnosticVerdict;
		console.log("\n── System Verdict (Diagnostic) ──");
		console.log(`  Overdetermined: ${sv.overdetermined}`);
		console.log("\n  Attribution Ranking:");
		for (const a of sv.rankedAttributions) {
			console.log(
				`    Cause: ${a.causeId.padEnd(30)} score=${a.attributionScore.toFixed(3)}` +
				`  necessity=${a.necessity.toFixed(2)}  sufficiency=${a.sufficiency.toFixed(2)}`,
			);
		}
		if (sv.notes.length > 0) {
			console.log("\n  Notes:");
			for (const note of sv.notes) {
				console.log(`    - ${note}`);
			}
		}
	}

	if (diagnosticResult.modelVerdict?.mode === "diagnostic") {
		const mv = diagnosticResult.modelVerdict as DiagnosticVerdict;
		console.log("\n── Model Verdict (Diagnostic) ──");
		for (const a of mv.rankedAttributions) {
			console.log(`    Cause: ${a.causeId}  rationale: ${a.rationale?.slice(0, 80) ?? ""}`);
		}
	}

	console.log("\n── Reconciliation ──");
	console.log(`  Agree: ${diagnosticResult.reconciliation.agree}`);
	if (!diagnosticResult.reconciliation.agree) {
		console.log(`  Likely cause: ${diagnosticResult.reconciliation.diff?.likelyCause}`);
		console.log(`  Explanation:  ${diagnosticResult.reconciliation.diff?.explanation}`);
	}

	if (diagnosticResult.counterfactuals.length > 0) {
		console.log("\n── Counterfactuals (But-For) ──");
		for (const cf of diagnosticResult.counterfactuals) {
			console.log(`  [${cf.mode}] ${cf.description}`);
		}
	}

	console.log("\n── Summary ──");
	console.log("  小明被拒绝的场景同时触发了两条 hard_constraint：");
	console.log("    ① 《人工智能简史》上架仅 3 天（< 7 天新书保护期）→ 不可外借");
	console.log("    ② 小明的《老人与海》已逾期未还 → 借阅权限暂停");
	console.log("  ③ 已借 2 本（< 3 本上限）→ 此规则未触发");
	console.log("\n  如果想成功借书，需要同时解决：");
	console.log("    · 先归还《老人与海》（消除逾期标记）");
	console.log("    · 等待《人工智能简史》上架满 7 天（2026-05-07 后）");

	console.log("\n\nDemo ex4 completed.");
}

main1().catch((err) => {
	console.error("Demo ex4 failed:", err);
	process.exit(1);
});


main2().catch((err) => {
	console.error("Demo ex4 failed:", err);
	process.exit(1);
});
