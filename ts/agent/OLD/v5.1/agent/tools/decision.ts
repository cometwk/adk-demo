import { tool } from "ai";
import { z } from "zod";
import {
	evaluateConstraint,
	getConstraintById,
} from "../../ontology/constraints";
import type { DecisionWorkspace } from "../../ontology/decision";
import type { Graph } from "../../runtime/graph";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";

export function createDecisionTools(
	workspace: DecisionWorkspace,
	graph: Graph,
) {
	const propose_candidates = tool({
		description:
			"为决策问题提出候选答案。每个候选答案包含标签和描述。",
		inputSchema: z.object({
			candidates: z
				.array(
					z.object({
						label: z
							.string()
							.describe("简短标签（如 'HIGH', 'MEDIUM', 'LOW'）"),
						description: z
							.string()
							.describe("解释该候选答案的含义"),
					}),
				)
				.describe("要提出的候选答案"),
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
			"记录图谱探索过程中发现的证据。关联到实体 ID 和规则 ID。",
		inputSchema: z.object({
			sourceType: z
				.enum(["property", "method_result", "rule_evaluation", "aggregation"])
				.describe("证据获取方式"),
			entityIds: z
				.array(z.string())
				.describe("该证据相关的实体 ID"),
			relatedRuleIds: z
				.array(z.string())
				.default([])
				.describe("该证据支持的规则 ID"),
			content: z
				.string()
				.describe("证据的人类可读描述"),
			confidence: z.number().min(0).max(1).describe("置信度 0-1"),
			candidateId: z
				.string()
				.optional()
				.describe("可选：将证据关联到某个候选答案"),
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
						warning: `候选答案 '${candidateId}' 未找到，证据已记录但未关联`,
					});
				}
			}

			return toolOk({ evidenceId: ev.id, content: ev.content });
		},
	});

	const aggregate_facts = tool({
		description:
			"跨多个实体聚合属性值。支持 sum, count, avg, min, max。",
		inputSchema: z.object({
			entityIds: z.array(z.string()).describe("要聚合的实体 ID"),
			property: z.string().describe("要聚合的属性名"),
			metric: z
				.enum(["sum", "count", "avg", "min", "max"])
				.describe("聚合函数"),
			filterBy: z
				.record(z.string(), z.any())
				.optional()
				.describe(
					"可选过滤条件：仅包含属性匹配的实体",
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
					`在给定实体上未找到属性 '${property}' 的数值`,
					{
						expected: { hint: "检查实体 ID 和属性名" },
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
			"根据准则/规则评估和打分候选答案。每条准则被评估后汇总得分。",
		inputSchema: z.object({
			candidateIds: z.array(z.string()).describe("要评估的候选答案 ID"),
			criteriaIds: z
				.array(z.string())
				.describe("用作评估准则的约束/规则 ID"),
			facts: z
				.record(z.string(), z.any())
				.default({})
				.describe("用于规则评估的事实值"),
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
					"工作区中未找到有效的候选答案",
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
						description: `规则 ${criterionId} 缺失事实: ${evalResult.missingFacts.join(", ")}`,
						impact: "medium",
						missingFacts: evalResult.missingFacts,
						nextQuery: `为 ${constraint.appliesTo.join("/")} 实体收集 ${evalResult.missingFacts.join(", ")}`,
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