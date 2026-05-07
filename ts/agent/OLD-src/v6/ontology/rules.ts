import type { FactStore } from '../runtime/eventStore'
import type { FactBinding } from '../runtime/types'
import type { Graph } from '../runtime/graph'

// ── Rule kinds ──

export type RuleKind =
  | 'hard_constraint' // 触发即否决某些候选, veto: direct elimination of candidate(s)
  | 'inference_rule' // 产生 derived facts, produces derived FactBindings before scoring
  | 'soft_criterion' // 加权打分, weighted contribution to MCDA score
  | 'conflict_policy' // describes how to handle conflicting signals
  | 'explanation_policy' // output formatting / uncertainty policy

// ── Rule direction (for MCDA scoring) ──
// Tells the scorer which candidates this rule pushes toward.
// "risk_up"   → favors HIGH-risk candidates
// "risk_down" → favors LOW-risk candidates
// "neutral"   → no directional effect (used by explanation_policy)

export type RuleDirection = 'risk_up' | 'risk_down' | 'neutral'

// ── Required fact descriptor ──

export type RequiredFact = {
  property: string
  scope: 'entity' | 'type' | 'global'
}

// ── Veto config (hard_constraint only) ──

export type VetoConfig = {
  candidatesByLabel: string[] // e.g. ["LOW"] — eliminated when constraint triggers
}

// ── Evaluation context ──

export type RuleContext = {
  entityId?: string // set when rule is evaluated per-entity
  facts: FactStore
  graph: Graph
}

// ── Evaluation result ──

export type RuleResult = {
  triggered: boolean
  severity?: 'low' | 'medium' | 'high'
  explanation?: string
  derivedFacts?: FactBinding[] // produced by inference_rule
  missingFacts?: Array<{ entityId?: string; property: string }>
}

// ── Rule ──

export type Rule = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[] // entity type names: 适用范围：在哪些类型的实体（如 Engineer 或 Project）上生效
  description: string
  requiredFacts: RequiredFact[] // 所需事实：声明评估此规则必须从事实库中获取哪些属性（如 workload）

  direction: RuleDirection
  weight?: number // 0..1; used for soft_criterion
  severityFn?: (ctx: RuleContext, triggered: boolean) => 'low' | 'medium' | 'high'

  veto?: VetoConfig // 否决配置：hard_constraint 触发时直接否决某些候选
  dependsOn?: string[] // 其他 ruleId；用于构建 DAG，避免重复计数, rule IDs whose results this rule depends on (DAG edges)
  subsumedBy?: string[] // 表示"已经被某条更高层规则蕴含, rule IDs that already capture this rule's signal

  evaluator: (ctx: RuleContext) => RuleResult
  explanation: (result: RuleResult, ctx: RuleContext) => string
}

// ── Rule registry ──

const rules: Rule[] = []

export function registerRule(rule: Rule): void {
  rules.push(rule)
}

export function getRules(): Rule[] {
  return [...rules]
}

export function getRuleById(id: string): Rule | undefined {
  return rules.find((r) => r.id === id)
}

export function queryRules(opts: { intent?: string; entityType?: string; kind?: RuleKind }): Rule[] {
  const intentKeywords: Record<string, string[]> = {
    risk_assessment: ['risk', 'burnout', 'overload', 'pressure', 'dependency', 'coverage'],
    prioritization: ['priority', 'pressure'],
    diagnosis: ['cause', 'blame', 'attribution'],
  }

  return rules.filter((r) => {
    if (opts.entityType && !r.appliesTo.includes(opts.entityType)) return false
    if (opts.kind && r.kind !== opts.kind) return false
    if (opts.intent) {
      const keywords = intentKeywords[opts.intent] ?? []
      if (keywords.length > 0) {
        const idAndDesc = `${r.id} ${r.description}`.toLowerCase()
        if (!keywords.some((k) => idAndDesc.includes(k))) return false
      }
    }
    return true
  })
}

export function clearRules(): void {
  rules.length = 0
}
