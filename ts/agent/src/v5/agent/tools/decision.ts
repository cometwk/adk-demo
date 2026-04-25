import { tool } from "ai";
import { z } from "zod";
import type { DecisionWorkspace } from "../../ontology/decision";
import { failure, success } from "../../runtime/decorator";
import type { Graph } from "../../runtime/graph";
import type { ToolResult } from "../../runtime/types";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 决策支持工具：propose_candidates, record_evidence, aggregate_facts, evaluate_candidates
// 使用 DecisionWorkspace 维护稳定的 ID
// ─────────────────────────────────────────────────────────────────────────────────

export function createDecisionTools(
	workspace: DecisionWorkspace,
	graph: Graph,
) {
	const propose_candidates = tool({
		description:
			"Propose candidate answers for a decision question. For risk assessment, typical candidates are HIGH, MEDIUM, LOW, and INSUFFICIENT_DATA.",
		inputSchema: z.object({
			question: z.string().describe("The decision question"),
			intent: z
				.enum([
					"risk_assessment",
					"prioritization",
					"diagnosis",
					"recommendation",
					"unknown",
				])
				.describe("The decision intent"),
			candidates: z
				.array(
					z.object({
						answer: z.string().describe("The candidate answer value"),
						summary: z.string().describe("Brief explanation of this candidate"),
					}),
				)
				.describe("List of candidate answers to propose"),
		}),
		execute: async ({
			question,
			intent,
			candidates,
		}): Promise<
			ToolResult<{
				candidates: Array<{ id: string; answer: string; summary: string }>;
			}>
		> => {
			workspace.setup(question, intent, workspace.getEntryEntities());

			const proposed: Array<{ id: string; answer: string; summary: string }> =
				[];
			for (const c of candidates) {
				const candidate = workspace.proposeCandidate({
					answer: c.answer,
					summary: c.summary,
					confidence: 0.5, // initial confidence
					supportingEvidenceIds: [],
					opposingEvidenceIds: [],
					triggeredConstraintIds: [],
				});
				proposed.push({
					id: candidate.id,
					answer: candidate.answer,
					summary: candidate.summary,
				});
			}

			return success({ candidates: proposed });
		},
	});

	const record_evidence = tool({
		description:
			"Record an evidence statement with its source, related entities, and confidence. Evidence can support or oppose candidate answers.",
		inputSchema: z.object({
			statement: z.string().describe("The evidence statement"),
			source: z
				.enum(["node", "edge", "method", "rule", "aggregate", "user"])
				.describe("Source of this evidence"),
			entityIds: z
				.array(z.string())
				.describe("Entity IDs this evidence relates to"),
			constraintIds: z
				.array(z.string())
				.optional()
				.describe("Related constraint/rule IDs"),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.default(1)
				.describe("Confidence level (0-1)"),
		}),
		execute: async ({
			statement,
			source,
			entityIds,
			constraintIds,
			confidence,
		}): Promise<
			ToolResult<{
				id: string;
				statement: string;
			}>
		> => {
			// 验证实体存在
			for (const entityId of entityIds) {
				if (!graph.getNode(entityId)) {
					return failure("not_found", `Entity '${entityId}' not found`, false);
				}
			}

			const evidence = workspace.recordEvidence({
				source,
				statement,
				entityIds,
				constraintIds: constraintIds ?? [],
				confidence,
			});

			return success({ id: evidence.id, statement: evidence.statement });
		},
	});

	const aggregate_facts = tool({
		description:
			"Aggregate facts from entities. Compute sum, count, or other metrics over entity properties.",
		inputSchema: z.object({
			entityIds: z.array(z.string()).describe("Entity IDs to aggregate over"),
			metric: z
				.enum([
					"sum(workload)",
					"count(seniority=senior)",
					"count(seniority=mid)",
					"count(seniority=junior)",
					"member_count",
				])
				.describe("The metric to compute"),
		}),
		execute: async ({
			entityIds,
			metric,
		}): Promise<
			ToolResult<{
				value: number;
				evidence: string[];
			}>
		> => {
			// 验证实体存在
			const nodes: any[] = [];
			for (const entityId of entityIds) {
				const node = graph.getNode(entityId);
				if (!node) {
					return failure("not_found", `Entity '${entityId}' not found`, false);
				}
				nodes.push(node);
			}

			let value = 0;
			const evidence: string[] = [];

			switch (metric) {
				case "sum(workload)": {
					for (const node of nodes) {
						const workload = (node as any).workload;
						if (typeof workload === "number") {
							value += workload;
							evidence.push(`${node.id} workload = ${workload}`);
						}
					}
					break;
				}
				case "count(seniority=senior)": {
					for (const node of nodes) {
						if ((node as any).seniority === "senior") {
							value++;
							evidence.push(`${node.id} seniority = senior`);
						}
					}
					break;
				}
				case "count(seniority=mid)": {
					for (const node of nodes) {
						if ((node as any).seniority === "mid") {
							value++;
							evidence.push(`${node.id} seniority = mid`);
						}
					}
					break;
				}
				case "count(seniority=junior)": {
					for (const node of nodes) {
						if ((node as any).seniority === "junior") {
							value++;
							evidence.push(`${node.id} seniority = junior`);
						}
					}
					break;
				}
				case "member_count": {
					value = nodes.length;
					for (const node of nodes) {
						evidence.push(`member: ${node.id}`);
					}
					break;
				}
				default:
					return failure("invalid_metric", `Unknown metric: ${metric}`, false);
			}

			return success({ value, evidence });
		},
	});

	const evaluate_candidates = tool({
		description:
			"Evaluate candidates against criteria. Updates candidate scores and confidence based on recorded evidence.",
		inputSchema: z.object({
			candidateIds: z.array(z.string()).describe("Candidate IDs to evaluate"),
			criteriaIds: z.array(z.string()).describe("Criteria/rule IDs to apply"),
		}),
		execute: async ({
			candidateIds,
			criteriaIds,
		}): Promise<
			ToolResult<{
				ranking: Array<{
					candidateId: string;
					score: number;
					confidence: number;
				}>;
			}>
		> => {
			// 验证候选存在
			const candidates = [];
			for (const id of candidateIds) {
				const candidate = workspace.getCandidate(id);
				if (!candidate) {
					return failure("not_found", `Candidate '${id}' not found`, false);
				}
				candidates.push(candidate);
			}

			// 验证规则存在（可选，允许未知规则）
			const allEvidence = workspace.getAllEvidence();

			// 计算每个候选的评分（基于证据和规则的简单模型）
			const ranking: Array<{
				candidateId: string;
				score: number;
				confidence: number;
			}> = [];

			for (const candidate of candidates) {
				// 基于支持/反对证据计算
				const supportCount = candidate.supportingEvidenceIds.length;
				const opposeCount = candidate.opposingEvidenceIds.length;

				// 简化的评分模型
				let score = 0.5;
				if (candidate.answer === "HIGH") {
					score = supportCount > opposeCount ? 0.7 : 0.4;
				} else if (candidate.answer === "MEDIUM") {
					score = 0.6;
				} else if (candidate.answer === "LOW") {
					score = opposeCount > supportCount ? 0.3 : 0.5;
				} else if (candidate.answer === "INSUFFICIENT_DATA") {
					score = 0.4;
				}

				// 更新候选的评分
				workspace.updateCandidate(candidate.id, { score });

				ranking.push({
					candidateId: candidate.id,
					score,
					confidence: candidate.confidence,
				});
			}

			// 按评分排序
			ranking.sort((a, b) => b.score - a.score);

			return success({ ranking });
		},
	});

	return {
		propose_candidates,
		record_evidence,
		aggregate_facts,
		evaluate_candidates,
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出工具类型
// ─────────────────────────────────────────────────────────────────────────────────

export type DecisionTools = ReturnType<typeof createDecisionTools>;
