import { tool } from "ai";
import { z } from "zod";
import {
	evaluateConstraint,
	getConstraintById,
} from "../../ontology/constraints";
import type { DecisionWorkspace } from "../../ontology/decision";
import type { Graph } from "../../runtime/graph";
import { AgentPropertyRegistry } from "../../runtime/registry";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";

type AggregateMetric = "sum" | "count" | "avg" | "min" | "max";

export function createDecisionTools(
	workspace: DecisionWorkspace,
	graph: Graph,
) {
	const propose_candidates = tool({
		description:
			"Propose candidate answers for the decision question. Each candidate has a label and description.",
		inputSchema: z.object({
			candidates: z
				.array(
					z.object({
						label: z
							.string()
							.describe("Short label (e.g. 'HIGH', 'MEDIUM', 'LOW')"),
						description: z
							.string()
							.describe("Explanation of what this candidate means"),
					}),
				)
				.describe("Candidate answers to propose"),
		}),
		execute: async ({ candidates }): Promise<ToolResult> => {
			const results = candidates.map((c) =>
				workspace.addCandidate(c.label, c.description),
			);
			return toolOk({
				candidates: results.map((c) => ({ id: c.id, label: c.label })),
				count: results.length,
			});
		},
	});

	const record_evidence = tool({
		description:
			"Record a piece of evidence discovered during graph exploration. Link it to entity IDs and rule IDs.",
		inputSchema: z.object({
			sourceType: z
				.enum(["property", "method_result", "rule_evaluation", "aggregation"])
				.describe("How this evidence was obtained"),
			entityIds: z
				.array(z.string())
				.describe("Entity IDs this evidence relates to"),
			relatedRuleIds: z
				.array(z.string())
				.default([])
				.describe("Rule IDs this evidence supports"),
			content: z
				.string()
				.describe("Human-readable description of the evidence"),
			confidence: z.number().min(0).max(1).describe("Confidence level 0-1"),
			candidateId: z
				.string()
				.optional()
				.describe("Optional: link this evidence to a candidate"),
		}),
		execute: async ({
			sourceType,
			entityIds,
			relatedRuleIds,
			content,
			confidence,
			candidateId,
		}): Promise<ToolResult> => {
			const ev = workspace.addEvidence({
				sourceType,
				entityIds,
				relatedRuleIds,
				content,
				confidence,
			});

			for (const ruleId of relatedRuleIds) {
				workspace.addTriggeredRule(ruleId);
			}

			if (candidateId) {
				const linked = workspace.linkEvidenceToCandidate(candidateId, ev.id);
				if (!linked) {
					return toolOk({
						evidenceId: ev.id,
						warning: `Candidate '${candidateId}' not found, evidence recorded but not linked`,
					});
				}
			}

			return toolOk({ evidenceId: ev.id, content: ev.content });
		},
	});

	const aggregate_facts = tool({
		description:
			"Aggregate property values across multiple entities. Supports sum, count, avg, min, max.",
		inputSchema: z.object({
			entityIds: z.array(z.string()).describe("Entity IDs to aggregate over"),
			property: z.string().describe("Property name to aggregate"),
			metric: z
				.enum(["sum", "count", "avg", "min", "max"])
				.describe("Aggregation function"),
			filterBy: z
				.record(z.string(), z.any())
				.optional()
				.describe(
					"Optional filter: only include entities where properties match",
				),
		}),
		execute: async ({
			entityIds,
			property,
			metric,
			filterBy,
		}): Promise<ToolResult> => {
			const values: number[] = [];
			const matchedIds: string[] = [];

			for (const id of entityIds) {
				const node = graph.getNode(id);
				if (!node) continue;

				if (filterBy) {
					const props = node.getProperties();
					let match = true;
					for (const [key, val] of Object.entries(filterBy)) {
						if (props[key] !== val) {
							match = false;
							break;
						}
					}
					if (!match) continue;
				}

				const props = node.getProperties();
				if (property in props) {
					const val = props[property];
					if (typeof val === "number") {
						values.push(val);
						matchedIds.push(id);
					}
				}
			}

			if (values.length === 0) {
				return toolErr(
					"EMPTY_RESULT",
					`No numeric values found for property '${property}' on given entities`,
					{
						expected: { hint: "Check entity IDs and property name" },
					},
				);
			}

			let result: number;
			switch (metric) {
				case "sum":
					result = values.reduce((a, b) => a + b, 0);
					break;
				case "count":
					result = values.length;
					break;
				case "avg":
					result = values.reduce((a, b) => a + b, 0) / values.length;
					break;
				case "min":
					result = Math.min(...values);
					break;
				case "max":
					result = Math.max(...values);
					break;
			}

			return toolOk({
				metric,
				property,
				value: result,
				entityCount: matchedIds.length,
				entityIds: matchedIds,
			});
		},
	});

	const evaluate_candidates = tool({
		description:
			"Evaluate and score candidate answers against criteria/rules. Each criterion is evaluated and scores are aggregated.",
		inputSchema: z.object({
			candidateIds: z.array(z.string()).describe("Candidate IDs to evaluate"),
			criteriaIds: z
				.array(z.string())
				.describe("Constraint/rule IDs to use as criteria"),
			facts: z
				.record(z.string(), z.any())
				.default({})
				.describe("Fact values to use for rule evaluation"),
		}),
		execute: async ({
			candidateIds,
			criteriaIds,
			facts,
		}): Promise<ToolResult> => {
			const candidates = candidateIds
				.map((id) => workspace.getCandidate(id))
				.filter(Boolean);
			if (candidates.length === 0) {
				return toolErr(
					"WORKSPACE_MISSING",
					"No valid candidates found in workspace",
					{
						expected: {
							availableCandidates: workspace.listCandidates().map((c) => c.id),
						},
					},
				);
			}

			const evaluations: Array<{
				criterionId: string;
				result: any;
			}> = [];

			for (const criterionId of criteriaIds) {
				const constraint = getConstraintById(criterionId);
				if (!constraint) continue;

				const evalResult = evaluateConstraint(criterionId, facts);
				evaluations.push({ criterionId, result: evalResult });

				if ("triggered" in evalResult && evalResult.triggered) {
					workspace.addTriggeredRule(criterionId);
				}

				if (
					"missingFacts" in evalResult &&
					evalResult.missingFacts.length > 0
				) {
					workspace.addUncertainty({
						description: `Rule ${criterionId} missing facts: ${evalResult.missingFacts.join(", ")}`,
						impact: "medium",
						missingFacts: evalResult.missingFacts,
						nextQuery: `Collect ${evalResult.missingFacts.join(", ")} for ${constraint.appliesTo.join("/")} entities`,
					});
				}
			}

			const triggeredCount = evaluations.filter(
				(e) => "triggered" in e.result && e.result.triggered,
			).length;
			const totalCriteria = evaluations.length;

			for (const candidate of candidates) {
				if (!candidate) continue;
				const label = candidate.label.toUpperCase();
				let score: number;

				if (label === "HIGH" || label === "高风险") {
					score = triggeredCount / Math.max(totalCriteria, 1);
				} else if (label === "LOW" || label === "低风险") {
					score = 1 - triggeredCount / Math.max(totalCriteria, 1);
				} else {
					score = 0.5;
				}

				workspace.setCandidateScore(
					candidate.id,
					Math.round(score * 100) / 100,
				);
			}

			return toolOk({
				evaluations,
				triggeredRules: workspace.listTriggeredRules(),
				candidates: workspace.listCandidates().map((c) => ({
					id: c.id,
					label: c.label,
					score: c.score,
					evidenceCount: c.supportingEvidenceIds.length,
				})),
				uncertainties: workspace.listUncertainties(),
			});
		},
	});

	return {
		propose_candidates,
		record_evidence,
		aggregate_facts,
		evaluate_candidates,
	};
}
