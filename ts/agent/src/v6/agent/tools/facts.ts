import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";
import type { FactBinding } from "../../runtime/types";
import { FactStore } from "../../runtime/eventStore";
import type { PolicyContext } from "../../policy/context";
import { checkEntityAccess, maybeLogToolCall } from "../../policy/filters";

// ── bind_fact / lookup_fact ──
//
// These two tools replace V5's flat Record<string, any> fact map.
// They are the ONLY entry point for recording entity properties.
//
// bind_fact:  executor calls this after reading a property or method result
// lookup_fact: executor calls this before passing args to call_method

// Mutable bindings collector (per-session, updated by bind_fact)
let _mutableBindings: FactBinding[] = [];

export function getSessionFactStore(): FactStore {
	return new FactStore([..._mutableBindings]);
}

export function resetSessionFacts(): void {
	_mutableBindings = [];
}

export function createFactTools(policy: PolicyContext) {
	const bind_fact = tool({
		description:
			"Record an entity property value into the FactStore. " +
			"Call this IMMEDIATELY after reading a property from inspect_node or call_method. " +
			"This is the authoritative record; do NOT assume values without binding them first.",
		inputSchema: z.object({
			entityId: z.string().describe("The entity whose property is being recorded"),
			property: z.string().describe("The property name (e.g. 'workload', 'seniority')"),
			value: z.unknown().describe("The property value"),
			sourceKind: z
				.enum(["graph_property", "method_result", "aggregation", "user_input", "derived"])
				.default("graph_property")
				.describe("Where this value came from"),
			sourceRef: z.string().optional().describe("Optional reference (evidenceId, nodeId)"),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.default(0.9)
				.describe("Confidence 0..1; default 0.9 for direct reads"),
			validFrom: z
				.string()
				.optional()
				.describe("ISO 8601: when this value started being true (defaults to now)"),
			validUntil: z
				.string()
				.optional()
				.describe("ISO 8601: when this value stopped being true"),
		}),
		execute: async ({
			entityId,
			property,
			value,
			sourceKind,
			sourceRef,
			confidence,
			validFrom,
			validUntil,
		}): Promise<ToolResult> => {
			maybeLogToolCall("bind_fact", { entityId, property }, policy);

			if (!checkEntityAccess(entityId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${entityId}' is denied`);
			}

			const now = new Date().toISOString();
			const binding: FactBinding = {
				entityId,
				property,
				value,
				source: { kind: sourceKind, ref: sourceRef },
				confidence,
				validFrom: validFrom ?? now,
				validUntil,
				observedAt: now,
			};

			_mutableBindings.push(binding);

			return toolOk({
				bound: true,
				entityId,
				property,
				value,
				confidence,
			});
		},
	});

	const lookup_fact = tool({
		description:
			"Look up a bound fact value for an entity property. " +
			"Call this before passing values to call_method to avoid blind-zero errors. " +
			"Returns null if the fact has not been bound yet.",
		inputSchema: z.object({
			entityId: z.string().describe("The entity ID"),
			property: z.string().describe("The property name"),
		}),
		execute: async ({ entityId, property }): Promise<ToolResult> => {
			maybeLogToolCall("lookup_fact", { entityId, property }, policy);

			if (!checkEntityAccess(entityId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${entityId}' is denied`);
			}

			const store = getSessionFactStore();
			const binding = store.get(entityId, property);

			if (!binding) {
				return toolOk({
					found: false,
					entityId,
					property,
					hint: `No fact bound for ${entityId}.${property}. Use inspect_node or call_method to obtain it, then bind_fact.`,
				});
			}

			return toolOk({
				found: true,
				entityId,
				property,
				value: binding.value,
				confidence: binding.confidence,
				source: binding.source,
				validFrom: binding.validFrom,
				validUntil: binding.validUntil,
				observedAt: binding.observedAt,
			});
		},
	});

	const aggregate_facts = tool({
		description:
			"Compute an aggregate over bound facts for a property across multiple entities. " +
			"Operations: sum, avg, count, min, max. " +
			"Bind the result using bind_fact after aggregation.",
		inputSchema: z.object({
			entityIds: z.array(z.string()).describe("Entity IDs to aggregate over"),
			property: z.string().describe("The property to aggregate"),
			operation: z
				.enum(["sum", "avg", "count", "min", "max"])
				.describe("Aggregation operation"),
		}),
		execute: async ({ entityIds, property, operation }): Promise<ToolResult> => {
			maybeLogToolCall("aggregate_facts", { entityIds, property, operation }, policy);

			const store = getSessionFactStore();
			const values: number[] = [];
			const missing: string[] = [];

			for (const eid of entityIds) {
				if (!checkEntityAccess(eid, policy)) continue;
				const binding = store.get(eid, property);
				if (!binding) {
					missing.push(eid);
					continue;
				}
				if (typeof binding.value !== "number") {
					return toolErr(
						"INVALID_ARGS",
						`Property '${property}' for entity '${eid}' is not a number: ${JSON.stringify(binding.value)}`,
					);
				}
				values.push(binding.value);
			}

			if (values.length === 0) {
				return toolOk({
					result: null,
					missingEntities: missing,
					hint: `No numeric facts found for property '${property}'. Bind them first with bind_fact.`,
				});
			}

			let result: number;
			switch (operation) {
				case "sum": result = values.reduce((a, b) => a + b, 0); break;
				case "avg": result = values.reduce((a, b) => a + b, 0) / values.length; break;
				case "count": result = values.length; break;
				case "min": result = Math.min(...values); break;
				case "max": result = Math.max(...values); break;
			}

			return toolOk({
				result,
				operation,
				property,
				entityCount: values.length,
				missingEntities: missing.length > 0 ? missing : undefined,
				hint: `Bind result to the relevant entity using bind_fact(entityId, '${property}Sum', ${result}, 'aggregation') or similar.`,
			});
		},
	});

	return { bind_fact, lookup_fact, aggregate_facts };
}
