// ── Predictive Tools (V8 Pipeline) ──
// Composes engine tools + counterfactual simulation for predictive task

import type { SemanticRuntimeOrchestrator } from '../../../engine/runtime/orchestrator'
import type { Workspace } from '../../../engine/runtime/workspace'
import type { PolicyContext } from '../../../policy/context'
import type { Tool } from 'ai'
import { z } from 'zod'
import { tool } from 'ai'

import { createGraphTools } from '../../../engine/tools/graph-tools'
import { createComputeTools } from '../../../engine/tools/compute-tools'
import { createVectorTools } from '../../../engine/tools/vector-tools'
import { createFactTools } from '../../../engine/tools/fact-tools'
import { createCandidateTools } from '../../../engine/tools/candidate-tools'
import { toolOk } from '../../../engine/runtime/types'
import { maybeLogToolCall } from '../../../policy/filters'
import type { CounterfactualOffer } from './types'

// ── Counterfactual Tools ──

let _offers: CounterfactualOffer[] = []
let _offerId = 0

export function getCounterfactualOffers(): CounterfactualOffer[] {
  return [..._offers]
}

export function resetCounterfactuals(): void {
  _offers = []
  _offerId = 0
}

function createCounterfactualTools(policy: PolicyContext): Record<string, Tool> {
  const simulate_counterfactual = tool({
    description:
      '生成反事实提议，探索在不同条件下结果如何变化。' +
      'what_if 模式：指定实体属性覆盖值进行模拟。' +
      '此调用生成一个 CounterfactualOffer，不执行实际重运行。',
    inputSchema: z.object({
      mode: z.enum(['what_if']).describe('what_if = 正向模拟，覆盖事实值'),
      description: z.string().describe('反事实场景的自然语言描述'),
      overrides: z
        .array(
          z.object({
            entityId: z.string().describe('实体 ID'),
            property: z.string().describe('属性名'),
            value: z.unknown().describe('覆盖值'),
          })
        )
        .optional()
        .describe('what_if 模式的事实覆盖值'),
      impactPreview: z
        .object({
          before: z.string().describe('当前状态描述'),
          estimatedAfter: z.string().describe('估计变化后的状态'),
          rerunCostHint: z.enum(['cheap', 'moderate', 'expensive']).describe('重运行成本提示'),
        })
        .optional()
        .describe('预期影响的预览'),
    }),
    execute: async ({ mode, description, overrides, impactPreview }): Promise<ReturnType<typeof toolOk>> => {
      maybeLogToolCall('simulate_counterfactual', { mode, description }, policy)

      const offer: CounterfactualOffer = {
        id: `cf_${++_offerId}`,
        mode,
        description,
        overrides,
        impactPreview,
      }

      _offers.push(offer)

      return toolOk({
        offerId: offer.id,
        mode,
        description,
        note: 'Counterfactual offer recorded. Will be included in final response.',
      })
    },
  })

  return { simulate_counterfactual }
}

// ── Predictive Tools Factory ──

/**
 * Create tool set for Predictive task.
 * Composition: engine tools + counterfactual simulation
 */
export function createPredictiveTools(
  runtime: SemanticRuntimeOrchestrator,
  workspace: Workspace,
  policy: PolicyContext,
): Record<string, Tool> {
  // Reset counterfactual offers for each task
  resetCounterfactuals()

  // Graph tools (traversal)
  const graphTools = createGraphTools(runtime)

  // Compute tools (OLAP aggregation)
  const computeTools = createComputeTools(runtime)

  // Vector tools (semantic search)
  const vectorTools = createVectorTools(runtime)

  // Fact tools (bind/lookup)
  const factTools = createFactTools(workspace, policy)

  // Candidate tools (proposal/evidence/uncertainty)
  const candidateTools = createCandidateTools(workspace, policy)

  // Counterfactual tools (what_if simulation)
  const counterfactualTools = createCounterfactualTools(policy)

  // Compose all tools
  return {
    ...graphTools,
    ...computeTools,
    ...vectorTools,
    ...factTools,
    ...candidateTools,
    ...counterfactualTools,
  }
}

// ── Re-export individual tool factories for customization ──

export { createGraphTools } from '../../../engine/tools/graph-tools'
export { createComputeTools } from '../../../engine/tools/compute-tools'
export { createVectorTools } from '../../../engine/tools/vector-tools'
export { createFactTools } from '../../../engine/tools/fact-tools'
export { createCandidateTools } from '../../../engine/tools/candidate-tools'