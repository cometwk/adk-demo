// ── Reasoning Tools (V8 Pipeline) ──
// Composes existing engine tools for reasoning task

import type { SemanticRuntimeOrchestrator } from '../../../engine/runtime/orchestrator'
import type { Workspace } from '../../../engine/runtime/workspace'
import type { PolicyContext } from '../../../policy/context'
import type { Tool } from 'ai'

import { createGraphTools } from '../../../engine/tools/graph-tools'
import { createComputeTools } from '../../../engine/tools/compute-tools'
import { createVectorTools } from '../../../engine/tools/vector-tools'
import { createFactTools } from '../../../engine/tools/fact-tools'
import { createCandidateTools } from '../../../engine/tools/candidate-tools'
import { createMethodTools } from '../../../engine/tools/method-tools'

// ── Reasoning Tools Factory ──

/**
 * Create tool set for Reasoning task.
 * Composes all engine tools for comprehensive graph/data analysis.
 */
export function createReasoningTools(
  runtime: SemanticRuntimeOrchestrator,
  workspace: Workspace,
  policy: PolicyContext,
): Record<string, Tool> {
  // Graph tools (traversal)
  const graphTools = createGraphTools(runtime)

  const methodTools = createMethodTools(runtime)

  // Compute tools (OLAP aggregation)
  const computeTools = createComputeTools(runtime)

  // Vector tools (semantic search)
  const vectorTools = createVectorTools(runtime)

  // Fact tools (bind/lookup)
  const factTools = createFactTools(workspace, policy)

  // Candidate tools (proposal/evidence)
  const candidateTools = createCandidateTools(workspace, policy)

  // Compose all tools
  return {
    ...graphTools,
    ...computeTools,
    ...vectorTools,
    ...factTools,
    ...candidateTools,
    ...methodTools,
  }
}

// ── Re-export individual tool factories for customization ──

export { createGraphTools } from '../../../engine/tools/graph-tools'
export { createComputeTools } from '../../../engine/tools/compute-tools'
export { createVectorTools } from '../../../engine/tools/vector-tools'
export { createFactTools } from '../../../engine/tools/fact-tools'
export { createCandidateTools } from '../../../engine/tools/candidate-tools'