import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolOk } from "../../runtime/types";
import type { CounterfactualOffer } from "../../ontology/decision";
import type { PolicyContext } from "../../policy/context";
import { maybeLogToolCall } from "../../policy/filters";

// ── Simulate (counterfactual) tool ──
//
// Two modes:
//   what_if (predictive): override current fact values → see how verdict changes
//   but_for (diagnostic): erase a past event → see if outcome would still occur
//
// The tool generates a CounterfactualOffer but does NOT execute the re-run.
// The orchestrator (index.ts) decides whether to materialize it.

let _offers: CounterfactualOffer[] = [];
let _offerId = 0;

export function getCounterfactualOffers(): CounterfactualOffer[] {
	return [..._offers];
}

export function resetCounterfactuals(): void {
	_offers = [];
	_offerId = 0;
}

export function createCounterfactualTools(policy: PolicyContext) {
	const simulate = tool({
		description:
			"Generate a counterfactual offer to explore how the outcome changes under different conditions. " +
			"For what_if: specify entity property overrides to simulate. " +
			"For but_for: specify an event ID to erase from the timeline. " +
			"The orchestrator may or may not execute the simulation; this call is non-blocking.",
		inputSchema: z.object({
			mode: z
				.enum(["what_if", "but_for"])
				.describe("what_if = forward simulation; but_for = erase past event"),
			description: z
				.string()
				.describe("Natural language description of the counterfactual scenario"),
			overrides: z
				.array(
					z.object({
						entityId: z.string(),
						property: z.string(),
						value: z.unknown(),
					}),
				)
				.optional()
				.describe("Fact overrides for what_if mode"),
			eraseEventId: z
				.string()
				.optional()
				.describe("Event ID to erase from EventStore for but_for mode"),
			impactPreview: z
				.object({
					before: z.string(),
					estimatedAfter: z.string(),
					rerunCostHint: z.enum(["cheap", "moderate", "expensive"]),
				})
				.optional()
				.describe("Preview of expected impact"),
		}),
		execute: async ({
			mode,
			description,
			overrides,
			eraseEventId,
			impactPreview,
		}): Promise<ToolResult> => {
			maybeLogToolCall("simulate", { mode, description }, policy);

			const offer: CounterfactualOffer = {
				id: `cf_${++_offerId}`,
				mode,
				description,
				overrides,
				eraseEventId,
				impactPreview,
			};

			_offers.push(offer);

			return toolOk({
				offerId: offer.id,
				mode,
				description,
				note: "Counterfactual offer recorded. The orchestrator will include it in the final response for the user to accept.",
			});
		},
	});

	return { simulate };
}
