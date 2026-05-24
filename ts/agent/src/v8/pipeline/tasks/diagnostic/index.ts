// ── Diagnostic TaskPlugin (V8 Pipeline) ──
// Composes diagnostic task components into TaskPlugin interface

import type { TaskPlugin, PromptParams, ToolParams, ExecuteParams, CritiqueParams, CritiqueResult } from '../../core/types'
import { buildDiagnosticPrompt } from './prompt'
import { createDiagnosticTools } from './tools'
import { executeDiagnostic } from './executor'
import { critiqueDiagnostic } from './critic'

// ── Diagnostic Plugin ──

/**
 * Diagnostic TaskPlugin implementation.
 * Provides backward attribution capability with 4-dimension evaluation.
 *
 * Composition:
 * - buildPrompt → calls prompt.ts
 * - buildTools → calls tools.ts factory
 * - execute → calls executor.ts
 * - critique → calls critic.ts (necessity/sufficiency/path/temporal)
 */
export const diagnosticPlugin: TaskPlugin = {
  type: 'diagnostic',

  buildPrompt(params: PromptParams): string {
    return buildDiagnosticPrompt(params)
  },

  buildTools(params: ToolParams): Record<string, import('ai').Tool> {
    return createDiagnosticTools(params.runtime, params.workspace, params.policy)
  },

  async execute(params: ExecuteParams): Promise<import('../../core/types').TaskExecuteResult> {
    return executeDiagnostic(params)
  },

  async critique(params: CritiqueParams): Promise<CritiqueResult> {
    return critiqueDiagnostic(params)
  },
}

// ── Export ──

export { diagnosticPlugin as default }

// Re-export components for customization
export { buildDiagnosticPrompt } from './prompt'
export { createDiagnosticTools } from './tools'
export { executeDiagnostic, executeDiagnosticWithWorkspace } from './executor'
export { critiqueDiagnostic } from './critic'

// Re-export types
export {
  type DiagnosticVerdict,
  type CandidateCause,
  type AttributionResult,
  type OutcomeEvent,
  type Evidence,
  type CausalPathRef,
  type DiagnosticTaskContext,
  parseDiagnosticVerdict,
} from './types'