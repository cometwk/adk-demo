import { describe, it, expect, beforeEach } from "vitest";
import {
	setupScenario,
	seedFactStore,
	seedEventStore,
} from "../data/seed";
import { evaluateSingleRule } from "../ontology/ruleDag";
import { scoreCandidates } from "../ontology/scoring";
import { scoreCauses } from "../ontology/attribution";
import { runPredictiveCritic } from "../agent/criticPredictive";
import { runDiagnosticCritic } from "../agent/criticDiagnostic";
import { reconcilePredictive } from "../agent/reconciler";
import { detectIntent } from "../frontend/intent";
import {
	burnoutFixtures,
	capacityFixtures,
	teamLoadFixtures,
	emptyGraph,
} from "../data/ruleFixtures";
import { DecisionWorkspace, resetIdCounter } from "../ontology/decision";
import { OPEN_POLICY } from "../policy/context";
import { projectOntology } from "../ontology/schema";
import type { CandidateAnswer, SystemVerdict_Predictive, ModelVerdict_Predictive } from "../ontology/decision";
import type { Rule } from "../ontology/rules";
import type { EvaluatedRule } from "../ontology/ruleDag";

// ── Setup ──

beforeEach(() => {
	resetIdCounter();
	setupScenario(); // registers rules + builds graph
});

// ════════════════════════════════════════════════════════════════
// 1. Burnout — per-entity evaluation, no cross-contamination
// ════════════════════════════════════════════════════════════════

describe("engineer_burnout_threshold", () => {
	it("alice (senior, 85h) → triggered", () => {
		const { graph } = setupScenario();
		const result = evaluateSingleRule("engineer_burnout_threshold", burnoutFixtures.alice_senior_burnout, graph, "alice");
		expect(result?.result.triggered).toBe(true);
		expect(result?.result.severity).toBe("high");
		expect(result?.result.missingFacts).toHaveLength(0);
	});

	it("bob (mid, 65h) → NOT triggered", () => {
		const { graph } = setupScenario();
		const result = evaluateSingleRule("engineer_burnout_threshold", burnoutFixtures.bob_mid_safe, graph, "bob");
		expect(result?.result.triggered).toBe(false);
	});

	it("eve (junior, 60h) → triggered (55h threshold)", () => {
		const { graph } = setupScenario();
		const result = evaluateSingleRule("engineer_burnout_threshold", burnoutFixtures.eve_junior_burnout, graph, "eve");
		expect(result?.result.triggered).toBe(true);
	});

	it("alice and bob evaluated independently — no missingFacts", () => {
		const { graph } = setupScenario();
		const aliceResult = evaluateSingleRule("engineer_burnout_threshold", burnoutFixtures.alice_senior_burnout, graph, "alice");
		const bobResult = evaluateSingleRule("engineer_burnout_threshold", burnoutFixtures.bob_mid_safe, graph, "bob");
		expect(aliceResult?.result.missingFacts).toHaveLength(0);
		expect(bobResult?.result.missingFacts).toHaveLength(0);
	});
});

// ════════════════════════════════════════════════════════════════
// 2. Team capacity overload → veto LOW candidate
// ════════════════════════════════════════════════════════════════

describe("team_capacity_overload", () => {
	it("overloaded team → triggered", () => {
		const { graph } = setupScenario();
		const result = evaluateSingleRule("team_capacity_overload", capacityFixtures.overloaded_team, graph, "team_x");
		expect(result?.result.triggered).toBe(true);
		expect(result?.result.severity).toBe("high");
	});

	it("normal team → NOT triggered", () => {
		const { graph } = setupScenario();
		const result = evaluateSingleRule("team_capacity_overload", capacityFixtures.frontend_normal, graph, "team_frontend");
		expect(result?.result.triggered).toBe(false);
	});
});

// ════════════════════════════════════════════════════════════════
// 3. MCDA scoring — direction-aware, not label-string hardcoded
// ════════════════════════════════════════════════════════════════

