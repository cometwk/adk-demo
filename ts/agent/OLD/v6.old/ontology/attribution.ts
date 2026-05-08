import type { EventStore } from "../runtime/eventStore";
import type { CausalGraph, CausalPath } from "./causal";
import type { AttributionResult, CandidateCause } from "./decision";

// ── Attribution Scoring (V6.5 Diagnostic mode) ──
//
// Four dimensions (NOT forced to sum = 1):
//   1. necessity         (but-for test: does removing the cause prevent the outcome?)
//   2. sufficiency       (does the cause alone lead to the outcome?)
//   3. pathCompleteness  (how much of the causal path has evidence?)
//   4. temporalPlausibility (does the cause precede the outcome within typicalLag?)
//
// Composite score = weighted average of the four dimensions.
// Weights can be overridden via calibration.

export type AttributionWeights = {
	necessity: number;
	sufficiency: number;
	pathCompleteness: number;
	temporalPlausibility: number;
};

export const DEFAULT_ATTRIBUTION_WEIGHTS: AttributionWeights = {
	necessity: 0.4,
	sufficiency: 0.2,
	pathCompleteness: 0.25,
	temporalPlausibility: 0.15,
};

export type AttributionInput = {
	causes: CandidateCause[];
	outcomeEventId: string;      // event ID in EventStore
	outcomeEventType: string;
	outcomeOccurredAt: string;   // ISO 8601
	eventStore: EventStore;
	causalGraph: CausalGraph;
	weights?: AttributionWeights;
};

// ── But-for test ──
//
// For each cause, temporarily erase the causing event from the EventStore
// and check if the outcome-predisposing events still exist.
// Returns a score in [0, 1]:
//   1.0 = erasing the cause completely eliminates the outcome evidence
//   0.0 = erasing the cause has no effect

function butForScore(
	causeEventId: string | undefined,
	outcomeEventId: string,
	eventStore: EventStore,
): number {
	if (!causeEventId) return 0;

	const counterfactualStore = eventStore.eraseEvent(causeEventId);
	const outcomeStillExists = !!counterfactualStore.getEvent(outcomeEventId);
	// If outcome event no longer exists in counterfactual store: high necessity
	// (In practice the outcome event itself won't change, but its causal predecessors do.)
	// We use a proxy: check if any remaining event still affects the outcome entity.
	const outcomeEvent = eventStore.getEvent(outcomeEventId);
	if (!outcomeEvent) return 0;

	// Check if any causal predecessor of the outcome is still present
	const predEvents = counterfactualStore.timelineFor(
		outcomeEvent.affectedEntities[0] ?? "",
		undefined,
		outcomeEvent.occurredAt,
	);

	// Simple heuristic: if fewer events remain, necessity is higher
	const originalEvents = eventStore.timelineFor(
		outcomeEvent.affectedEntities[0] ?? "",
		undefined,
		outcomeEvent.occurredAt,
	);

	if (originalEvents.length === 0) return 0;
	const reduction = (originalEvents.length - predEvents.length) / originalEvents.length;
	return Math.min(1, reduction * 1.5); // boost slightly
}

// ── Sufficiency ──
// Proxy: how many causal paths from this cause type reach the outcome?
// Strong edge strength + single-hop path → high sufficiency.

function sufficiencyScore(
	cause: CandidateCause,
	causalGraph: CausalGraph,
): number {
	const rootMatcher = cause.causalPathRef.rootCauseMatcher;
	if (!rootMatcher) return 0.1;

	const paths: CausalPath[] = causalGraph.forwardChain(rootMatcher, 4);
	const outcomeMatcher = cause.causalPathRef.finalEffectMatcher;

	const reachingPaths = paths.filter(
		(p) => p.finalEffect.matcher === outcomeMatcher || p.finalEffect.matcher.includes(outcomeMatcher),
	);

	if (reachingPaths.length === 0) return 0.1;

	// Weight by edge strengths in the path
	const avgStrength = reachingPaths.map((p) => {
		const weights = p.edges.map((e) => {
			if (e.strength === "strong") return 1.0;
			if (e.strength === "moderate") return 0.6;
			return 0.3;
		});
		return weights.reduce((a, b) => a + b, 0) / weights.length;
	});
	return Math.min(1, avgStrength.reduce((a, b) => a + b, 0) / avgStrength.length);
}

// ── Path completeness ──
// What fraction of edges in the causal path have supporting timeline evidence?

