import type { Candidate, ScoredCandidate } from '../types/verdict'
import type { CandidateScoringInput, EvaluatedRule, DirectionMapping } from '../types/scoring'
import { DEFAULT_DIRECTION_MAPPING } from '../types/scoring'
import type { RuleRuntimeConfig } from './config'

// ── MCDAScorer Interface ──

export interface MCDAScorer {
  score(input: CandidateScoringInput): ScoredCandidate[]
}

// ── Default MCDA Scorer ──

export class DefaultMCDAScorer implements MCDAScorer {
  constructor(
    private config: RuleRuntimeConfig,
    private directionMapping: DirectionMapping = DEFAULT_DIRECTION_MAPPING,
  ) {}

  score(input: CandidateScoringInput): ScoredCandidate[] {
    const { candidates, evaluatedRules, vetoedLabels, vetoedIds } = input
    const results: ScoredCandidate[] = []

    // Build rule lookup map
    const ruleById = new Map(evaluatedRules.map((er) => [er.rule.id, er.rule]))

    for (const candidate of candidates) {
      // ── Veto Check (candidatesByLabel + candidatesById) ──
      const isVetoedByLabel = vetoedLabels.has(candidate.label) ||
        vetoedLabels.has(candidate.label.toUpperCase())
      const isVetoedById = vetoedIds.has(candidate.candidateId)

      if (isVetoedByLabel || isVetoedById) {
        results.push({
          candidateId: candidate.candidateId,
          label: candidate.label,
          rawScore: -Infinity,
          normalizedScore: 0,
          confidence: 0,
          triggeredRuleIds: [],
          blockingRuleIds: isVetoedByLabel
            ? [...vetoedLabels]
            : [...vetoedIds],
          rationale: `候选 ${candidate.label} 被硬约束否决${isVetoedById ? ' (精准 ID)' : ' (标签)'}`,
        })
        continue
      }

      // ── Calculate Raw Score ──
      let rawScore = 0
      const triggeredRuleIds: string[] = []
      const missingFactCount = { missing: 0, total: 0 }

      const label = candidate.label.toUpperCase()
      const dirMapping = this.directionMapping[label] ?? this.directionMapping[candidate.label] ?? {}

      for (const evaluated of evaluatedRules) {
        const rule = ruleById.get(evaluated.rule.id)
        if (!rule) continue

        // Count missing facts for confidence
        missingFactCount.total++
        if (evaluated.result.missingFacts && evaluated.result.missingFacts.length > 0) {
          missingFactCount.missing++
        }

        // Only count triggered rules for scoring
        if (!evaluated.result.triggered) continue

        triggeredRuleIds.push(rule.id)

        // Only soft_criterion contributes to score
        if (rule.kind === 'soft_criterion') {
          const effectiveWeight = rule.weight ?? 0.5
          const dirContrib = dirMapping[rule.direction] ?? 0
          rawScore += effectiveWeight * dirContrib
        }
      }

      // ── Calculate Confidence ──
      const missingRatio = missingFactCount.total > 0
        ? missingFactCount.missing / missingFactCount.total
        : 0
      const confidence = Math.max(0, 1 - missingRatio * this.config.missingFactPenalty)

      results.push({
        candidateId: candidate.candidateId,
        label: candidate.label,
        rawScore,
        normalizedScore: 0, // filled in below
        confidence,
        triggeredRuleIds,
        blockingRuleIds: [],
        rationale: buildRationale(candidate.label, triggeredRuleIds, ruleById),
      })
    }

    // ── Normalize Scores ──
    const valid = results.filter((r) => r.rawScore > -Infinity)
    if (valid.length > 0) {
      const maxScore = Math.max(...valid.map((r) => r.rawScore))
      const minScore = Math.min(...valid.map((r) => r.rawScore))
      // Single candidate or all same score → normalizedScore = 1
      if (valid.length === 1 || maxScore === minScore) {
        for (const r of valid) {
          r.normalizedScore = 1
        }
      } else {
        const range = maxScore - minScore
        for (const r of valid) {
          r.normalizedScore = Math.round(((r.rawScore - minScore) / range) * 100) / 100
        }
      }
    }

    // ── Sort: higher normalizedScore first; vetoed at bottom ──
    return results.sort((a, b) => b.normalizedScore - a.normalizedScore)
  }
}

// ── Helper: Build Rationale ──

function buildRationale(
  label: string,
  triggeredRuleIds: string[],
  ruleById: Map<string, { id: string; description: string }>,
): string {
  if (triggeredRuleIds.length === 0) return `${label}: 无触发规则`
  const descriptions = triggeredRuleIds
    .map((id) => ruleById.get(id)?.description ?? id)
    .join('；')
  return `${label} 由以下规则支持：${descriptions}`
}