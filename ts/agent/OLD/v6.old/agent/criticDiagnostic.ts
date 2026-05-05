import type { DecisionTask, DiagnosticVerdict, CandidateCause } from "../ontology/decision";
import type { EventStore } from "../runtime/eventStore";
import type { CausalGraph } from "../ontology/causal";
import { scoreCauses, isOverdetermined } from "../ontology/attribution";

// ── Diagnostic Critic ──
//
// Deterministic: no LLM calls.
// Steps:
//   1. Run attribution scoring (4 dimensions) for each candidate cause
//   2. Detect overdetermination
//   3. Return DiagnosticVerdict (system source)

export type CriticDiagnosticInput = {
	task: DecisionTask;
	candidateCauses: CandidateCause[];
	eventStore: EventStore;
	causalGraph: CausalGraph;
};

export function runDiagnosticCritic(input: CriticDiagnosticInput): DiagnosticVerdict {
	const { task, candidateCauses, eventStore, causalGraph } = input;

	const outcome = task.outcome;
	if (!outcome) {
		return {
			source: "system",
			mode: "diagnostic",
			rankedAttributions: [],
			overdetermined: false,
			notes: ["No outcome event specified in task; cannot perform attribution."],
		};
	}

	if (candidateCauses.length === 0) {
		return {
			source: "system",
			mode: "diagnostic",
			rankedAttributions: [],
			overdetermined: false,
			notes: ["No candidate causes proposed; executor should call propose_causes first."],
		};
	}

	// Find outcome event ID in store
	const outcomeEvent = eventStore
		.allInWindow(undefined, outcome.occurredAt)
		.find((e) => e.type === outcome.eventType && e.affectedEntities.includes(outcome.entityId));

	const outcomeEventId = outcomeEvent?.id ?? "";

	const attributions = scoreCauses({
		causes: candidateCauses,
		outcomeEventId,
		outcomeEventType: outcome.eventType,
		outcomeOccurredAt: outcome.occurredAt,
		eventStore,
		causalGraph,
	});

	const overdetermined = isOverdetermined(attributions);

	const notes: string[] = [];
	if (!outcomeEvent) {
		notes.push(`Outcome event '${outcome.eventType}' not found in EventStore; but-for scores defaulted to 0.`);
	}
	if (overdetermined) {
		notes.push("Overdetermined: multiple causes exceed attribution threshold (>0.4). Both are plausible contributors.");
	}
	const lowConfidence = attributions.filter((a) => a.confidence < 0.3);
	if (lowConfidence.length > 0) {
		notes.push(
			`Low confidence for: ${lowConfidence.map((a) => a.label).join(", ")}. ` +
			`Consider adding more timeline events via record_event.`,
		);
	}

	return {
		source: "system",
		mode: "diagnostic",
		rankedAttributions: attributions,
		overdetermined,
		notes,
	};
}
