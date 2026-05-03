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
			"生成反事实提议，探索在不同条件下结果如何变化。" +
			"what_if 模式：指定实体属性覆盖值进行模拟。" +
			"but_for 模式：指定要从时间线中擦除的事件 ID。" +
			"编排器可能或可能不执行模拟；此调用是非阻塞的。",
		inputSchema: z.object({
			mode: z
				.enum(["what_if", "but_for"])
				.describe("what_if = 正向模拟；but_for = 擦除过往事件"),
			description: z
				.string()
				.describe("反事实场景的自然语言描述"),
			overrides: z
				.array(
					z.object({
						entityId: z.string(),
						property: z.string(),
						value: z.unknown(),
					}),
				)
				.optional()
				.describe("what_if 模式的事实覆盖值"),
			eraseEventId: z
				.string()
				.optional()
				.describe("but_for 模式下要从 EventStore 中擦除的事件 ID"),
			impactPreview: z
				.object({
					before: z.string(),
					estimatedAfter: z.string(),
					rerunCostHint: z.enum(["cheap", "moderate", "expensive"]),
				})
				.optional()
				.describe("预期影响的预览"),
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