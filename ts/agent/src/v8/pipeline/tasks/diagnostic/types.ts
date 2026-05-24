// ── Diagnostic Task Types (V8 Pipeline) ──
// 后向归因任务的类型定义
// 基于 v6/ontology/decision.ts 迁移，适配 TaskPlugin 接口

import type { FactBinding } from '../../engine/runtime/types'

// ── Outcome Event ──

export type OutcomeEvent = {
  entityId: string
  eventType: string // e.g. "milestone_missed" / "incident_p1"
  occurredAt: string // ISO 8601
  details?: Record<string, unknown>
}

// ── Causal Path Reference ──

export type CausalPathRef = {
  edgeIds: string[]
  rootCauseMatcher: string
  finalEffectMatcher: string
}

// ── Candidate Cause ──

export type CandidateCause = {
  id: string
  label: string
  description: string
  causalPathRef: CausalPathRef
  timelineEvidenceIds: string[]
  canCoexistWith: string[] // other cause IDs that can co-occur
}

// ── Attribution Result ──

export type AttributionResult = {
  causeId: string
  label: string
  necessity: number // 0..1 — but-for test: P(¬outcome | ¬cause)
  sufficiency: number // 0..1 — P(outcome | cause alone)
  pathCompleteness: number // 0..1 — evidence completeness along causal path
  temporalPlausibility: number // 0..1 — cause precedes outcome within typicalLag
  attributionScore: number // 0..1 composite (not forced to sum=1)
  confidence: number
  rationale: string
}

// ── Diagnostic Verdict ──

export type DiagnosticVerdict = {
  source: 'system' | 'model'
  mode: 'diagnostic'
  rankedAttributions: AttributionResult[]
  overdetermined: boolean // true if top-2 attributionScores both > 0.4
  notes: string[]
  rationale?: string // model only
  citedEvidenceIds?: string[] // model only
}

// ── Diagnostic Task Context ──

export type DiagnosticTaskContext = {
  outcome?: OutcomeEvent
  timeWindow?: { from: string; to: string }
  candidateCauses?: CandidateCause[]
}

// ── Reconciliation ──

export type ReconciliationLikelyCause =
  | 'missing_facts'
  | 'rule_weight_misalignment'
  | 'model_overrides_system'
  | 'system_too_coarse'
  | 'attribution_rank_mismatch'
  | 'unknown'

export type Reconciliation = {
  agreed: boolean
  surfacedToUser: boolean
  modelRecommendation: string
  systemRecommendation: string
  discrepancies: string[]
  likelyCause?: ReconciliationLikelyCause
  rationale: string
}

// ── Evidence ──

export type EvidenceSourceKind =
  | 'property'
  | 'method_result'
  | 'rule_evaluation'
  | 'aggregation'
  | 'event'
  | 'causal_path'

export type Evidence = {
  id: string
  sourceKind: EvidenceSourceKind
  entityIds: string[]
  relatedRuleIds: string[]
  content: string
  confidence: number // 0..1
  observedAt?: string
}

// ── Verdict Parser Helper ──

/**
 * 从 Markdown 文本中解析 DiagnosticVerdict
 * 支持 JSON 块格式: \`\`\`json\n{...}\n\`\`\`
 */
export function parseDiagnosticVerdict(text: string): DiagnosticVerdict | null {
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (
      parsed.mode === 'diagnostic' &&
      Array.isArray(parsed.rankedAttributions)
    ) {
      return parsed as DiagnosticVerdict
    }
  } catch {
    return null
  }

  return null
}