// ── Predictive Critic (V8 Pipeline) ──
// Deterministic evaluation: MCDA scoring + veto check

import type { CritiqueParams, CritiqueResult, FactBinding } from '../../core/types'
import type { SystemVerdict_Predictive, ScoredCandidate, CandidateAnswer } from './types'

// ── Run Predictive Critic ──

/**
 * Run deterministic critic for predictive task.
 *
 * Steps:
 * 1. Evaluate rules against facts (deterministic)
 * 2. Score candidates using MCDA
 * 3. Apply veto constraints
 * 4. Generate system verdict and reconciliation
 *
 * Note: This is a simplified version. Full implementation would:
 * - Call RuleRegistry.evaluate() for rule evaluation
 * - Use scoringProfile for MCDA aggregation
 * - Handle direction mapping for score contributions
 */
export async function critiquePredictive(params: CritiqueParams): Promise<CritiqueResult> {
  const { task, facts, modelVerdict, ruleRegistry, ontology } = params

  // 1. Get candidates from facts (recorded via propose_candidates tool)
  // In full implementation, candidates would be extracted from workspace
  const candidates = extractCandidates(facts)

  // 2. Evaluate rules (simplified - would call ruleRegistry in full impl)
  const evaluatedRules = ruleRegistry.list()
  const triggeredRuleIds: string[] = []
  const vetoedLabels: string[] = []

  for (const rule of evaluatedRules) {
    // Simplified trigger check - real implementation would evaluate against facts
    if (rule.kind === 'hard_constraint') {
      // Check if facts violate the constraint
      // Simplified: just note the rule exists
    } else if (rule.kind === 'soft_criterion') {
      // Would check if rule is triggered by facts
      triggeredRuleIds.push(rule.id)
    }
  }

  // 3. Score candidates (simplified MCDA)
  const ranking = scoreCandidatesSimple(candidates, triggeredRuleIds, facts)

  // 4. Pick top candidate
  const topCandidate = ranking[0]

  // 5. Build system verdict
  const systemVerdict: SystemVerdict_Predictive = {
    source: 'system',
    mode: 'predictive',
    ruleSetVersion: ontology.version,
    ranking,
    recommendedCandidateId: topCandidate?.candidateId ?? '',
    confidence: topCandidate?.confidence ?? 0,
    vetoedLabels,
    notes: buildNotes(triggeredRuleIds, vetoedLabels),
  }

  // 6. Build reconciliation
  const modelRec = modelVerdict as any
  const modelPick = modelRec?.recommendedCandidateId ?? ''
  const systemPick = systemVerdict.recommendedCandidateId
  const agreed = modelPick === systemPick

  const reconciliation = {
    agreed,
    surfacedToUser: !agreed,
    modelRecommendation: modelPick,
    systemRecommendation: systemPick,
    discrepancies: agreed ? [] : [`模型推荐 ${modelPick}，系统推荐 ${systemPick}`],
    rationale: agreed
      ? '模型与系统判断一致'
      : '模型与系统判断不一致，可能因缺失事实或权重配置',
  }

  return {
    systemVerdict,
    reconciliation,
  }
}

// ── Helper Functions ──

function extractCandidates(facts: FactBinding[]): CandidateAnswer[] {
  // Simplified: extract candidates from fact bindings
  // In real implementation, workspace.candidates would be used
  const candidates: CandidateAnswer[] = []

  // Look for propose_candidates tool results
  // Simplified: just return default candidates
  if (candidates.length === 0) {
    candidates.push(
      { id: 'cand_high', label: 'HIGH', description: '高风险', supportingEvidenceIds: [] },
      { id: 'cand_medium', label: 'MEDIUM', description: '中等风险', supportingEvidenceIds: [] },
      { id: 'cand_low', label: 'LOW', description: '低风险', supportingEvidenceIds: [] },
    )
  }

  return candidates
}

function scoreCandidatesSimple(
  candidates: CandidateAnswer[],
  triggeredRuleIds: string[],
  facts: FactBinding[],
): ScoredCandidate[] {
  // Simplified MCDA scoring
  // Real implementation would use scoring profile and direction mapping

  const results: ScoredCandidate[] = []

  for (const candidate of candidates) {
    // Simplified scoring based on evidence count
    const evidenceCount = candidate.supportingEvidenceIds.length
    const triggeredCount = triggeredRuleIds.length

    // Base score - simplified
    let rawScore = 0
    if (candidate.label === 'HIGH') {
      rawScore = triggeredCount * 0.5
    } else if (candidate.label === 'LOW') {
      rawScore = -triggeredCount * 0.3
    }

    // Confidence based on evidence
    const confidence = Math.min(0.9, 0.5 + evidenceCount * 0.1)

    results.push({
      candidateId: candidate.id,
      label: candidate.label,
      rawScore,
      normalizedScore: 0, // will be normalized below
      confidence,
      triggeredRuleIds,
      blockingRuleIds: [],
      rationale: `${candidate.label} 基于规则评分`,
    })
  }

  // Normalize scores
  const valid = results.filter((r) => r.rawScore > -Infinity)
  if (valid.length > 0) {
    const maxScore = Math.max(...valid.map((r) => r.rawScore))
    const minScore = Math.min(...valid.map((r) => r.rawScore))
    const range = maxScore - minScore || 1
    for (const r of valid) {
      r.normalizedScore = Math.round(((r.rawScore - minScore) / range) * 100) / 100
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.normalizedScore - a.normalizedScore)
}

function buildNotes(triggeredRuleIds: string[], vetoedLabels: string[]): string[] {
  const notes: string[] = []

  if (triggeredRuleIds.length > 0) {
    notes.push(`触发规则：${triggeredRuleIds.join(', ')}`)
  }

  if (vetoedLabels.length > 0) {
    notes.push(`被否决的候选：${vetoedLabels.join(', ')}`)
  }

  if (notes.length === 0) {
    notes.push('无触发规则，评分基于默认权重')
  }

  return notes
}