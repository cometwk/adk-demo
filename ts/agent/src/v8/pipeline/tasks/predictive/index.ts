// ── Predictive TaskPlugin (V8 Pipeline) ──
// Composes predictive task components into TaskPlugin interface

import type { TaskPlugin, PromptParams, ToolParams, ExecuteParams, CritiqueParams, CritiqueResult } from '../../core/types'
import { buildPredictivePrompt } from './prompt'
import { createPredictiveTools } from './tools'
import { executePredictive } from './executor'
import { critiquePredictive } from './critic'

// ── Predictive Plugin ──

/**
 * Predictive TaskPlugin implementation.
 * Provides forward inference capability with MCDA scoring.
 *
 * Composition:
 * - buildPrompt → calls prompt.ts
 * - buildTools → calls tools.ts factory
 * - execute → calls executor.ts
 * - critique → calls critic.ts (MCDA + veto)
 */
export const predictivePlugin: TaskPlugin = {
  type: 'predictive',

  buildPrompt(params: PromptParams): string {
    return buildPredictivePrompt(params)
  },

  buildTools(params: ToolParams): Record<string, import('ai').Tool> {
    return createPredictiveTools(params.runtime, params.workspace, params.policy)
  },

  async execute(params: ExecuteParams): Promise<import('../../core/types').TaskExecuteResult> {
    return executePredictive(params)
  },

  async critique(params: CritiqueParams): Promise<CritiqueResult> {
    return critiquePredictive(params)
  },
}

// ── Export ──

export { predictivePlugin as default }

// Re-export components for customization
export { buildPredictivePrompt } from './prompt'
export { createPredictiveTools, getCounterfactualOffers, resetCounterfactuals } from './tools'
export { executePredictive, executePredictiveWithWorkspace } from './executor'
export { critiquePredictive } from './critic'

// Re-export types
export {
  type CandidateAnswer,
  type ScoredCandidate,
  type ModelVerdict_Predictive,
  type SystemVerdict_Predictive,
  type Evidence,
  type Uncertainty,
  type Reconciliation,
  type PredictionConfig,
  type CounterfactualOffer,
  parsePredictiveVerdict,
} from './types'