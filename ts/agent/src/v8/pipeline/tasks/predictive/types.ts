// ── Predictive Task Types (V8 Pipeline) ──
// 前向推断任务的类型定义
// 基于 v6/ontology/decision.ts 迁移，适配 TaskPlugin 接口

import type { FactBinding } from '../../engine/runtime/types'

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

// ── Uncertainty ──

export type Uncertainty = {
  id: string
  description: string
  impact: 'low' | 'medium' | 'high'
  missingFacts: string[]
  nextQuery?: string
}

// ── Candidates ──

export type CandidateAnswer = {
  id: string
  label: string // e.g. "HIGH" / "MEDIUM" / "LOW"
  description: string
  supportingEvidenceIds: string[]
}

// ── Scored Candidate (MCDA output) ──

export type ScoredCandidate = {
  candidateId: string
  label: string
  rawScore: number
  normalizedScore: number
  confidence: number
  triggeredRuleIds: string[]
  blockingRuleIds: string[] // veto-triggered
  rationale: string
}

// ── Model Verdict (Predictive) ──
// Agent 输出的判决结构

export type ModelVerdict_Predictive = {
  source: 'model'
  mode: 'predictive'
  recommendedCandidateId: string
  confidence: number
  rationale: string
  citedEvidenceIds: string[]
  citedRuleIds: string[]
}

// ── System Verdict (Predictive) ──
// Critic 评分后的系统判决

export type SystemVerdict_Predictive = {
  source: 'system'
  mode: 'predictive'
  ruleSetVersion: string
  ranking: ScoredCandidate[]
  recommendedCandidateId: string
  confidence: number
  vetoedLabels: string[]
  notes: string[]
}

// ── Prediction Config ──
// 任务特定配置

export type PredictionConfig = {
  maxCandidates?: number
  scoringProfile?: {
    aggregation: 'weighted_sum' | 'weighted_min' | 'leximin'
    veto: 'any_hard' | 'majority_hard'
  }
  directionMapping?: Record<string, Record<string, number>>
}

// ── Prediction Task Extension ──
// 扩展 PipelineTask 的 context 字段

export type PredictionTaskContext = {
  candidates?: CandidateAnswer[]
  config?: PredictionConfig
}

// ── Reconciliation ──

export type ReconciliationLikelyCause =
  | 'missing_facts'
  | 'rule_weight_misalignment'
  | 'model_overrides_system'
  | 'system_too_coarse'
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

// ── Counterfactual ──

export type CounterfactualMode = 'what_if' | 'but_for'

export type CounterfactualOffer = {
  id: string
  mode: CounterfactualMode
  description: string
  overrides?: Array<{ entityId: string; property: string; value: unknown }>
  eraseEventId?: string
  impactPreview?: {
    before: string
    estimatedAfter: string
    rerunCostHint: 'cheap' | 'moderate' | 'expensive'
  }
}

// ── Verdict Parser Helper ──

/**
 * 从 Markdown 文本中解析 ModelVerdict_Predictive
 * 支持 JSON 块格式: \`\`\`json\n{...}\n\`\`\`
 */
export function parsePredictiveVerdict(text: string): ModelVerdict_Predictive | null {
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[1])
    if (
      parsed.source === 'model' &&
      parsed.mode === 'predictive' &&
      typeof parsed.recommendedCandidateId === 'string'
    ) {
      return parsed as ModelVerdict_Predictive
    }
  } catch {
    return null
  }

  return null
}