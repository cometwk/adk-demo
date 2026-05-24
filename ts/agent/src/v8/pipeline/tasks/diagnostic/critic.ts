// ── Diagnostic Critic (V8 Pipeline) ──
// Deterministic evaluation: attribution scoring (4 dimensions)

import type { CritiqueParams, CritiqueResult, FactBinding } from '../../core/types'
import type { DiagnosticVerdict, AttributionResult, CandidateCause } from './types'

// ── Run Diagnostic Critic ──

/**
 * Run deterministic critic for diagnostic task.
 *
 * Steps:
 * 1. Evaluate necessity (but-for test)
 * 2. Evaluate sufficiency
 * 3. Evaluate path completeness
 * 4. Evaluate temporal plausibility
 * 5. Compute attribution score
 * 6. Check for overdetermination
 * 7. Generate system verdict and reconciliation
 */
export async function critiqueDiagnostic(params: CritiqueParams): Promise<CritiqueResult> {
  const { task, facts, modelVerdict, ruleRegistry, ontology } = params

  // 1. Get candidate causes from facts
  const causes = extractCandidateCauses(facts)

  // 2. Evaluate each cause
  const rankedAttributions = causes.map((cause) => evaluateAttribution(cause, facts))

  // Sort by attributionScore descending
  rankedAttributions.sort((a, b) => b.attributionScore - a.attributionScore)

  // 3. Check overdetermination
  const overdetermined = checkOverdetermination(rankedAttributions)

  // 4. Build system verdict
  const systemVerdict: DiagnosticVerdict = {
    source: 'system',
    mode: 'diagnostic',
    rankedAttributions,
    overdetermined,
    notes: buildNotes(rankedAttributions, overdetermined),
  }

  // 5. Build reconciliation
  const modelRec = modelVerdict as any
  const modelTopCause = modelRec?.rankedAttributions?.[0]?.causeId ?? ''
  const systemTopCause = rankedAttributions[0]?.causeId ?? ''
  const agreed = modelTopCause === systemTopCause

  const reconciliation = {
    agreed,
    surfacedToUser: !agreed,
    modelRecommendation: modelTopCause,
    systemRecommendation: systemTopCause,
    discrepancies: agreed ? [] : [`模型推荐 ${modelTopCause}，系统推荐 ${systemTopCause}`],
    rationale: agreed
      ? '模型与系统归因一致'
      : '归因分歧，可能因时间线证据不完整',
  }

  return {
    systemVerdict,
    reconciliation,
  }
}

// ── Helper Functions ──

function extractCandidateCauses(facts: FactBinding[]): CandidateCause[] {
  // Simplified: extract causes from fact bindings
  // In real implementation, workspace would have specific cause records
  const causes: CandidateCause[] = []

  // Look for record_cause tool results
  // Simplified: return default causes
  if (causes.length === 0) {
    causes.push(
      {
        id: 'cause_1',
        label: '外部因素',
        description: '外部环境变化导致',
        causalPathRef: { edgeIds: [], rootCauseMatcher: '', finalEffectMatcher: '' },
        timelineEvidenceIds: [],
        canCoexistWith: [],
      },
    )
  }

  return causes
}

function evaluateAttribution(cause: CandidateCause, facts: FactBinding[]): AttributionResult {
  // Simplified 4-dimension evaluation
  // Real implementation would:
  // - necessity: check but-for test using counterfactual
  // - sufficiency: check if cause alone produces outcome
  // - pathCompleteness: evidence coverage along causal path
  // - temporalPlausibility: cause precedes outcome

  const evidenceCount = cause.timelineEvidenceIds.length

  // Base scores (simplified)
  const necessity = 0.7 // but-for test placeholder
  const sufficiency = 0.6 // cause alone placeholder
  const pathCompleteness = Math.min(1, evidenceCount * 0.2)
  const temporalPlausibility = 0.85 // time ordering placeholder

  // Composite score
  const attributionScore = (necessity * 0.3 + sufficiency * 0.2 + pathCompleteness * 0.25 + temporalPlausibility * 0.25)
  const confidence = Math.min(0.9, 0.5 + evidenceCount * 0.1)

  return {
    causeId: cause.id,
    label: cause.label,
    necessity,
    sufficiency,
    pathCompleteness,
    temporalPlausibility,
    attributionScore,
    confidence,
    rationale: `${cause.label} 归因评分`,
  }
}

function checkOverdetermination(attributions: AttributionResult[]): boolean {
  // Check if top-2 both have high attribution
  if (attributions.length < 2) return false
  const top1 = attributions[0].attributionScore
  const top2 = attributions[1].attributionScore
  return top1 > 0.4 && top2 > 0.4
}

function buildNotes(attributions: AttributionResult[], overdetermined: boolean): string[] {
  const notes: string[] = []

  if (attributions.length > 0) {
    notes.push(`归因候选数：${attributions.length}`)
    notes.push(`最高归因：${attributions[0].label} (${attributions[0].attributionScore.toFixed(2)})`)
  }

  if (overdetermined) {
    notes.push('存在多重归因（前两名归因分数均 > 0.4）')
  }

  return notes
}