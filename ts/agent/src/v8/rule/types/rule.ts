import type { RuleContext, RuleResult } from './context'
import type { EvaluatedRule } from './scoring'
import type { Candidate } from './verdict'

// ── Rule Kind ──

export type RuleKind =
  | 'hard_constraint' // 触发即否决候选
  | 'soft_criterion' // 加权打分

// ── Rule Direction (for MCDA scoring) ──

export type RuleDirection =
  | 'risk_up' // 推高风险候选得分
  | 'risk_down' // 推低风险候选得分
  | 'neutral' // 无方向效应

// ── Required Fact Descriptor ──

export type RequiredFact = {
  property: string
  scope: 'entity' | 'type' | 'global'
}

// ── Veto Config (hard_constraint only) ──
// 支持 candidatesByLabel（按标签批量否决）和 candidatesById（按 ID 精准否决）

export type VetoConfig = {
  candidatesByLabel?: string[] // 如 ["LOW", "ALLOWED"] — 触发时否决具有该标签的所有候选
  candidatesById?: string[] // 如 ["candidate-001"] — 触发时精准否决特定候选，防范 collateral 误杀
}

// ── Rule ──

export type Rule = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[] // 实体类型名：在哪些类型上生效
  description: string
  requiredFacts?: RequiredFact[]
  direction: RuleDirection
  weight?: number // 0..1; soft_criterion 使用
  veto?: VetoConfig // hard_constraint 使用
  evaluator: (ctx: RuleContext) => Promise<RuleResult> | RuleResult
  explanation?: (result: RuleResult, ctx: RuleContext) => string
}

// ── Rule Filter ──

export type RuleFilter = {
  entityType?: string // 按实体类型过滤
  kind?: RuleKind // 按规则类型过滤
  intent?: string // 按意图关键词过滤
}

// ── Intent Keywords Mapping ──

export const INTENT_KEYWORDS: Record<string, string[]> = {
  risk_assessment: ['risk', 'overload', 'pressure', 'decline', 'chargeback'],
  prioritization: ['priority', 'pressure'],
  diagnosis: ['cause', 'blame', 'attribution'],
  compliance: ['blacklist', 'protect', 'limit', 'expired'],
}

// ── Rule Metadata (for inspect_rules output) ──

export type RuleMetadata = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[]
  description: string
  direction: RuleDirection
  weight?: number
  requiredFacts?: RequiredFact[]
}

// ── Rule Evaluation Input/Output ──

export type RuleEvaluationInput = {
  context: RuleContext
  entityIds: string[]
  ruleIds?: string[]
}

export type RuleEvaluationOutput = {
  evaluatedRules: EvaluatedRule[]
  vetoedLabels: Set<string>
  vetoedIds: Set<string>
}

// ── Verdict Input ──

export type VerdictInput = {
  context: RuleContext
  entityIds: string[]
  candidates: Candidate[]
  ruleIds?: string[]
}