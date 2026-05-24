import type { SemanticVerdict } from '../../engine/agent/verdict'
import type { SystemVerdict } from './verdict'

// ── Reconcile Input ──

export type ReconcileInput = {
  modelVerdict: SemanticVerdict // 来自 engine/agent/verdict.ts
  systemVerdict: SystemVerdict
}

// ── Reconcile Result ──

export type ReconcileResult = {
  agreed: boolean
  modelCandidateId?: string
  systemCandidateId?: string
  reason?: string
}