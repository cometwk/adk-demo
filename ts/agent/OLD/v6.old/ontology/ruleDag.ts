import type { FactStore } from "../runtime/eventStore";
import type { Graph } from "../runtime/graph";
import type { Rule, RuleKind, RuleResult } from "./rules";
import { getRules } from "./rules";

// ── Rule DAG evaluation ──
//
// Evaluation order (topological):
//   1. inference_rule  — may produce derived FactBindings consumed by later rules
//   2. hard_constraint — may veto candidates
//   3. soft_criterion  — weighted scoring
//   4. conflict_policy / explanation_policy — metadata only
//
// Rules marked subsumedBy[] are still evaluated (for explanation), but their
// scores are excluded from MCDA aggregation to prevent double-counting.

const KIND_ORDER: RuleKind[] = [
	"inference_rule",
	"hard_constraint",
	"soft_criterion",
	"conflict_policy",
	"explanation_policy",
];

export type EvaluatedRule = {
	ruleId: string;
	entityId?: string;
	result: RuleResult;
	isSubsumed: boolean;     // true → explain but don't score
};

export type DagEvaluationOutput = {
	results: EvaluatedRule[];
	facts: FactStore;        // updated FactStore (with derived facts from inference_rules)
	vetoedLabels: Set<string>;
};

/**
 * Evaluate all relevant rules against the given FactStore.
 *
 * @param initialFacts  - Starting FactStore (from EventStore or bind_fact calls)
 * @param graph         - Graph for entity type resolution
 * @param entityIds     - Entity IDs relevant to the current task (rule filter)
 * @param ruleIds       - Optional subset of rule IDs to evaluate (planner hint)
 */
export function evaluateRuleDag(
	initialFacts: FactStore,
	graph: Graph,
	entityIds: string[],
	ruleIds?: string[],
): DagEvaluationOutput {
	const allRules = getRules();
	const applicableRules = ruleIds
		? allRules.filter((r) => ruleIds.includes(r.id))
		: allRules;

	// Sort by kind order, then by dependsOn (simple topological pass)
	const sorted = sortRules(applicableRules);

	let facts = initialFacts;
	const evaluatedResults: EvaluatedRule[] = [];
	const vetoedLabels = new Set<string>();

	for (const rule of sorted) {
		const subsumedByIds = rule.subsumedBy ?? [];
		const isSubsumed = subsumedByIds.length > 0;

		// Rules with appliesTo matching node types are evaluated per matching entity
		const matchingEntities = entityIds.filter((eid) => {
			const node = graph.getNode(eid);
			if (!node) return false;
			return rule.appliesTo.includes(node.constructor.name);
		});

		if (matchingEntities.length === 0) {
			// Global evaluation (no entityId)
			const result = rule.evaluator({ facts, graph });
			evaluatedResults.push({ ruleId: rule.id, result, isSubsumed });
			if (result.triggered && rule.veto) {
				for (const label of rule.veto.candidatesByLabel) vetoedLabels.add(label);
			}
			if (result.derivedFacts?.length) {
				facts = facts.withDerived(result.derivedFacts);
			}
		} else {
			for (const entityId of matchingEntities) {
				const result = rule.evaluator({ entityId, facts, graph });
				evaluatedResults.push({ ruleId: rule.id, entityId, result, isSubsumed });
				if (result.triggered && rule.veto) {
					for (const label of rule.veto.candidatesByLabel) vetoedLabels.add(label);
				}
				if (result.derivedFacts?.length) {
					facts = facts.withDerived(result.derivedFacts);
				}
			}
		}
	}

	return { results: evaluatedResults, facts, vetoedLabels };
}

// ── Topological sort ──
// Stable: preserves KIND_ORDER, respects dependsOn edges.

function sortRules(rules: Rule[]): Rule[] {
	const byId = new Map(rules.map((r) => [r.id, r]));

	// Group by kind, then within each group do a simple dependency sort
	const byKind = new Map<RuleKind, Rule[]>(
		KIND_ORDER.map((k) => [k, []]),
	);
	for (const r of rules) {
		byKind.get(r.kind)?.push(r);
	}

	const sorted: Rule[] = [];
	const visited = new Set<string>();

	function visit(rule: Rule): void {
		if (visited.has(rule.id)) return;
		visited.add(rule.id);
		for (const depId of rule.dependsOn ?? []) {
			const dep = byId.get(depId);
			if (dep) visit(dep);
		}
		sorted.push(rule);
	}

	for (const kind of KIND_ORDER) {
		for (const rule of byKind.get(kind) ?? []) {
			visit(rule);
		}
	}

	return sorted;
}

// ── Convenience: evaluate a single rule ──

export function evaluateSingleRule(
	ruleId: string,
	facts: FactStore,
	graph: Graph,
	entityId?: string,
): EvaluatedRule | null {
	const allRules = getRules();
	const rule = allRules.find((r) => r.id === ruleId);
	if (!rule) return null;
	const result = rule.evaluator({ entityId, facts, graph });
	return { ruleId, entityId, result, isSubsumed: (rule.subsumedBy ?? []).length > 0 };
}
