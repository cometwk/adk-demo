// ── Reasoning TaskPlugin (V8 Pipeline) ──
// Composes reasoning task components into TaskPlugin interface

import type { TaskPlugin, PromptParams, ToolParams, ExecuteParams, CritiqueParams, CritiqueResult } from '../../core/types'
import { buildReasoningPrompt } from './prompt'
import { createReasoningTools } from './tools'
import { executeReasoning, executeReasoningWithWorkspace } from './executor'

// ── Reasoning Plugin ──

/**
 * Reasoning TaskPlugin implementation.
 * Provides general semantic reasoning capability.
 *
 * Composition:
 * - buildPrompt → calls prompt.ts
 * - buildTools → calls tools.ts factory
 * - execute → calls executor.ts
 * - critique → undefined (no deterministic critic for reasoning)
 */
export const reasoningPlugin: TaskPlugin = {
  type: 'reasoning',

  buildPrompt(params: PromptParams): string {
    return buildReasoningPrompt(params)
  },

  buildTools(params: ToolParams): Record<string, import('ai').Tool> {
    return createReasoningTools(params.runtime, params.workspace, params.policy)
  },

  async execute(params: ExecuteParams): Promise<import('../../core/types').TaskExecuteResult> {
    // Use executeReasoningWithWorkspace if workspace is available
    // Otherwise use standard executeReasoning
    // Note: workspace is passed via ToolParams during tool building,
    // but for execute we need to access it differently
    // The PipelineContext handles this by passing workspace through the flow
    return executeReasoning(params)
  },

  // No critique for reasoning task
  critique: undefined,
}

// ── Export ──

export { reasoningPlugin as default }

// Re-export components for customization
export { buildReasoningPrompt } from './prompt'
export { createReasoningTools } from './tools'
export { executeReasoning, executeReasoningWithWorkspace } from './executor'

// Re-export types
export {
  type ReasoningTask,
  type SemanticVerdict,
  parseVerdict,
} from './types'