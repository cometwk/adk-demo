// ── Diagnostic Prompt Builder (V8 Pipeline) ──

import type { PromptParams } from '../../core/types'
import { buildOntologyPrompt } from '../../../ontology/prompt'

// ── Build Diagnostic System Prompt ──

/**
 * Build system prompt for Diagnostic task.
 * Composition: ontology layer + rules layer + diagnostic layer + custom context
 */
export function buildDiagnosticPrompt(params: PromptParams): string {
  // 1. Ontology layer (common)
  const ontologySection = buildOntologyPrompt(params.ontology)

  // 2. Rules section (optional)
  const rulesSection = params.rules?.length
    ? buildRulesSummary(params.rules)
    : ''

  // 3. Diagnostic task-specific instructions
  const taskSection = `# 任务：后向归因

你是一个结构化决策支持 Agent，当前模式：Diagnostic（后向归因）。

## 目标
从已观测的结果出发，逆向追溯根因，进行归因分析。

## 操作规则

### 查询分工
1. inspect_node — 查看实体详情（type, properties）
2. search_nodes — 按类型搜索实体
3. query_neighbors — 查询实体的邻居关系
4. graph_query — 声明式图遍历（因果图）
5. compute_query — OLAP 聚合分析
6. vector_query — 语义相似度搜索

### 因果路径追踪
- 使用 trace_causal 追溯因果路径
- 查询时间线上的关键事件
- 记录证据关联到候选根因

### 事实收集
- Runtime 自动记录查询产生的快照事实
- Agent 通过 bind_fact 显式绑定归因断言
- 使用 record_evidence 记录因果关系证据

### 归因边界
- 你不负责计算归因分数
- 你的职责是收集完整的时间线证据
- 让 Critic 进行必要性/充分性评估

## 输出格式

完成归因分析后，用以下 JSON 结构给出最终判断：

\`\`\`json
{
  "source": "model",
  "mode": "diagnostic",
  "rankedAttributions": [
    {
      "causeId": "<cause_id>",
      "label": "<根因标签>",
      "necessity": 0.0–1.0,
      "sufficiency": 0.0–1.0,
      "pathCompleteness": 0.0–1.0,
      "temporalPlausibility": 0.0–1.0,
      "attributionScore": 0.0–1.0,
      "confidence": 0.0–1.0,
      "rationale": "归因理由"
    }
  ],
  "overdetermined": true/false,
  "notes": [],
  "rationale": "整体推理说明",
  "citedEvidenceIds": ["ev_1"]
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
    const directionStr = r.direction ? ` | 方向: ${r.direction}` : ''
    const weightStr = r.weight ? ` | 权重: ${r.weight}` : ''
    return `- ${r.id}: ${r.description}${directionStr}${weightStr}`
  })

  return `# 规则摘要

以下规则可用于归因约束（共 ${rules.length} 条）：

${ruleLines.join('\n')}
`
}

// ── Re-export for convenience ──

export { buildOntologyPrompt } from '../../../ontology/prompt'