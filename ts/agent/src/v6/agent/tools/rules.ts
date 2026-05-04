import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolOk, toolErr } from "../../runtime/types";
import { getRuleById, getRules, queryRules } from "../../ontology/rules";
import { evaluateSingleRule } from "../../ontology/ruleDag";
import type { FactStore } from "../../runtime/eventStore";
import type { Graph } from "../../runtime/graph";
import type { PolicyContext } from "../../policy/context";
import { maybeLogToolCall } from "../../policy/filters";

// ── Rule inspection tools ──
//
// These tools give the executor read-only access to the rule set.
// The executor CANNOT modify rules or weights.
// Fine-grained evaluate_rule replaces V5's evaluate_candidates as the scoring oracle.

export function createRuleTools(facts: FactStore, graph: Graph, policy: PolicyContext) {
	const inspect_rules = tool({
		description:
			"List applicable rules for a given entity type and/or intent. " +
			"Returns rule metadata (id, kind, description, direction, weight, requiredFacts). " +
			"Use this before calling evaluate_rule to understand which rules apply.",
		inputSchema: z.object({
			entityType: z.string().optional().describe("Filter by entity type (e.g. 'Engineer', 'Project')"),
			intent: z.string().optional().describe("Filter by intent keyword (e.g. 'risk_assessment', 'diagnosis')"),
			kind: z
				.enum(["hard_constraint", "inference_rule", "soft_criterion", "conflict_policy", "explanation_policy"])
				.optional()
				.describe("Filter by rule kind"),
		}),
		execute: async ({ entityType, intent, kind }): Promise<ToolResult> => {
			maybeLogToolCall("inspect_rules", { entityType, intent, kind }, policy);

			const rules = queryRules({ entityType, intent, kind });
			return toolOk({
				rules: rules.map((r) => ({
					id: r.id,
					version: r.version,
					kind: r.kind,
					appliesTo: r.appliesTo,
					description: r.description,
					direction: r.direction,
					weight: r.weight,
					requiredFacts: r.requiredFacts,
					dependsOn: r.dependsOn ?? [],
					subsumedBy: r.subsumedBy ?? [],
					hasVeto: !!r.veto,
				})),
			});
		},
	});

	const evaluate_rule = tool({
		description:
			"Evaluate a single rule against the current FactStore for a specific entity. " +
			"Returns triggered, severity, explanation, missingFacts. " +
			"NOTE: You do NOT control scoring weights. Record evidence instead of interpreting scores.",
		inputSchema: z.object({
			ruleId: z.string().describe("The rule ID to evaluate"),
			entityId: z.string().optional().describe("Entity ID to evaluate the rule for"),
		}),
		execute: async ({ ruleId, entityId }): Promise<ToolResult> => {
			maybeLogToolCall("evaluate_rule", { ruleId, entityId }, policy);

			const rule = getRuleById(ruleId);
			if (!rule) {
				const available = getRules().map((r) => r.id);
				return toolErr("NOT_FOUND", `Rule '${ruleId}' not found`, {
					expected: { availableRuleIds: available },
				});
			}

			const evaluated = evaluateSingleRule(ruleId, facts, graph, entityId);
			if (!evaluated) {
				return toolErr("INTERNAL_ERROR", `Failed to evaluate rule '${ruleId}'`);
			}

			return toolOk({
				ruleId,
				entityId,
				kind: rule.kind,
				direction: rule.direction,
				triggered: evaluated.result.triggered,
				severity: evaluated.result.severity,
				explanation: evaluated.result.explanation,
				missingFacts: evaluated.result.missingFacts ?? [],
				isSubsumed: evaluated.isSubsumed,
				note: "The critic uses this result for scoring. Do not attempt to infer the final score.",
			});
		},
	});

	return { inspect_rules, evaluate_rule };
}
