import { randomUUID } from "crypto";
import type { DecisionTask, DecisionResponse, OutcomeEvent } from "./ontology/decision";
import type { Graph } from "./runtime/graph";
import type { FactStore, EventStore } from "./runtime/eventStore";
import type { Ontology } from "./ontology/schema";
import type { CausalGraph } from "./ontology/causal";
import type { PolicyContext } from "./policy/context";
import { OPEN_POLICY } from "./policy/context";
import { runPredictiveExecutor, runDiagnosticExecutor } from "./agent/executor";
import { runCritic } from "./agent/critic";
import { reconcilePredictive, reconcileDiagnostic } from "./agent/reconciler";
import { getCounterfactualOffers, resetCounterfactuals } from "./agent/tools/counterfactual";
import { detectIntent } from "./frontend/intent";
import { saveTrace } from "./runtime/trace";
import type { DecisionTrace } from "./runtime/trace";

// ── Public API ──

export type RunDecisionOptions = {
	graph: Graph;
	ontology: Ontology;
	factStore?: FactStore;           // predictive: initial facts; if omitted, executor starts fresh
	eventStore?: EventStore;         // diagnostic: required
	causalGraph?: CausalGraph;       // diagnostic: required
	policyCtx?: PolicyContext;
	modelId?: string;
	verbose?: boolean;
};

export type RunDecisionInput = {
	userQuery: string;
	entryEntities?: string[];        // for predictive; optional (entity linker used if omitted)
	outcome?: OutcomeEvent;          // for diagnostic; required if mode=diagnostic
	timeWindow?: { from: string; to: string };
} & RunDecisionOptions;

export async function runDecisionAssistant(
	input: RunDecisionInput,
): Promise<DecisionResponse> {
	const startedAt = new Date().toISOString();
	const traceId = randomUUID();
	const feedbackToken = randomUUID();

	const {
		userQuery,
		graph,
		ontology,
		factStore,
		eventStore,
		causalGraph,
		policyCtx = OPEN_POLICY,
		modelId = "gpt-4o",
		verbose = false,
	} = input;

	// ── Intent detection (frontend) ──
	const intentResult = detectIntent(userQuery);

	const task: DecisionTask = {
		taskId: randomUUID(),
		mode: intentResult.mode,
		intent: intentResult.intent,
		goal: userQuery,
		scope: { typesOfInterest: ontology.types.map((t) => t.name) },
		policyCtx,
		entryEntities: input.entryEntities,
		outcome: input.outcome,
		timeWindow: input.timeWindow,
	};

	if (verbose) {
		console.log(`[V6] mode=${task.mode} intent=${task.intent} confidence=${intentResult.confidence}`);
	}

	if (task.mode === "predictive") {
		return runPredictiveSession(task, graph, ontology, factStore, modelId, traceId, feedbackToken, startedAt, verbose);
	} else {
		if (!eventStore || !causalGraph) {
			throw new Error("Diagnostic mode requires eventStore and causalGraph");
		}
		return runDiagnosticSession(task, graph, ontology, eventStore, causalGraph, modelId, traceId, feedbackToken, startedAt, verbose);
	}
}

// ── Predictive session ──

