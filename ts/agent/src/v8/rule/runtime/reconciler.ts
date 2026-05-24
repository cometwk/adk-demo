import type { SemanticVerdict } from '../../engine/agent/verdict'
import type { SystemVerdict, ScoredCandidate } from '../types/verdict'
import type { ReconcileInput, ReconcileResult } from '../types/reconcile'

// ── Reconciler Interface ──

export interface Reconciler {
  compare(input: ReconcileInput): ReconcileResult
}

// ── Default Reconciler ──

export class DefaultReconciler implements Reconciler {
  compare(input: ReconcileInput): ReconcileResult {
    const { modelVerdict, systemVerdict } = input

    // ── Extract model conclusion from SemanticVerdict.answer ──
    const modelAnswer = modelVerdict.answer?.trim().toUpperCase() ?? ''

    // ── Find system recommended candidate ──
    const systemRecommended = systemVerdict.candidates.find(
      (c) => c.candidateId === systemVerdict.recommendedCandidateId,
    )

    // ── Edge case: No system recommendation (all vetoed) ──
    if (!systemVerdict.recommendedCandidateId || !systemRecommended) {
      return {
        agreed: false,
        modelCandidateId: modelAnswer,
        reason: '系统无推荐候选（可能全部被否决）',
      }
    }

    const systemLabel = systemRecommended.label.toUpperCase()

    // ── Compare model answer with system label ──
    if (modelAnswer === systemLabel) {
      return {
        agreed: true,
        modelCandidateId: modelAnswer,
        systemCandidateId: systemRecommended.candidateId,
      }
    }

    // ── Edge case: Model answer does not match any candidate label ──
    const allLabels = systemVerdict.candidates.map((c) => c.label.toUpperCase())
    if (!allLabels.includes(modelAnswer)) {
      return {
        agreed: false,
        modelCandidateId: modelAnswer,
        systemCandidateId: systemRecommended.candidateId,
        reason: `模型结论 '${modelAnswer}' 不匹配任何候选标签（有效标签: ${allLabels.join(', ')})`,
      }
    }

    // ── Conflict: model and system disagree ──
    return {
      agreed: false,
      modelCandidateId: modelAnswer,
      systemCandidateId: systemRecommended.candidateId,
      reason: `模型选择 '${modelAnswer}'，系统推荐 '${systemLabel}'`,
    }
  }
}