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
			"Query the event timeline for one or more entities within a time window. " +
			"Returns events sorted chronologically. Use before walk_causal_graph to understand what happened.",
		inputSchema: z.object({
			entityId: z.string().describe("Entity ID to query events for"),
			from: z.string().optional().describe("ISO 8601 start time (inclusive)"),
			to: z.string().optional().describe("ISO 8601 end time (inclusive)"),
			eventTypes: z
				.array(z.string())
				.optional()
				.describe("Filter by event type strings"),
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
			"Walk the causal graph backward (from outcome) or forward (from cause) to find candidate causes or effects. " +
			"Returns CausalPaths. Use this INSTEAD of assuming causal relationships from temporal co-occurrence.",
		inputSchema: z.object({
			seed: z.string().describe("Starting pattern matcher (e.g. 'milestone_missed', 'Engineer.workload > threshold')"),
			direction: z
				.enum(["backward", "forward"])
				.describe("backward: from outcome to causes; forward: from cause to effects"),
			maxDepth: z.number().min(1).max(5).default(3).describe("Maximum chain depth"),
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
			"Propose candidate causes for the outcome. " +
			"Each cause must include a causalPathRef referencing edges from walk_causal_graph. " +
			"Causes CAN co-exist (not mutually exclusive like predictive candidates).",
		inputSchema: z.object({
			causes: z.array(
				z.object({
					label: z.string().describe("Short cause label (e.g. 'API 依赖延期', '工程师超载')"),
					description: z.string().describe("One-sentence cause description"),
					causalPathRef: z.object({
						edgeIds: z.array(z.string()).describe("Causal edge IDs supporting this cause"),
						rootCauseMatcher: z.string().describe("The root cause event pattern"),
						finalEffectMatcher: z.string().describe("The final effect pattern (should match the outcome)"),
					}),
					timelineEvidenceIds: z
						.array(z.string())
						.default([])
						.describe("Event IDs from query_events that support this cause"),
					canCoexistWith: z
						.array(z.string())
						.default([])
						.describe("Other cause labels that can co-occur"),
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
			"Record an event in the EventStore if it is not already present. " +
			"Use when you have discovered an event from domain knowledge or user description that is not yet in the store.",
		inputSchema: z.object({
			id: z.string().describe("Unique event ID (e.g. 'evt_scope_added_2026_04_08')"),
			type: z.string().describe("Event type string (e.g. 'scope_added', 'delivery_slip')"),
			occurredAt: z.string().describe("ISO 8601 when this event occurred"),
			actorId: z.string().optional().describe("Who or what triggered this event"),
			affectedEntities: z.array(z.string()).describe("Entity IDs affected by this event"),
			payload: z.record(z.string(), z.unknown()).default({}).describe("Event-specific data"),
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
