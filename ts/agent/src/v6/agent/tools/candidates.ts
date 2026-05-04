import { tool } from "ai";
import { z } from "zod";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";
import type { DecisionWorkspace } from "../../ontology/decision";
import type { PolicyContext } from "../../policy/context";
import { maybeLogToolCall } from "../../policy/filters";

// ── Candidate and Evidence tools ──
//
// Note: evaluate_candidates is NOT included here (removed from V6).
// The executor's job is to collect facts and evidence.
// The critic does the scoring.

export function createCandidateTools(workspace: DecisionWorkspace, policy: PolicyContext) {
	const propose_candidates = tool({
		description:
			"Propose the mutually exclusive candidate answers for the decision. " +
			"Must be called once (or updated) before recording evidence. " +
			"Examples: [{label:'HIGH',description:'...'},{label:'MEDIUM',...},{label:'LOW',...}]",
		inputSchema: z.object({
			candidates: z.array(
				z.object({
					label: z.string().describe("Short answer label (e.g. HIGH, MEDIUM, LOW)"),
					description: z.string().describe("One-sentence rationale for this candidate"),
				}),
			),
		}),
		execute: async ({ candidates }): Promise<ToolResult> => {
			maybeLogToolCall("propose_candidates", { count: candidates.length }, policy);

			const added = candidates.map((c) => workspace.addCandidate(c.label, c.description));
			return toolOk({
				candidates: added.map((c) => ({ id: c.id, label: c.label })),
				hint: "Now collect facts and evidence, then call record_evidence to link them to candidates.",
			});
		},
	});

	const record_evidence = tool({
		description:
			"Record a piece of evidence and link it to one or more candidate answers. " +
			"Base confidence is determined by source kind; you may apply a modifier in {-0.2, 0, +0.2}. " +
			"Cite the rule IDs this evidence relates to.",
		inputSchema: z.object({
			sourceKind: z
				.enum(["property", "method_result", "rule_evaluation", "aggregation", "event", "causal_path"])
				.describe("Where this evidence comes from"),
			entityIds: z.array(z.string()).describe("Entity IDs this evidence pertains to"),
			relatedRuleIds: z.array(z.string()).describe("Rule IDs this evidence relates to"),
			content: z.string().describe("Human-readable description of the evidence"),
			baseConfidence: z.number().min(0).max(1).describe("Base confidence 0..1"),
			confidenceModifier: z
				.number()
				.min(-0.2)
				.max(0.2)
				.default(0)
				.describe("LLM modifier ∈ {-0.2, 0, +0.2}"),
			supportsCandidateIds: z
				.array(z.string())
				.default([])
				.describe("Candidate IDs this evidence supports"),
		}),
		execute: async ({
			sourceKind,
			entityIds,
			relatedRuleIds,
			content,
			baseConfidence,
			confidenceModifier,
			supportsCandidateIds,
		}): Promise<ToolResult> => {
			maybeLogToolCall("record_evidence", { entityIds, sourceKind }, policy);

			const confidence = Math.max(0, Math.min(1, baseConfidence + confidenceModifier));
			const ev = workspace.addEvidence({
				sourceKind,
				entityIds,
				relatedRuleIds,
				content,
				confidence,
				observedAt: new Date().toISOString(),
			});

			for (const candId of supportsCandidateIds) {
				workspace.linkEvidenceToCandidate(candId, ev.id);
			}

			return toolOk({
				evidenceId: ev.id,
				confidence,
				linkedCandidates: supportsCandidateIds,
			});
		},
	});

	const list_workspace = tool({
		description: "List current workspace state: candidates, evidence, and uncertainties.",
		inputSchema: z.object({}),
		execute: async (): Promise<ToolResult> => {
			return toolOk({
				candidates: workspace.listCandidates(),
				evidence: workspace.listEvidence().map((e) => ({
					id: e.id,
					sourceKind: e.sourceKind,
					content: e.content.slice(0, 100),
					confidence: e.confidence,
				})),
				uncertainties: workspace.listUncertainties(),
				triggeredRuleIds: workspace.listTriggeredRules(),
			});
		},
	});

	const declare_uncertainty = tool({
		description:
			"Record a known uncertainty — a missing fact or ambiguous signal that affects confidence. " +
			"The system will surface unresolved uncertainties in the final response.",
		inputSchema: z.object({
			description: z.string().describe("What is uncertain"),
			impact: z.enum(["low", "medium", "high"]).describe("How much this uncertainty affects the decision"),
			missingFacts: z.array(z.string()).default([]).describe("Property names that are missing"),
			nextQuery: z.string().optional().describe("Suggested follow-up query to resolve this"),
		}),
		execute: async ({ description, impact, missingFacts, nextQuery }): Promise<ToolResult> => {
			const u = workspace.addUncertainty({ description, impact, missingFacts, nextQuery });
			return toolOk({ uncertaintyId: u.id });
		},
	});

	return { propose_candidates, record_evidence, list_workspace, declare_uncertainty };
}