async function runPredictiveSession(
	task: DecisionTask,
	graph: Graph,
	ontology: Ontology,
	initialFacts: FactStore | undefined,
	modelId: string,
	traceId: string,
	feedbackToken: string,
	startedAt: string,
	verbose: boolean,
): Promise<DecisionResponse> {
	const { FactStore: FS } = await import("./runtime/eventStore");
	const facts = initialFacts ?? new FS();

	// Executor: LLM-driven fact collection + candidate proposal
	const execResult = await runPredictiveExecutor(task, graph, facts, ontology, modelId);

	if (verbose) {
		console.log(`[V6] Executor finished: ${execResult.workspace.listCandidates().length} candidates, ${execResult.workspace.listEvidence().length} evidence items`);
	}

	// Critic: deterministic MCDA scoring
	const criticOutput = runCritic({
		task,
		graph,
		ontology,
		facts: execResult.facts,
		candidates: execResult.workspace.listCandidates(),
	});

	if (criticOutput.mode !== "predictive") throw new Error("Unexpected critic mode");
	const systemVerdict = criticOutput.verdict;
	const modelVerdict = execResult.modelVerdict;

	// Reconciliation
	const reconciliation = reconcilePredictive(systemVerdict, modelVerdict);

	if (verbose && !reconciliation.agree) {
		console.log(`[V6] Conflict: system=${systemVerdict.recommendedCandidateId} model=${modelVerdict.recommendedCandidateId} cause=${reconciliation.diff?.likelyCause}`);
	}

	const finishedAt = new Date().toISOString();
	const counterfactuals = getCounterfactualOffers();
	resetCounterfactuals();

	// Save trace
	const trace: DecisionTrace = {
		traceId,
		sessionId: task.taskId,
		mode: "predictive",
		ontologyVersion: ontology.version,
		ruleSetVersion: ontology.version,
		goal: task.goal,
		entryEntities: task.entryEntities ?? [],
		toolCalls: [],
		factSnapshot: execResult.facts.all(),
		systemVerdictId: systemVerdict.recommendedCandidateId,
		modelVerdictId: modelVerdict.recommendedCandidateId,
		reconciliationAgreed: reconciliation.agree,
		startedAt,
		finishedAt,
	};
	saveTrace(trace);

	return {
		taskId: task.taskId,
		mode: "predictive",
		systemVerdict,
		modelVerdict,
		reconciliation,
		evidence: execResult.workspace.listEvidence(),
		uncertainties: execResult.workspace.listUncertainties(),
		counterfactuals,
		traceId,
		feedbackToken,
	};
}

// ── Diagnostic session ──

async function runDiagnosticSession(
	task: DecisionTask,
	graph: Graph,
	ontology: Ontology,
	eventStore: EventStore,
	causalGraph: CausalGraph,
	modelId: string,
	traceId: string,
	feedbackToken: string,
	startedAt: string,
	verbose: boolean,
): Promise<DecisionResponse> {
	// Executor: LLM-driven event reconstruction + cause proposal
	const execResult = await runDiagnosticExecutor(task, graph, eventStore, ontology, causalGraph, modelId);

	if (verbose) {
		console.log(`[V6.5] Executor finished: ${execResult.workspace.listCauses().length} candidate causes`);
	}

	// Critic: deterministic attribution scoring
	const criticOutput = runCritic({
		task,
		graph,
		ontology,
		eventStore,
		causalGraph,
		candidateCauses: execResult.workspace.listCauses(),
	});

	if (criticOutput.mode !== "diagnostic") throw new Error("Unexpected critic mode");
	const systemVerdict = criticOutput.verdict;
	const modelVerdict = execResult.modelVerdict;

	// Reconciliation
	const reconciliation = reconcileDiagnostic(systemVerdict, modelVerdict);

	const finishedAt = new Date().toISOString();
	const counterfactuals = getCounterfactualOffers();
	resetCounterfactuals();

	// Save trace
	const trace: DecisionTrace = {
		traceId,
		sessionId: task.taskId,
		mode: "diagnostic",
		ontologyVersion: ontology.version,
		ruleSetVersion: ontology.version,
		goal: task.goal,
		entryEntities: task.outcome ? [task.outcome.entityId] : [],
		toolCalls: [],
		factSnapshot: execResult.facts.all(),
		systemVerdictId: systemVerdict.rankedAttributions[0]?.causeId ?? "",
		modelVerdictId: modelVerdict.rankedAttributions?.[0]?.causeId ?? "",
		reconciliationAgreed: reconciliation.agree,
		startedAt,
		finishedAt,
	};
	saveTrace(trace);

	return {
		taskId: task.taskId,
		mode: "diagnostic",
		systemVerdict,
		modelVerdict,
		reconciliation,
		evidence: execResult.workspace.listEvidence(),
		uncertainties: execResult.workspace.listUncertainties(),
		counterfactuals,
		traceId,
		feedbackToken,
	};
}
