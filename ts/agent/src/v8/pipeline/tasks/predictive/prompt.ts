// ── Predictive Prompt Builder (V8 Pipeline) ──

import type { PromptParams } from '../../core/types'
import { buildOntologyPrompt } from '../../../ontology/prompt'

// ── Build Predictive System Prompt ──

/**
 * Build system prompt for Predictive task.
 * Composition: ontology layer + rules layer + predictive layer + custom context
 */
export function buildPredictivePrompt(params: PromptParams): string {
  // 1. Ontology layer (common)
  const ontologySection = buildOntologyPrompt(params.ontology)

  // 2. Rules section (optional but important for predictive)
  const rulesSection = params.rules?.length
    ? buildRulesSummary(params.rules)
    : ''

  // 3. Predictive task-specific instructions
  const taskSection = `# 任务：前向推断

你是一个结构化决策支持 Agent，当前模式：Predictive（前向推断）。

## 目标
根据当前状态推断未来可能的结果，提出候选方案并评估风险。

## 操作规则

### 查询分工
1. inspect_node — 查看实体详情（type, properties）
2. search_nodes — 按类型搜索实体，可用 where 过滤
3. query_neighbors — 查询实体的邻居关系
4. graph_query — 声明式图遍历
5. compute_query — OLAP 聚合分析
6. vector_query — 语义相似度搜索

### 事实收集
- Runtime 自动记录查询产生的快照事实
- Agent 通过 bind_fact 显式绑定语义断言
- 使用 lookup_fact 查询已绑定的事实

### 候选与证据
- 首先调用 propose_candidates 声明候选答案（如 HIGH / MEDIUM / LOW）
- 收集支持某候选的证据时，调用 record_evidence 并关联候选
- 不确定的信号调用 declare_uncertainty 记录

### 评分边界
- 你不负责计算最终分数，也不需要知道规则权重的数值
- 你的职责是把 FactStore 填满，让 Critic 有完整数据进行 MCDA 评分
- 如需查看规则是否触发，使用 evaluate_rule

### 反事实模拟
- 如有反事实想法，调用 simulate_counterfactual 生成 offer
- 不要自己计算结论，等待 Critic 评估

## 输出格式

完成事实收集和证据记录后，用以下 JSON 结构给出最终判断：

\`\`\`json
{
  "source": "model",
  "mode": "predictive",
  "recommendedCandidateId": "<candidate_id>",
  "confidence": 0.0–1.0,
  "rationale": "一段精简的推理过程",
  "citedEvidenceIds": ["ev_1", "ev_2"],
  "citedRuleIds": ["rule_id_1"]
}
\`\`\`

严禁在此 JSON 之外给出风险评级——等待 Critic 和 Reconciler 完成最终裁定。`

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
    const directionStr = r.direction ? ` | 方向: ${r.direction}` : ''
    const weightStr = r.weight ? ` | 权重: ${r.weight}` : ''
    return `- ${r.id}: ${r.description}${directionStr}${weightStr}`
  })

  return `# 规则摘要

以下规则可用于评价候选方案（共 ${rules.length} 条）：

${ruleLines.join('\n')}
`
}

// ── Re-export for convenience ──

export { buildOntologyPrompt } from '../../../ontology/prompt'