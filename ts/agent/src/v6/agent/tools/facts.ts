import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolOk, toolErr } from "../../runtime/types";
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
			"将实体属性值记录到 FactStore 中。在从 inspect_node 或 call_method 读取属性后立即调用此方法。" +
			"这是权威记录；不要在没有绑定的情况下假设值。",
		inputSchema: z.object({
			entityId: z.string().describe("属性所属的实体 ID"),
			property: z.string().describe("属性名称（如 'workload', 'seniority'）"),
			value: z.unknown().describe("属性值"),
			sourceKind: z
				.enum(["graph_property", "method_result", "aggregation", "user_input", "derived"])
				.default("graph_property")
				.describe("该值的来源类型"),
			sourceRef: z.string().optional().describe("可选引用（evidenceId, nodeId）"),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.default(0.9)
				.describe("置信度 0..1；直接读取默认为 0.9"),
			validFrom: z
				.string()
				.optional()
				.describe("ISO 8601: 该值开始生效的时间（默认为当前时间）"),
			validUntil: z
				.string()
				.optional()
				.describe("ISO 8601: 该值失效的时间"),
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
			"查询实体属性的已绑定事实值。在将值传递给 call_method 之前调用此方法，以避免盲零错误。" +
			"如果事实尚未绑定，返回 null。",
		inputSchema: z.object({
			entityId: z.string().describe("实体 ID"),
			property: z.string().describe("属性名称"),
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
			"对多个实体的属性绑定事实进行聚合计算。支持操作：sum, avg, count, min, max。" +
			"聚合后使用 bind_fact 绑定结果。",
		inputSchema: z.object({
			entityIds: z.array(z.string()).describe("要聚合的实体 ID"),
			property: z.string().describe("要聚合的属性"),
			operation: z
				.enum(["sum", "avg", "count", "min", "max"])
				.describe("聚合操作"),
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