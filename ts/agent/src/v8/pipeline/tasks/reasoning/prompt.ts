// ── Reasoning Prompt Builder (V8 Pipeline) ──

import type { PromptParams } from '../../core/types'
import { buildOntologyPrompt } from '../../../ontology/prompt'

// ── Build Reasoning System Prompt ──

/**
 * Build system prompt for Reasoning task.
 * Composition: ontology layer + task layer + custom context
 */
export function buildReasoningPrompt(params: PromptParams): string {
  // 1. Ontology layer (common)
  const ontologySection = buildOntologyPrompt(params.ontology)

  // 2. Rules section (optional)
  const rulesSection = params.rules?.length
    ? buildRulesSummary(params.rules)
    : ''

  // 3. Task-specific instructions
  const taskSection = `# 任务：语义推理

你是一个语义推理 Agent，负责分析业务实体并回答用户问题。

## 操作规则

### 查询分工
1. inspect_node — 查看单个节点详情（type, properties）
2. search_nodes — 按类型搜索节点，可用 where 过滤
3. query_neighbors — 查询节点的邻居关系
4. graph_query — 声明式图遍历（MATCH → TRAVERSE → RETURN）
5. compute_query — OLAP 聚合（count/sum/avg/min/max + groupBy）
6. vector_query — 语义相似度搜索

### 事实收集
- Runtime 自动记录查询产生的快照事实
- Agent 通过 bind_fact 显式绑定高阶语义断言
- 使用 lookup_fact 查询已绑定的事实

## 输出格式

完成推理后，用以下 JSON 结构给出最终判断：

\`\`\`json
{
  "verdict": {
    "answer": "<对用户问题的回答>",
    "entities": ["相关实体ID列表"],
    "rationale": "推理过程说明",
    "confidence": 0.0–1.0
  }
}
\`\`\`
`

  // 4. Custom context (optional injection)
  const customSection = params.customContext ?? ''

  // Compose
  return [ontologySection, rulesSection, taskSection, customSection]
    .filter(Boolean)
    .join('\n\n')
}

// ── Build Rules Summary ──

function buildRulesSummary(rules: import('../../core/types').RuleMetadata[]): string {
  const ruleLines = rules.map((r) => {
    const weightStr = r.weight ? ` (权重: ${r.weight})` : ''
    return `- ${r.id}: ${r.description}${weightStr}`
  })

  return `# 规则摘要

以下规则可用于评价候选方案：

${ruleLines.join('\n')}
`
}

// ── Re-export for convenience ──

export { buildOntologyPrompt } from '../../../ontology/prompt'