describe("MCDA scoreCandidates", () => {
	it("risk_up rules → HIGH > MEDIUM > LOW", () => {
		const { graph } = setupScenario();
		const facts = seedFactStore();

		const candidates: CandidateAnswer[] = [
			{ id: "c1", label: "HIGH", description: "High risk", supportingEvidenceIds: [] },
			{ id: "c2", label: "MEDIUM", description: "Medium risk", supportingEvidenceIds: [] },
			{ id: "c3", label: "LOW", description: "Low risk", supportingEvidenceIds: [] },
		];

		// alice burnout triggered → risk_up → should favor HIGH
		const aliceBurnout = evaluateSingleRule("engineer_burnout_threshold", facts, graph, "alice");
		const highPriority = evaluateSingleRule("high_priority_pressure", facts, graph, "project_portal");

		const mockRules: Rule[] = [
			{
				id: "engineer_burnout_threshold",
				kind: "inference_rule",
				direction: "risk_up",
				weight: 0.75,
				appliesTo: ["Engineer"],
				description: "burnout",
				version: "1.0.0",
				requiredFacts: [],
				evaluator: () => ({ triggered: false }),
				explanation: () => "",
			},
			{
				id: "high_priority_pressure",
				kind: "soft_criterion",
				direction: "risk_up",
				weight: 0.6,
				appliesTo: ["Project"],
				description: "priority",
				version: "1.0.0",
				requiredFacts: [],
				evaluator: () => ({ triggered: false }),
				explanation: () => "",
			},
		];

		const scored = scoreCandidates({
			candidates,
			evaluatedRules: [aliceBurnout!, highPriority!],
			allRules: mockRules,
			vetoedLabels: new Set(),
		});

		// HIGH should rank first
		expect(scored[0].label).toBe("HIGH");
		expect(scored[0].rawScore).toBeGreaterThan(scored[1].rawScore);
	});

	it("veto LOW when hard_constraint triggers", () => {
		const { graph } = setupScenario();

		const candidates: CandidateAnswer[] = [
			{ id: "c1", label: "HIGH", description: "High risk", supportingEvidenceIds: [] },
			{ id: "c2", label: "LOW", description: "Low risk", supportingEvidenceIds: [] },
		];

		const overloadResult = evaluateSingleRule("team_capacity_overload", capacityFixtures.overloaded_team, graph, "team_x");

		const mockRule: Rule = {
			id: "team_capacity_overload",
			kind: "hard_constraint",
			direction: "risk_up",
			weight: 1.0,
			veto: { candidatesByLabel: ["LOW"] },
			appliesTo: ["Team"],
			description: "overload",
			version: "1.0.0",
			requiredFacts: [],
			evaluator: () => ({ triggered: true }),
			explanation: () => "",
		};

		const scored = scoreCandidates({
			candidates,
			evaluatedRules: [overloadResult!],
			allRules: [mockRule],
			vetoedLabels: new Set(["LOW"]),
		});

		const lowResult = scored.find((s) => s.label === "LOW");
		expect(lowResult?.rawScore).toBe(-Infinity);
	});
});

// ════════════════════════════════════════════════════════════════
// 4. Predictive critic — end-to-end deterministic
// ════════════════════════════════════════════════════════════════

describe("runPredictiveCritic (end-to-end)", () => {
	it("project_portal: HIGH ranked first from seed facts", () => {
		const { graph } = setupScenario();
		const facts = seedFactStore();

		const candidates: CandidateAnswer[] = [
			{ id: "c1", label: "HIGH", description: "High delivery risk", supportingEvidenceIds: [] },
			{ id: "c2", label: "MEDIUM", description: "Medium delivery risk", supportingEvidenceIds: [] },
			{ id: "c3", label: "LOW", description: "Low delivery risk", supportingEvidenceIds: [] },
		];

		const verdict = runPredictiveCritic({
			task: {
				taskId: "t1",
				mode: "predictive",
				intent: "risk_assessment",
				goal: "Assess project_portal delivery risk",
				scope: {},
				policyCtx: OPEN_POLICY,
				entryEntities: ["project_portal", "alice", "bob"],
			},
			facts,
			candidates,
			graph,
			ontology: projectOntology,
		});

		expect(verdict.source).toBe("system");
		// HIGH should be recommended (alice burnout + high priority)
		const topLabel = verdict.ranking[0]?.label;
		expect(topLabel).toBe("HIGH");
		// Ranking order: HIGH > MEDIUM > LOW
		const labels = verdict.ranking.map((r) => r.label);
		expect(labels.indexOf("HIGH")).toBeLessThan(labels.indexOf("MEDIUM"));
		expect(labels.indexOf("MEDIUM")).toBeLessThan(labels.indexOf("LOW"));
	});
});

// ════════════════════════════════════════════════════════════════
// 5. Precondition: reject zero-argument calls when FactStore has data
// ════════════════════════════════════════════════════════════════

