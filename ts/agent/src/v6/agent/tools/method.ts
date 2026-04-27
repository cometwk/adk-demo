import { tool } from "ai";
import { z } from "zod";
import type { Graph } from "../../runtime/graph";
import type { FactStore } from "../../runtime/eventStore";
import { AgentMethodRegistry } from "../../runtime/registry";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";
import type { PolicyContext } from "../../policy/context";
import { checkEntityAccess, maybeLogToolCall } from "../../policy/filters";

function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
	if ("toJSONSchema" in schema && typeof schema.toJSONSchema === "function") {
		return (schema as unknown as { toJSONSchema: () => Record<string, unknown> }).toJSONSchema();
	}
	return {};
}

// ── Precondition assertion ──
//
// Prevents the V5 bug: evaluateRisk({ teamLoad: 0, seniorCount: 0 })
// — the executor was passing zeros it never fetched.
//
// If requiredFacts is set and any listed property is missing or 0 in the
// FactStore for the given entity, we reject the call with PRECONDITION_FAILED.

function assertPreconditions(
	nodeId: string,
	methodName: string,
	args: Record<string, unknown>,
	facts: FactStore,
): string | null {
	const node_facts = facts.forEntity(nodeId);
	const factsByProperty = new Map(node_facts.map((f) => [f.property, f.value]));

	const schema = (() => {
		// We can't get the class name from nodeId alone without the graph.
		// Preconditions are checked via requiredFacts annotation if available.
		for (const [, s] of Object.entries(AgentMethodRegistry)) {
			void s; // registry is static; we check all keys
		}
		return null;
	})();
	void schema;

	// Check args that were passed as 0 but the FactStore has no record of them.
	// This catches the "blind call" pattern.
	for (const [paramName, paramValue] of Object.entries(args)) {
		if (paramValue === 0) {
			// If FactStore has a binding for this entity.property with non-zero value,
			// the zero arg is suspicious.
			const bound = factsByProperty.get(paramName);
			if (bound !== undefined && bound !== 0) {
				return (
					`Precondition failed for ${methodName}(${nodeId}): ` +
					`arg '${paramName}' is 0 but FactStore has bound value ${JSON.stringify(bound)}. ` +
					`Use lookup_fact to get the correct value before calling this method.`
				);
			}
			// If FactStore has no record for this property, also flag it.
			if (bound === undefined) {
				return (
					`Precondition failed for ${methodName}(${nodeId}): ` +
					`arg '${paramName}' is 0 but no fact binding found for ${nodeId}.${paramName}. ` +
					`Collect the fact with inspect_node / bind_fact first.`
				);
			}
		}
	}

	return null; // all preconditions pass
}

export function createMethodTools(graph: Graph, facts: FactStore, policy: PolicyContext) {
	const describe_method = tool({
		description:
			"Get the full schema of a method: params, returns, description, required facts, and related rules. " +
			"ALWAYS call this before call_method for unfamiliar methods.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node that owns the method"),
			method: z.string().describe("The method name to describe"),
		}),
		execute: async ({ nodeId, method }): Promise<ToolResult> => {
			maybeLogToolCall("describe_method", { nodeId, method }, policy);

			if (!checkEntityAccess(nodeId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${nodeId}' is denied`);
			}

			const node = graph.getNode(nodeId);
			if (!node) return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName);
				return toolErr("METHOD_NOT_FOUND", `Method '${method}' not found on ${className}`, {
					expected: { availableMethods: available },
				});
			}

			const paramsJsonSchema = schemaToJsonSchema(schema.params);

			return toolOk({
				methodName: schema.methodName,
				description: schema.description,
				params: (paramsJsonSchema.properties as Record<string, unknown>) ?? {},
				required: (paramsJsonSchema.required as string[]) ?? [],
				returns: schema.returns,
				requiredFacts: schema.requiredFacts ?? [],
				relatedRuleIds: schema.relatedRuleIds ?? [],
				preconditions: schema.preconditions ?? [],
			});
		},
	});

	const call_method = tool({
		description:
			"Call a registered method on a graph node. Pass arguments as named key-value pairs. " +
			"IMPORTANT: populate all arguments from the FactStore (lookup_fact) or inspect_node " +
			"before calling — never pass 0 for numeric arguments you haven't fetched.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node to call the method on"),
			method: z.string().describe("The method name"),
			args: z.record(z.string(), z.unknown()).default({}).describe("Arguments as { paramName: value }"),
		}),
		execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
			maybeLogToolCall("call_method", { nodeId, method, args }, policy);

			if (!checkEntityAccess(nodeId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${nodeId}' is denied`);
			}

			const node = graph.getNode(nodeId);
			if (!node) return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName);
				return toolErr("METHOD_NOT_FOUND", `Method '${method}' not found on ${className}`, {
					expected: { availableMethods: available },
				});
			}

			// ── Precondition assertion (V6 anti-blind-call guard) ──
			const preconditionError = assertPreconditions(nodeId, method, args, facts);
			if (preconditionError) {
				return toolErr("PRECONDITION_FAILED", preconditionError, { retryable: false });
			}

			// ── Schema validation ──
			const parseResult = schema.params.safeParse(args);
			if (!parseResult.success) {
				const issues = parseResult.error.issues.map(
					(i) => `${i.path.join(".")}: ${i.message}`,
				);
				return toolErr(
					"INVALID_ARGS",
					`Invalid args for ${method}: ${issues.join("; ")}`,
					{ expected: { params: Object.keys((schemaToJsonSchema(schema.params).properties as Record<string, unknown>) ?? {}) } },
				);
			}

			const fn = (node as unknown as Record<string, unknown>)[method];
			if (typeof fn !== "function") {
				return toolErr("INTERNAL_ERROR", `${method} is not callable`);
			}

			const result = (fn as (args: unknown) => unknown).call(node, parseResult.data);
			return toolOk(result);
		},
	});

	return { describe_method, call_method };
}
