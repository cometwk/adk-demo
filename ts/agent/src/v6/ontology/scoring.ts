import type { CandidateAnswer, ScoredCandidate } from './decision'
import type { EvaluatedRule } from './ruleDag'
import type { Rule } from './rules'

// ── Scoring Profile ──
//
// directionMapping tells the scorer how each rule direction contributes
// to each candidate label.  A "risk_up" rule winning → HIGH candidate gets +score.
// This replaces V5's label-string hardcoding (the root cause of LOW=0.67 absurdity).

export type ScoringAggregation = 'weighted_sum' | 'weighted_min' | 'leximin'
export type VetoMode = 'any_hard' | 'majority_hard'

export type DirectionMapping = {
  // candidateLabel → ruleDirection → scoreContribution
  // Positive = favors this candidate, negative = hurts this candidate
  [candidateLabel: string]: {
    risk_up?: number
    risk_down?: number
    neutral?: number
  }
}

export type CalibrationConfig = {
  weightOverrides?: Record<string, number> // ruleId → override weight
  version: string
}

export type ScoringProfile = {
  aggregation: ScoringAggregation
  veto: VetoMode
  severityWeights: Record<'low' | 'medium' | 'high', number>
  directionMapping: DirectionMapping
  calibration?: CalibrationConfig
}

// ── Default profile for risk assessment ──

export const DEFAULT_RISK_SCORING_PROFILE: ScoringProfile = {
  aggregation: 'weighted_sum',
  veto: 'any_hard',
  severityWeights: { low: 0.5, medium: 1.0, high: 1.5 },
  directionMapping: {
    HIGH: { risk_up: +1, risk_down: -0.5, neutral: 0 },
    MEDIUM: { risk_up: +0.3, risk_down: +0.3, neutral: 0 },
    LOW: { risk_up: -0.5, risk_down: +1, neutral: 0 },
    'HIGH RISK': { risk_up: +1, risk_down: -0.5, neutral: 0 },
    'MEDIUM RISK': { risk_up: +0.3, risk_down: +0.3, neutral: 0 },
    'LOW RISK': { risk_up: -0.5, risk_down: +1, neutral: 0 },
  },
}

// ── Scoring input ──

export type ScoringInput = {
  candidates: CandidateAnswer[]
  evaluatedRules: EvaluatedRule[]
  allRules: Rule[]
  vetoedLabels: Set<string>
  profile?: ScoringProfile
}

// ── Score candidates ──
//
// Key improvements over V5:
//   1. Direction-aware: uses directionMapping, not label strings
//   2. Veto: hard_constraint candidates are eliminated before scoring
//   3. Subsumed rules don't contribute to score (but are reported for explanation)
//   4. confidence is derived from missing-fact impact, not LLM-supplied

export function scoreCandidates(input: ScoringInput): ScoredCandidate[] {
  const { candidates, evaluatedRules, allRules, vetoedLabels, profile = DEFAULT_RISK_SCORING_PROFILE } = input

  const ruleById = new Map(allRules.map((r) => [r.id, r]))

  // ── Compute raw scores per candidate ──
  const results: ScoredCandidate[] = []

  for (const candidate of candidates) {
    const label = candidate.label.toUpperCase()

    // Veto check
    if (vetoedLabels.has(label) || vetoedLabels.has(candidate.label)) {
      results.push({
        candidateId: candidate.id,
        label: candidate.label,
        rawScore: -Infinity,
        normalizedScore: 0,
        confidence: 0,
        triggeredRuleIds: [],
        blockingRuleIds: [...vetoedLabels],
        rationale: `候选 ${candidate.label} 被硬约束否决`,
      })
      continue
    }

    let rawScore = 0
    let totalWeight = 0
    const triggeredRuleIds: string[] = []
    const missingFactCount = { missing: 0, total: 0 }

    const dirMapping = profile.directionMapping[label] ?? profile.directionMapping[candidate.label] ?? {}

    for (const evaluated of evaluatedRules) {
      if (evaluated.isSubsumed) continue // don't double-count subsumed rules
      const rule = ruleById.get(evaluated.ruleId)
      if (!rule || rule.kind === 'explanation_policy' || rule.kind === 'conflict_policy') continue

      missingFactCount.total++
      if (evaluated.result.missingFacts && evaluated.result.missingFacts.length > 0) {
        missingFactCount.missing++
      }

      if (!evaluated.result.triggered) continue

      triggeredRuleIds.push(evaluated.ruleId)

      const effectiveWeight = getEffectiveWeight(rule, profile)
      const severity = evaluated.result.severity ?? 'low'
      const severityMult = profile.severityWeights[severity] ?? 1.0

      // Direction contribution
      const dirContrib = dirMapping[rule.direction] ?? 0
      rawScore += effectiveWeight * severityMult * dirContrib
      totalWeight += effectiveWeight * severityMult
    }

    // confidence decreases with missing fact ratio
    const missingRatio = missingFactCount.total > 0 ? missingFactCount.missing / missingFactCount.total : 0
    const confidence = Math.max(0, 1 - missingRatio * 0.8)

    results.push({
      candidateId: candidate.id,
      label: candidate.label,
      rawScore,
      normalizedScore: 0, // filled in below
      confidence,
      triggeredRuleIds,
      blockingRuleIds: [],
      rationale: buildRationale(candidate.label, triggeredRuleIds, ruleById),
    })
  }

  // Normalize scores among non-vetoed candidates
  const valid = results.filter((r) => r.rawScore > -Infinity)
  if (valid.length > 0) {
    const maxScore = Math.max(...valid.map((r) => r.rawScore))
    const minScore = Math.min(...valid.map((r) => r.rawScore))
    const range = maxScore - minScore || 1
    for (const r of valid) {
      r.normalizedScore = Math.round(((r.rawScore - minScore) / range) * 100) / 100
    }
  }

  // Sort: higher normalizedScore first; vetoed at bottom
  return results.sort((a, b) => b.normalizedScore - a.normalizedScore)
}

function getEffectiveWeight(rule: Rule, profile: ScoringProfile): number {
  const override = profile.calibration?.weightOverrides?.[rule.id]
  return override ?? rule.weight ?? 0.5
}

function buildRationale(label: string, triggeredRuleIds: string[], ruleById: Map<string, Rule>): string {
  if (triggeredRuleIds.length === 0) return `${label}: 无触发规则`
  const descriptions = triggeredRuleIds.map((id) => ruleById.get(id)?.description ?? id).join('；')
  return `${label} 由以下规则支持：${descriptions}`
}
