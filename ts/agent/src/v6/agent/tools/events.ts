import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolOk, toolErr } from "../../runtime/types";
import type { EventStore, Event } from "../../runtime/eventStore";
import type { CausalGraph } from "../../ontology/causal";
import type { DecisionWorkspace } from "../../ontology/decision";
import type { PolicyContext } from "../../policy/context";
import { checkEntityAccess, maybeLogToolCall } from "../../policy/filters";

// ── Diagnostic tools (V6.5) ──
//
// These tools are only registered in diagnostic mode.
// The executor uses them to reconstruct the event timeline and causal chains.

export function createEventTools(
	eventStore: EventStore,
	causalGraph: CausalGraph,
	workspace: DecisionWorkspace,
	policy: PolicyContext,
) {
	const query_events = tool({
		description:
			"查询一个或多个实体在时间窗口内的事件时间线。返回按时间排序的事件。" +
			"在调用 walk_causal_graph 之前使用，以了解发生了什么。",
		inputSchema: z.object({
			entityId: z.string().describe("要查询事件的实体 ID"),
			from: z.string().optional().describe("ISO 8601 开始时间（包含）"),
			to: z.string().optional().describe("ISO 8601 结束时间（包含）"),
			eventTypes: z
				.array(z.string())
				.optional()
				.describe("按事件类型字符串过滤"),
		}),
		execute: async ({ entityId, from, to, eventTypes }): Promise<ToolResult> => {
			maybeLogToolCall("query_events", { entityId, from, to }, policy);

			if (!checkEntityAccess(entityId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${entityId}' denied`);
			}

			let events = eventStore.timelineFor(entityId, from, to);
			if (eventTypes && eventTypes.length > 0) {
				events = events.filter((e) => eventTypes.includes(e.type));
			}

			if (events.length === 0) {
				return toolOk({
					events: [],
					hint: `No events found for '${entityId}' in this window. Consider expanding the time range.`,
				});
			}

			return toolOk({
				events: events.map((e) => ({
					id: e.id,
					type: e.type,
					occurredAt: e.occurredAt,
					actorId: e.actorId,
					affectedEntities: e.affectedEntities,
					payload: e.payload,
				})),
				count: events.length,
			});
		},
	});

	const walk_causal_graph = tool({
		description:
			"沿因果图向后（从结果）或向前（从原因）遍历，寻找候选原因或结果。返回 CausalPaths。" +
			"使用此方法，而不是从时间共现假设因果关系。",
		inputSchema: z.object({
			seed: z.string().describe("起始模式匹配器（如 'milestone_missed', 'Engineer.workload > threshold'）"),
			direction: z
				.enum(["backward", "forward"])
				.describe("backward: 从结果找原因；forward: 从原因找结果"),
			maxDepth: z.number().min(1).max(5).default(3).describe("最大链深度"),
		}),
		execute: async ({ seed, direction, maxDepth }): Promise<ToolResult> => {
			maybeLogToolCall("walk_causal_graph", { seed, direction }, policy);

			const paths =
				direction === "backward"
					? causalGraph.backwardChain(seed, maxDepth)
					: causalGraph.forwardChain(seed, maxDepth);

			if (paths.length === 0) {
				return toolOk({
					paths: [],
					hint: `No causal paths found from '${seed}' in direction '${direction}'. ` +
						`Check that the seed matches a registered causal edge pattern.`,
				});
			}

			return toolOk({
				paths: paths.map((p) => ({
					rootCause: p.rootCause,
					finalEffect: p.finalEffect,
					edgeCount: p.edges.length,
					edges: p.edges.map((e) => ({
						id: e.id,
						cause: e.cause,
						effect: e.effect,
						mechanism: e.mechanism,
						typicalLag: e.typicalLag,
						strength: e.strength,
						relatedRuleIds: e.relatedRuleIds,
					})),
				})),
				count: paths.length,
			});
		},
	});

	const propose_causes = tool({
		description:
			"为结果提出候选原因。每个原因必须包含引用 walk_causal_graph 边的 causalPathRef。" +
			"原因可以共存（不像预测候选那样互斥）。",
		inputSchema: z.object({
			causes: z.array(
				z.object({
					label: z.string().describe("简短的原因标签（如 'API 依赖延期', '工程师超载'）"),
					description: z.string().describe("一句话原因描述"),
					causalPathRef: z.object({
						edgeIds: z.array(z.string()).describe("支持该原因的因果边 ID"),
						rootCauseMatcher: z.string().describe("根本原因事件模式"),
						finalEffectMatcher: z.string().describe("最终效果模式（应与结果匹配）"),
					}),
					timelineEvidenceIds: z
						.array(z.string())
						.default([])
						.describe("来自 query_events 的支持该原因的事件 ID"),
					canCoexistWith: z
						.array(z.string())
						.default([])
						.describe("可同时发生的原因标签"),
				}),
			),
		}),
		execute: async ({ causes }): Promise<ToolResult> => {
			maybeLogToolCall("propose_causes", { count: causes.length }, policy);

			const added = causes.map((c) =>
				workspace.addCause({
					label: c.label,
					description: c.description,
					causalPathRef: c.causalPathRef,
					timelineEvidenceIds: c.timelineEvidenceIds,
					canCoexistWith: c.canCoexistWith,
				}),
			);

			return toolOk({
				causes: added.map((c) => ({ id: c.id, label: c.label })),
				note: "Causes recorded. The Diagnostic Critic will compute attribution scores using but-for testing.",
			});
		},
	});

	const record_event = tool({
		description:
			"如果事件尚未存在，将其记录到 EventStore 中。" +
			"当你从领域知识或用户描述中发现一个尚未存储的事件时使用此方法。",
		inputSchema: z.object({
			id: z.string().describe("唯一事件 ID（如 'evt_scope_added_2026_04_08'）"),
			type: z.string().describe("事件类型字符串（如 'scope_added', 'delivery_slip'）"),
			occurredAt: z.string().describe("ISO 8601 事件发生时间"),
			actorId: z.string().optional().describe("触发此事件的人或物"),
			affectedEntities: z.array(z.string()).describe("受此事件影响的实体 ID"),
			payload: z.record(z.string(), z.unknown()).default({}).describe("事件特定数据"),
		}),
		execute: async ({
			id,
			type,
			occurredAt,
			actorId,
			affectedEntities,
			payload,
		}): Promise<ToolResult> => {
			maybeLogToolCall("record_event", { id, type, occurredAt }, policy);

			for (const eid of affectedEntities) {
				if (!checkEntityAccess(eid, policy)) {
					return toolErr("POLICY_DENIED", `Access to entity '${eid}' denied`);
				}
			}

			const event: Event = {
				id,
				type,
				occurredAt,
				actorId,
				affectedEntities,
				payload,
			};

			eventStore.addEvent(event);

			return toolOk({
				recorded: true,
				eventId: id,
				type,
				occurredAt,
			});
		},
	});

	return { query_events, walk_causal_graph, propose_causes, record_event };
}