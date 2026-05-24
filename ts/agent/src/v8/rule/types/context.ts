import type { FactStore } from '../../engine/stores/fact-store'
import type { GraphStore } from '../../engine/stores/graph-store'

// ── Rule Context ──
// Rule evaluator 的执行上下文
// graph 可选：某些规则只依赖 FactStore
// now 可选注入：避免 new Date() 导致不可重放

export interface RuleContext {
  facts: FactStore // 来自 engine/stores/fact-store
  graph?: GraphStore // 来自 engine/stores/graph-store
  entityId?: string // 逐实体评估时设置
  now?: Date // 当前时间（可注入，便于确定性测试）
}

// ── Missing Fact ──

export type MissingFact = {
  entityId?: string
  property: string
}

// ── Rule Result ──

export type RuleResult = {
  triggered: boolean
  explanation?: string
  missingFacts?: MissingFact[]
  error?: string
}