describe("precondition assertion", () => {
	it("call_method with teamLoad:0 rejected when FactStore has 150", async () => {
		const { graph } = setupScenario();
		const { createMethodTools } = await import("../agent/tools/method");
		const { resetSessionFacts, createFactTools, getSessionFactStore } = await import("../agent/tools/facts");
		resetSessionFacts();

		// Inject the real value via bind_fact tool
		const factTools = createFactTools(OPEN_POLICY);
		await (factTools.bind_fact.execute as Function)(
			{
				entityId: "project_portal",
				property: "teamLoad",
				value: 150,
				sourceKind: "graph_property",
				confidence: 1.0,
				validFrom: new Date().toISOString(),
			},
			{},
		);

		const facts = getSessionFactStore();
		const { call_method } = createMethodTools(graph, facts, OPEN_POLICY);

		const result = await (call_method.execute as Function)(
			{ nodeId: "project_portal", method: "evaluateRisk", args: { teamLoad: 0, seniorCount: 1 } },
			{},
		);

		expect(result.ok).toBe(false);
		expect(result.code).toBe("PRECONDITION_FAILED");

		resetSessionFacts();
	});
});

// ════════════════════════════════════════════════════════════════
// 6. Reconciliation — conflict surfaced to user
// ════════════════════════════════════════════════════════════════

describe("reconcilePredictive", () => {
	it("agree when picks match → surfacedToUser = false", () => {
		const systemV: SystemVerdict_Predictive = {
			source: "system", mode: "predictive", ruleSetVersion: "1.0.0",
			ranking: [{ candidateId: "c1", label: "HIGH", rawScore: 1.5, normalizedScore: 1, confidence: 0.9, triggeredRuleIds: [], blockingRuleIds: [], rationale: "" }],
			recommendedCandidateId: "c1", confidence: 0.9, vetoedLabels: [], notes: [],
		};
		const modelV: ModelVerdict_Predictive = {
			source: "model", mode: "predictive",
			recommendedCandidateId: "c1", confidence: 0.85, rationale: "Agreed", citedEvidenceIds: [], citedRuleIds: [],
		};
		const reconciliation = reconcilePredictive(systemV, modelV);
		expect(reconciliation.agree).toBe(true);
		expect(reconciliation.surfacedToUser).toBe(false);
	});

	it("conflict when picks differ → surfacedToUser = true, likelyCause set", () => {
		const systemV: SystemVerdict_Predictive = {
			source: "system", mode: "predictive", ruleSetVersion: "1.0.0",
			ranking: [
				{ candidateId: "c3", label: "LOW", rawScore: 0.2, normalizedScore: 0.2, confidence: 0.4, triggeredRuleIds: [], blockingRuleIds: [], rationale: "" },
				{ candidateId: "c1", label: "HIGH", rawScore: 1.5, normalizedScore: 1.0, confidence: 0.9, triggeredRuleIds: ["engineer_burnout_threshold"], blockingRuleIds: [], rationale: "" },
			],
			recommendedCandidateId: "c3", confidence: 0.4, vetoedLabels: [], notes: [],
		};
		const modelV: ModelVerdict_Predictive = {
			source: "model", mode: "predictive",
			recommendedCandidateId: "c1", confidence: 0.85, rationale: "Alice is burning out", citedEvidenceIds: [], citedRuleIds: ["engineer_burnout_threshold"],
		};
		const reconciliation = reconcilePredictive(systemV, modelV);
		expect(reconciliation.agree).toBe(false);
		expect(reconciliation.surfacedToUser).toBe(true);
		expect(reconciliation.diff?.likelyCause).toBeDefined();
	});
});

// ════════════════════════════════════════════════════════════════
// 7. Intent detection — predictive vs diagnostic
// ════════════════════════════════════════════════════════════════

describe("detectIntent", () => {
	it("风险评估 → predictive / risk_assessment", () => {
		const result = detectIntent("评估 project_portal 的交付风险");
		expect(result.mode).toBe("predictive");
		expect(result.intent).toBe("risk_assessment");
	});

	it("为什么延期 → diagnostic / rca", () => {
		const result = detectIntent("project_portal 为什么延期，原因是什么");
		expect(result.mode).toBe("diagnostic");
		expect(result.intent).toBe("rca");
	});

	it("复盘 → diagnostic", () => {
		const result = detectIntent("这次故障的事后复盘");
		expect(result.mode).toBe("diagnostic");
	});
});

// ════════════════════════════════════════════════════════════════
// 8. Diagnostic attribution — api_delivery_slip should rank highest
// ════════════════════════════════════════════════════════════════

