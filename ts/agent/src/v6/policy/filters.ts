import type { Tool } from "ai";
import type { PolicyContext } from "./context";

// ── Policy filter ──
//
// Wraps an AI SDK tool's execute function with policy enforcement.
// The wrapped tool checks entity access, type access, and redacts properties
// before returning data to the executor LLM.

export type PolicyAwareTool<T extends Tool> = T;

/**
 * Wraps a tool's execute function with policy enforcement.
 * The caller provides a `policyCheck` function that applies the policy
 * to the raw tool output before it reaches the LLM.
 */
export function withPolicy<TInput, TOutput>(
	tool: Tool,
	_ctx: PolicyContext,
	policyCheck: (input: TInput, output: TOutput) => TOutput,
): Tool {
	const originalExecute = tool.execute;
	if (!originalExecute) return tool;

	return {
		...tool,
		execute: async (input: TInput, options: unknown) => {
			const rawOutput = await originalExecute(input, options as Parameters<typeof originalExecute>[1]);
			return policyCheck(input, rawOutput as TOutput);
		},
	};
}

/**
 * Apply policy to a list of neighbor entries, filtering out denied entities/types.
 */
export function filterNeighbors(
	neighbors: Array<{ nodeId: string; type: string }>,
	ctx: PolicyContext,
): Array<{ nodeId: string; type: string }> {
	return neighbors.filter((n) => {
		if (ctx.scope.deniedEntityIds?.includes(n.nodeId)) return false;
		if (ctx.scope.allowedEntityIds && !ctx.scope.allowedEntityIds.includes(n.nodeId)) return false;
		if (ctx.scope.deniedTypes?.includes(n.type)) return false;
		if (ctx.scope.allowedTypes && !ctx.scope.allowedTypes.includes(n.type)) return false;
		return true;
	});
}

/**
 * Apply redaction to node properties.
 */
export function redactProperties(
	properties: Record<string, unknown>,
	ctx: PolicyContext,
): Record<string, unknown> {
	if (ctx.redaction.sensitiveProperties.length === 0) return properties;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (ctx.redaction.sensitiveProperties.includes(key)) {
			if (ctx.redaction.mode === "drop") continue;
			if (ctx.redaction.mode === "mask") {
				result[key] = ctx.redaction.maskValue ?? "***";
			} else {
				result[key] = "[redacted]";
			}
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Check if an entity ID is accessible under the given policy.
 */
export function checkEntityAccess(entityId: string, ctx: PolicyContext): boolean {
	if (ctx.scope.deniedEntityIds?.includes(entityId)) return false;
	if (ctx.scope.allowedEntityIds && !ctx.scope.allowedEntityIds.includes(entityId)) return false;
	return true;
}

/**
 * Check if a node type is accessible under the given policy.
 */
export function checkTypeAccess(typeName: string, ctx: PolicyContext): boolean {
	if (ctx.scope.deniedTypes?.includes(typeName)) return false;
	if (ctx.scope.allowedTypes && !ctx.scope.allowedTypes.includes(typeName)) return false;
	return true;
}

/**
 * Log a tool call if audit policy requires it.
 */
export function maybeLogToolCall(
	toolName: string,
	input: unknown,
	ctx: PolicyContext,
): void {
	if (ctx.audit.logToolCalls) {
		console.log(`[AUDIT] tool=${toolName} user=${ctx.principal.userId}`, JSON.stringify(input));
	}
}
