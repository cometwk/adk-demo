// ── Diagnostic Tools (V8 Pipeline) ──
// Composes engine tools + causal tracing for diagnostic task

import type { RuntimeOrchestrator } from '../../../engine/runtime/orchestrator'
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

// ── Causal Tracing Tools ──

function createCausalTools(policy: PolicyContext): Record<string, Tool> {
  // trace_causal - trace causal path from cause to effect
  const trace_causal = tool({
    description:
      '追溯因果路径：从结果节点出发，沿因果关系回溯到根因。' +
      '返回因果链条上的节点和边。',
    inputSchema: z.object({
      effectId: z.string().describe('结果节点 ID'),
      maxDepth: z.number().optional().describe('最大追溯深度'),
      edgeType: z.string().optional().describe('因果边类型（如 causes/leads_to）'),
    }),
    execute: async ({ effectId, maxDepth, edgeType }): Promise<ReturnType<typeof toolOk>> => {
      maybeLogToolCall('trace_causal', { effectId, maxDepth }, policy)

      // Simplified: return placeholder path
      // Real implementation would traverse graph store
      return toolOk({
        effectId,
        causalPath: [
          { nodeId: effectId, role: 'effect', depth: 0 },
        ],
        maxDepth: maxDepth ?? 5,
        note: 'Causal path traced. Use graph_query for detailed traversal.',
      })
    },
  })

  // query_events - query events in time window
  const query_events = tool({
    description:
      '查询时间窗口内的事件：用于构建归因时间线。' +
      '返回事件列表及其时间戳。',
    inputSchema: z.object({
      entityId: z.string().optional().describe('实体 ID 过滤'),
      eventType: z.string().optional().describe('事件类型过滤'),
      from: z.string().describe('开始时间（ISO 8601）'),
      to: z.string().describe('结束时间（ISO 8601）'),
    }),
    execute: async ({ entityId, eventType, from, to }): Promise<ReturnType<typeof toolOk>> => {
      maybeLogToolCall('query_events', { entityId, eventType, from, to }, policy)

      // Simplified: return placeholder events
      return toolOk({
        events: [],
        timeWindow: { from, to },
        note: 'Time window specified. Use compute_query for aggregation.',
      })
    },
  })

  // record_cause - record candidate cause
  const record_cause = tool({
    description:
      '记录候选根因：关联证据和因果路径。' +
      '用于归因分析中的候选根因提案。',
    inputSchema: z.object({
      label: z.string().describe('根因标签'),
      description: z.string().describe('根因描述'),
      causalPathRef: z.object({
        edgeIds: z.array(z.string()),
        rootCauseMatcher: z.string(),
        finalEffectMatcher: z.string(),
      }).describe('因果路径引用'),
      evidenceIds: z.array(z.string()).optional().describe('支持证据 ID'),
    }),
    execute: async ({ label, description, causalPathRef, evidenceIds }): Promise<ReturnType<typeof toolOk>> => {
      maybeLogToolCall('record_cause', { label, description }, policy)

      const causeId = `cause_${Date.now()}`
      return toolOk({
        causeId,
        label,
        description,
        causalPathRef,
        evidenceIds: evidenceIds ?? [],
      })
    },
  })

  return {
    trace_causal,
    query_events,
    record_cause,
  }
}

// ── Diagnostic Tools Factory ──

/**
 * Create tool set for Diagnostic task.
 * Composition: engine tools + causal tracing
 */
export function createDiagnosticTools(
  runtime: RuntimeOrchestrator,
  workspace: Workspace,
  policy: PolicyContext,
): Record<string, Tool> {
  // Graph tools (traversal)
  const graphTools = createGraphTools(runtime)

  // Compute tools (OLAP aggregation)
  const computeTools = createComputeTools(runtime)

  // Vector tools (semantic search)
  const vectorTools = createVectorTools(runtime)

  // Fact tools (bind/lookup)
  const factTools = createFactTools(workspace, policy)

  // Candidate tools (evidence/uncertainty)
  const candidateTools = createCandidateTools(workspace, policy)

  // Causal tools (diagnostic specific)
  const causalTools = createCausalTools(policy)

  // Compose all tools
  return {
    ...graphTools,
    ...computeTools,
    ...vectorTools,
    ...factTools,
    ...candidateTools,
    ...causalTools,
  }
}

// ── Re-export individual tool factories for customization ──

export { createGraphTools } from '../../../engine/tools/graph-tools'
export { createComputeTools } from '../../../engine/tools/compute-tools'
export { createVectorTools } from '../../../engine/tools/vector-tools'
export { createFactTools } from '../../../engine/tools/fact-tools'
export { createCandidateTools } from '../../../engine/tools/candidate-tools'