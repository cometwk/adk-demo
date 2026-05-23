import { tool } from 'ai'
import type { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import type { ToolResult } from '../runtime/types'
import { ComputeQuerySchema } from '../query/compute-query'

// ── Compute Tools (V8) ──
// OLAP aggregation tool - routes through RuntimeOrchestrator

export function createComputeTools(runtime: SemanticRuntimeOrchestrator) {
  // compute_query - OLAP aggregation
  const compute_query = tool({
    description:
      '列式聚合查询。用于大规模数据分析：sum/avg/count/min/max、groupBy、排序。' +
      '数据源如 OrderDaily、ProfitDaily。' +
      '不负责图遍历，请先用 graph_query 收缩候选集合。' +
      '支持动态引用：filters 中可使用 $workspace.candidates 引用已收集的候选 ID。',
    inputSchema: ComputeQuerySchema,
    execute: async (query): Promise<ToolResult> => {
      return runtime.executeComputeQuery(query)
    },
  })

  return { compute_query }
}