function pathCompletenessScore(
	cause: CandidateCause,
	eventStore: EventStore,
	outcomeOccurredAt: string,
): number {
	const evidenceIds = cause.timelineEvidenceIds;
	if (evidenceIds.length === 0) return 0;

	const edgeCount = cause.causalPathRef.edgeIds.length;
	if (edgeCount === 0) return 0.5; // no path structure info

	// Check how many path edges have an event in the timeline window
	const relevantEvents = eventStore.allInWindow(undefined, outcomeOccurredAt);
	const coveredEdges = cause.causalPathRef.edgeIds.filter((edgeId) =>
		relevantEvents.some((e) => e.payload?.causalEdgeId === edgeId),
	);
	return coveredEdges.length / edgeCount;
}

// ── Temporal plausibility ──
// Cause must precede the outcome, within the typicalLag range.

function temporalPlausibilityScore(
	cause: CandidateCause,
	outcomeOccurredAt: string,
	eventStore: EventStore,
): number {
	// Find the earliest event matching this cause's root pattern
	const allEvents = eventStore.allInWindow(undefined, outcomeOccurredAt);
	if (allEvents.length === 0) return 0.5;

	const rootMatcher = cause.causalPathRef.rootCauseMatcher;
	const causingEvents = allEvents.filter(
		(e) => e.type === rootMatcher || e.type.includes(rootMatcher) || rootMatcher.includes(e.type),
	);

	if (causingEvents.length === 0) return 0.3; // no matching event found

	// Check all causing events precede the outcome
	const allPrecede = causingEvents.every((e) => e.occurredAt < outcomeOccurredAt);
	if (!allPrecede) return 0; // temporal violation

	// Prefer causes that are neither too early nor too late
	const outcomeTime = new Date(outcomeOccurredAt).getTime();
	const causeTimes = causingEvents.map((e) => new Date(e.occurredAt).getTime());
	const avgCauseTime = causeTimes.reduce((a, b) => a + b, 0) / causeTimes.length;
	const lagDays = (outcomeTime - avgCauseTime) / 86400000;

	// Optimal lag: 0-21 days; penalty beyond 60 days
	if (lagDays <= 0) return 0;
	if (lagDays <= 21) return 1.0;
	if (lagDays <= 60) return 0.7;
	return 0.4;
}

// ── Score causes ──

export function scoreCauses(input: AttributionInput): AttributionResult[] {
	const { causes, outcomeEventId, outcomeOccurredAt, eventStore, causalGraph, weights = DEFAULT_ATTRIBUTION_WEIGHTS } = input;

	const results: AttributionResult[] = causes.map((cause) => {
		// Find the cause event ID (if any) to use for but-for test
		const causeEventId = eventStore
			.allInWindow(undefined, outcomeOccurredAt)
			.find(
				(e) =>
					e.type === cause.causalPathRef.rootCauseMatcher ||
					e.type.includes(cause.causalPathRef.rootCauseMatcher),
			)?.id;

		const necessity = butForScore(causeEventId, outcomeEventId, eventStore);
		const sufficiency = sufficiencyScore(cause, causalGraph);
		const pathCompleteness = pathCompletenessScore(cause, eventStore, outcomeOccurredAt);
		const temporalPlausibility = temporalPlausibilityScore(cause, outcomeOccurredAt, eventStore);

		const attributionScore =
			necessity * weights.necessity +
			sufficiency * weights.sufficiency +
			pathCompleteness * weights.pathCompleteness +
			temporalPlausibility * weights.temporalPlausibility;

		// Confidence: average of path completeness and temporal plausibility
		const confidence = (pathCompleteness + temporalPlausibility) / 2;

		const rationale =
			`necessity=${necessity.toFixed(2)}, sufficiency=${sufficiency.toFixed(2)}, ` +
			`pathCompleteness=${pathCompleteness.toFixed(2)}, temporalPlausibility=${temporalPlausibility.toFixed(2)}`;

		return {
			causeId: cause.id,
			label: cause.label,
			necessity,
			sufficiency,
			pathCompleteness,
			temporalPlausibility,
			attributionScore,
			confidence,
			rationale,
		};
	});

	// Sort by attributionScore descending
	results.sort((a, b) => b.attributionScore - a.attributionScore);
	return results;
}

// ── Overdetermination detection ──
// Two or more causes each independently exceeding threshold → overdetermined.

export function isOverdetermined(
	results: AttributionResult[],
	threshold = 0.4,
): boolean {
	const aboveThreshold = results.filter((r) => r.attributionScore > threshold);
	return aboveThreshold.length >= 2;
}
