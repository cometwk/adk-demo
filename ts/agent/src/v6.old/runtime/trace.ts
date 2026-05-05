import type { FactBinding } from "./types";

// ── Decision Trace ──
//
// An immutable record of a single decision run.
// Stored per-session; used for replay, audit, and calibration feedback.

export type TraceToolCall = {
	stepNumber: number;
	toolName: string;
	input: unknown;
	output: unknown;
	durationMs?: number;
};

export type TraceFeedback = {
	verdict: "system_correct" | "model_correct" | "both_wrong" | "dont_know";
	comment?: string;
	submittedAt: string;
};

export type DecisionTrace = {
	traceId: string;
	sessionId: string;
	mode: "predictive" | "diagnostic";
	ontologyVersion: string;
	ruleSetVersion: string;
	goal: string;
	entryEntities: string[];
	toolCalls: TraceToolCall[];
	factSnapshot: FactBinding[];
	systemVerdictId: string;
	modelVerdictId: string;
	reconciliationAgreed: boolean;
	startedAt: string;
	finishedAt: string;
	feedback?: TraceFeedback;
};

// ── In-memory trace store ──
// In production this would persist to a database.

const traces = new Map<string, DecisionTrace>();

export function saveTrace(trace: DecisionTrace): void {
	traces.set(trace.traceId, trace);
}

export function getTrace(traceId: string): DecisionTrace | undefined {
	return traces.get(traceId);
}

export function listTraces(): DecisionTrace[] {
	return [...traces.values()];
}

export function addFeedback(traceId: string, feedback: TraceFeedback): boolean {
	const trace = traces.get(traceId);
	if (!trace) return false;
	traces.set(traceId, { ...trace, feedback });
	return true;
}

export function clearTraces(): void {
	traces.clear();
}
