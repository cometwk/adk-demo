import { tool } from 'ai'
import { z } from 'zod'
import type { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import type { ToolResult } from '../runtime/types'
import { PropertyFilterSchema } from '../query/graph-query'
import { GraphTraversalQuerySchema } from '../query/graph-query'

// ── Graph Tools (V8) ──
// All tools route through RuntimeOrchestrator
// Policy enforcement is handled by the orchestrator

export function createGraphTools(runtime: SemanticRuntimeOrchestrator) {
  // inspect_node - single node access
  const inspect_node = tool({
    description:
      '检查图节点。返回节点的 type 和 properties。' +
      '需要邻居信息请用 query_neighbors。',
    inputSchema: z.object({
      nodeId: z.string().describe('要检查的节点 ID（全局 ID 格式如 Merch:M001）'),
    }),
    execute: async ({ nodeId }): Promise<ToolResult> => {
      return runtime.inspectNode(nodeId)
    },
  })

  // search_nodes - type-based search
  const search_nodes = tool({
    description:
      '按类型搜索节点。type 必填。可用 where 过滤属性，fields 直接带回属性。' +
      '多跳复杂遍历请用 graph_query。',
    inputSchema: z.object({
      type: z.string().describe('节点类型（必填，如 Merch, Agent）'),
      where: z.array(PropertyFilterSchema).optional().describe('属性过滤条件（AND）'),
      fields: z.array(z.string()).optional().describe('要返回的属性'),
      limit: z.number().optional().describe('每页最大结果数，默认 20'),
      offset: z.number().optional().describe('分页偏移量'),
    }),
    execute: async ({ type, where, fields, limit, offset }): Promise<ToolResult> => {
      return runtime.searchNodes({ type, where, fields, limit, offset })
    },
  })

  // query_neighbors - neighbor access
  const query_neighbors = tool({
    description:
      '查询节点的邻居，可选按关系、方向、类型过滤。' +
      '返回邻居的 nodeId, type, relation, direction 和可选 properties。',
    inputSchema: z.object({
      nodeId: z.string().describe('起始节点 ID'),
      relation: z.string().optional().describe('边关系类型（如 for_agent, managed_by）'),
      direction: z.enum(['out', 'in', 'both']).optional().describe('边方向，默认 both'),
      targetType: z.string().optional().describe('按邻居节点类型过滤'),
      where: z.array(PropertyFilterSchema).optional().describe('邻居节点属性过滤'),
      fields: z.array(z.string()).optional().describe('要返回的邻居属性'),
      limit: z.number().optional().describe('每页最大结果数'),
      offset: z.number().optional().describe('分页偏移量'),
    }),
    execute: async ({
      nodeId,
      relation,
      direction,
      targetType,
      where,
      fields,
      limit,
      offset,
    }): Promise<ToolResult> => {
      return runtime.queryNeighbors(nodeId, {
        relation,
        direction,
        targetType,
        where,
        fields,
        limit,
        offset,
      })
    },
  })

  // graph_query - declarative traversal (V8: NO aggregate)
  const graph_query = tool({
    description:
      '声明式图遍历。用 JSON 表达多跳关系遍历 + 属性过滤。' +
      '适用场景：①需要 2+ 跳关系遍历；②批量属性过滤；③存在性断言。' +
      '聚合统计请使用 compute_query。' +
      '查询结构：match（起点选择）→ traverse[]（多步边遍历）→ return（输出控制）。',
    inputSchema: GraphTraversalQuerySchema,
    execute: async (query): Promise<ToolResult> => {
      return runtime.executeGraphQuery(query)
    },
  })

  return { inspect_node, search_nodes, query_neighbors, graph_query }
}