describe("scoreCauses (diagnostic attribution)", () => {
	it("api_delivery_slip attribution > scope_added when both are candidates", () => {
		const { causalGraph } = setupScenario();
		const eventStore = seedEventStore();

		const workspace = new DecisionWorkspace("diagnostic");
		const cause1 = workspace.addCause({
			label: "API 依赖延期",
			description: "project_api 未按时交付导致 project_portal 阻塞",
			causalPathRef: {
				edgeIds: ["ce_dep_slip_portal_blocked", "ce_blocked_milestone_miss"],
				rootCauseMatcher: "delivery_slip",
				finalEffectMatcher: "milestone_missed",
			},
			timelineEvidenceIds: ["evt_api_delivery_slip", "evt_portal_blocked"],
			canCoexistWith: [],
		});

		const cause2 = workspace.addCause({
			label: "需求范围扩大",
			description: "新增需求导致截止日期压力上升",
			causalPathRef: {
				edgeIds: ["ce_scope_added_pressure", "ce_deadline_pressure_milestone_miss"],
				rootCauseMatcher: "scope_added",
				finalEffectMatcher: "milestone_missed",
			},
			timelineEvidenceIds: ["evt_scope_added"],
			canCoexistWith: [],
		});

		const attributions = scoreCauses({
			causes: [cause1, cause2],
			outcomeEventId: "evt_milestone_missed",
			outcomeEventType: "milestone_missed",
			outcomeOccurredAt: "2026-04-21T23:59:00.000Z",
			eventStore,
			causalGraph,
		});

		expect(attributions).toHaveLength(2);
		expect(attributions[0].label).toBe("API 依赖延期");
	});
});

// ════════════════════════════════════════════════════════════════
// 9. But-for test — erasing api_delivery_slip reduces outcome timeline
// ════════════════════════════════════════════════════════════════

describe("EventStore.eraseEvent (but-for)", () => {
	it("erasing evt_api_delivery_slip shortens portal timeline", () => {
		const store = seedEventStore();

		const originalTimeline = store.timelineFor("project_portal");
		expect(originalTimeline.length).toBeGreaterThan(0);
		expect(originalTimeline.some((e) => e.type === "downstream_blocked")).toBe(true);

		const counterfactual = store.eraseEvent("evt_api_delivery_slip");
		const counterfactualTimeline = counterfactual.timelineFor("project_portal");

		// api_delivery_slip removed → one fewer event in portal timeline
		expect(counterfactualTimeline.length).toBeLessThan(originalTimeline.length);
	});
});

// ════════════════════════════════════════════════════════════════
// 10. Diagnostic critic — system verdict with attribution scores
// ════════════════════════════════════════════════════════════════

describe("runDiagnosticCritic", () => {
	it("returns DiagnosticVerdict with rankedAttributions for single cause", () => {
		const { causalGraph } = setupScenario();
		const eventStore = seedEventStore();
		const workspace = new DecisionWorkspace("diagnostic");

		const cause = workspace.addCause({
			label: "API 依赖延期",
			description: "project_api 未按时交付",
			causalPathRef: {
				edgeIds: ["ce_dep_slip_portal_blocked"],
				rootCauseMatcher: "delivery_slip",
				finalEffectMatcher: "milestone_missed",
			},
			timelineEvidenceIds: ["evt_api_delivery_slip"],
			canCoexistWith: [],
		});

		const verdict = runDiagnosticCritic({
			task: {
				taskId: "t1", mode: "diagnostic", intent: "rca",
				goal: "project_portal 为什么延期",
				scope: {}, policyCtx: OPEN_POLICY,
				outcome: {
					entityId: "project_portal",
					eventType: "milestone_missed",
					occurredAt: "2026-04-21T23:59:00.000Z",
				},
			},
			candidateCauses: [cause],
			eventStore,
			causalGraph,
		});

		expect(verdict.source).toBe("system");
		expect(verdict.mode).toBe("diagnostic");
		expect(verdict.rankedAttributions).toHaveLength(1);
		expect(verdict.rankedAttributions[0].causeId).toBe(cause.id);
		expect(verdict.overdetermined).toBe(false);
	});
});

// ════════════════════════════════════════════════════════════════
// 11. project_team_load — teamLoad > 200 triggers
// ════════════════════════════════════════════════════════════════

describe("project_team_load rule", () => {
	it("teamLoad 220 → triggered", () => {
		const g = emptyGraph();
		const result = evaluateSingleRule("project_team_load", teamLoadFixtures.overloaded, g, "project_portal");
		expect(result?.result.triggered).toBe(true);
	});

	it("teamLoad 150 → NOT triggered", () => {
		const g = emptyGraph();
		const result = evaluateSingleRule("project_team_load", teamLoadFixtures.portal_safe, g, "project_portal");
		expect(result?.result.triggered).toBe(false);
	});
});
