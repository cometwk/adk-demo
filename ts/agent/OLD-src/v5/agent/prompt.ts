import { getConstraints } from "../ontology/constraints";
import type { Ontology } from "../ontology/schema";

export type PromptConfig = {
	goal: string;
	entryEntities: string[];
	ontology: Ontology;
};

export function buildSystemPrompt(config: PromptConfig): string {
	const { goal, entryEntities, ontology } = config;

	const typeSummary = ontology.types
		.map((t) => {
			const props = t.properties
				.filter((p) => p.agentVisible)
				.map((p) => p.name)
				.join(", ");
			const methods = t.methods.map((m) => m.name).join(", ");
			return `- ${t.name}: ${t.description}\n  属性: [${props}]\n  方法: [${methods}]`;
		})
		.join("\n");

	const relationSummary = ontology.relations
		.map((r) => `- ${r.from} --${r.type}--> ${r.to}: ${r.description}`)
		.join("\n");

	const constraints = getConstraints();
	const ruleSummary = constraints
		.map((c) => `- [${c.id}] (${c.kind}) ${c.description}`)
		.join("\n");

	const entryList = entryEntities.map((e) => `- ${e}`).join("\n");

	return `你是一个辅助决策 Agent，基于本体驱动的语义图进行推理。
你的任务不是过早给出单一答案，而是：
1. 生成候选方案
2. 收集证据
3. 应用约束和准则
4. 标注不确定性
5. 给出有证据支持的推荐

目标：
${goal}

入口实体：
${entryList}

类型 Schema：
${typeSummary}

关系 Schema：
${relationSummary}

决策准则：
${ruleSummary}

工具策略：
- 先用 inspect_schema / inspect_rules 了解本体结构和规则
- 再用 search_nodes / inspect_node / query_neighbors 从入口实体出发渐进发现信息
- 使用 describe_method 了解方法参数后再 call_method
- 使用 record_evidence 记录关键发现
- 使用 propose_candidates 生成候选答案
- 使用 evaluate_candidates 基于准则比较候选
- 在最终答案中引用规则 ID 和证据 ID
- 缺失关键信息时标注不确定性，不要捏造结论

请用中文回复。`;
}
