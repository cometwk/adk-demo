import { getRiskAssessmentRules } from "../ontology/constraints";
import { getAllRelationSchemas, getAllTypeSchemas } from "../ontology/schema";
import type { Graph } from "../runtime/graph";
import { toolCategories } from "./tools";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 Prompt 构建器
// 关键变化：不再注入全量实体目录，只提供入口实体、类型/关系 schema、规则摘要
// ─────────────────────────────────────────────────────────────────────────────────

export type PromptConfig = {
	goal: string;
	entryEntities: string[];
	graph: Graph;
};

export function buildSystemPrompt(config: PromptConfig): string {
	const { goal, entryEntities } = config;

	// 获取类型 schema 摘要
	const typeSummary = getAllTypeSchemas()
		.map((t) => `- ${t.name}: ${t.description}`)
		.join("\n");

	// 获取关系 schema 摘要
	const relationSummary = getAllRelationSchemas()
		.map(
			(r) =>
				`- ${r.sourceType} --${r.name}--> ${r.targetType} (${r.cardinality})`,
		)
		.join("\n");

	// 获取规则摘要（只列出 ID 和描述）
	const rulesSummary = getRiskAssessmentRules()
		.map((r) => `- ${r.id}: ${r.description}`)
		.join("\n");

	// 工具说明
	const toolDocs = Object.entries(toolCategories)
		.map(([category, tools]) => `${category}: ${tools.join(", ")}`)
		.join("\n");

	// 入口实体
	const entryEntityList = entryEntities.map((e) => `- ${e}`).join("\n");

	return `You are a decision-support agent over an ontology-backed semantic graph.
Your job is NOT to force a single answer too early.
For ambiguous questions, generate candidate answers, gather evidence, apply constraints, and explain uncertainty.

GOAL:
${goal}

ENTRY ENTITIES:
${entryEntityList}

ONTOLOGY SUMMARY:
Types:
${typeSummary}

Relation schema:
${relationSummary}

Decision criteria (for risk assessment):
${rulesSummary}

TOOL STRATEGY:
${toolDocs}

DECISION PROCESS:
1. Use inspect_rules to understand applicable criteria
2. Use propose_candidates to frame possible answers
3. Use inspect_node/query_neighbors to discover relevant entities from entry points
4. Use describe_method before call_method to understand required params
5. Use aggregate_facts to compute metrics over entities
6. Use record_evidence to preserve important findings with stable IDs
7. Use evaluate_candidates to compare answers against criteria
8. Produce output with: recommendation, alternatives, evidence, triggered rules, uncertainty, next queries

OUTPUT FORMAT:
Your final answer should include:
- 推荐判断 (Recommended answer)
- 备选判断 (Alternative answers)
- 关键证据 (Key evidence with IDs)
- 触发规则 (Triggered rule IDs)
- 不确定性 (Uncertainty and missing facts)
- 建议下一步 (Next information to collect)

Remember: Cite evidence IDs and rule IDs in your explanation. Surface missing high-impact facts instead of pretending certainty.
`;
}
