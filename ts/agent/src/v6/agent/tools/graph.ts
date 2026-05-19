import { tool } from 'ai'
import { z } from 'zod'
import type { PolicyContext } from '../../policy/context'
import { checkEntityAccess, checkTypeAccess, maybeLogToolCall, redactProperties } from '../../policy/filters'
import type { FactStore } from '../../runtime/eventStore'
import type { GraphStore } from '../../runtime/graph-store'
import { GraphQueryEngine } from '../../runtime/query-engine'
import { GraphQuerySchema, PropertyFilterSchema } from '../../runtime/query-types'
import { AgentMethodRegistry } from '../../runtime/registry'
import { type ToolResult, toolErr, toolOk } from '../../runtime/types'

type NodeField = 'type' | 'properties' | 'edgeSummary' | 'methods'
const VALID_FIELDS: NodeField[] = ['type', 'properties', 'edgeSummary', 'methods']

function overlayFacts(
  nodeId: string,
  props: Record<string, unknown>,
  facts: FactStore | undefined,
  at?: string,
): Record<string, unknown> {
  if (!facts) return props
  let result = { ...props }
  const boundFacts = facts.forEntity(nodeId)
  for (const bf of boundFacts) {
    result = { ...result, [bf.property]: bf.value }
  }
  void at // time-travel reserved for diagnostic mode
  return result
}

export function createGraphTools(store: GraphStore, policy: PolicyContext, facts?: FactStore) {
  const inspect_node = tool({
    description:
      '检查图节点。字段：type, properties, edgeSummary（边数量摘要）, methods。' +
      'edgeSummary 只返回各关系类型的 count，不返回全部邻居 ID；需要邻居详情请用 query_neighbors。' +
      '可选 `at` (ISO 8601) 用于时间旅行：如果提供且 FactStore 可用，绑定的事实将覆盖图属性。',
    inputSchema: z.object({
      nodeId: z.string().describe('要检查的节点 ID'),
      fields: z
        .array(z.enum(['type', 'properties', 'edgeSummary', 'methods']))
        .optional()
        .describe('要返回的特定字段。省略则返回所有字段'),
      at: z.string().optional().describe('ISO 8601 时间戳用于时间旅行（诊断模式）'),
    }),
    execute: async ({ nodeId, fields, at }): Promise<ToolResult> => {
      maybeLogToolCall('inspect_node', { nodeId, fields, at }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied by policy`)
      }

      const node = await store.getNode(nodeId)
      if (!node) {
        return toolErr('NOT_FOUND', `Node '${nodeId}' not found`, {
          expected: { hint: 'Use search_nodes to find available nodes' },
        })
      }

      if (!checkTypeAccess(node.type, policy)) {
        return toolErr('POLICY_DENIED', `Access to type '${node.type}' is denied by policy`)
      }

      const requestedFields = fields ?? VALID_FIELDS
      const data: Record<string, unknown> = {}

      if (requestedFields.includes('type')) {
        data.type = node.type
      }
      if (requestedFields.includes('properties')) {
        const props = overlayFacts(nodeId, node.properties, facts, at)
        data.properties = redactProperties(props, policy)
      }
      if (requestedFields.includes('edgeSummary')) {
        data.edgeSummary = await store.getEdgeSummary(nodeId)
      }
      if (requestedFields.includes('methods')) {
        const schemas = AgentMethodRegistry.getMethodsForClass(node.type)
        data.methods = schemas.map((m) => ({
          name: m.methodName,
          description: m.description,
          returns: m.returns,
          requiredFacts: m.requiredFacts ?? [],
          preconditions: m.preconditions ?? [],
        }))
      }

      return toolOk(data)
    },
  })

  const query_neighbors = tool({
    description:
      '查询节点的邻居，可选按关系、方向、类型、属性条件过滤；可用 fields 直接带回邻居属性，避免多次 inspect_node。',
    inputSchema: z.object({
      nodeId: z.string().describe('起始节点 ID'),
      relation: z.string().optional().describe('按边关系类型过滤'),
      direction: z.enum(['out', 'in', 'both']).optional().describe('边方向过滤，默认 both'),
      targetType: z.string().optional().describe('按邻居节点类型名称过滤'),
      where: z.array(PropertyFilterSchema).optional().describe('邻居节点属性过滤（AND）'),
      fields: z.array(z.string()).optional().describe('要返回的邻居属性；提供时结果含 properties'),
      limit: z.number().optional().describe('每页最大结果数，默认 20'),
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
      maybeLogToolCall('query_neighbors', { nodeId, relation, direction }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied by policy`)
      }

      const source = await store.getNode(nodeId)
      if (!source) {
        return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)
      }

      const result = await store.getNeighbors(nodeId, {
        relation,
        direction,
        targetType,
        where,
        fields,
        limit,
        offset,
      })

      const neighbors = []
      for (const n of result.items) {
        if (!checkEntityAccess(n.nodeId, policy)) continue
        if (!checkTypeAccess(n.type, policy)) continue

        let entry: Record<string, unknown> = {
          nodeId: n.nodeId,
          type: n.type,
          relation: n.relation,
          direction: n.direction,
        }
        if (n.properties) {
          const props = overlayFacts(n.nodeId, n.properties, facts)
          entry = { ...entry, properties: redactProperties(props, policy) }
        }
        neighbors.push(entry)
      }

      return toolOk({ neighbors, page: result.page })
    },
  })

  const search_nodes = tool({
    description:
      '按类型 + 属性条件搜索节点。type 必填。可用 fields 直接带回属性，避免多次 inspect_node。' +
      '多跳复杂查询请用 graph_query。',
    inputSchema: z.object({
      type: z.string().describe('节点类型（必填，如 Reader、Book）'),
      where: z.array(PropertyFilterSchema).optional().describe('属性过滤条件（AND）'),
      fields: z.array(z.string()).optional().describe('要返回的属性；提供时结果含 properties'),
      limit: z.number().optional().describe('每页最大结果数，默认 20'),
      offset: z.number().optional().describe('分页偏移量'),
    }),
    execute: async ({ type, where, fields, limit, offset }): Promise<ToolResult> => {
      maybeLogToolCall('search_nodes', { type, where }, policy)

      if (!checkTypeAccess(type, policy)) {
        return toolErr('POLICY_DENIED', `Access to type '${type}' is denied by policy`)
      }

      const result = await store.findNodes({ type, where, fields, limit, offset })

      const nodes = []
      for (const n of result.items) {
        if (!checkEntityAccess(n.id, policy)) continue
        if (!checkTypeAccess(n.type, policy)) continue

        let entry: Record<string, unknown> = { nodeId: n.id, type: n.type }
        if (fields && fields.length > 0) {
          const props = overlayFacts(n.id, n.properties, facts)
          entry = { ...entry, properties: redactProperties(props, policy) }
        }
        nodes.push(entry)
      }

      return toolOk({ nodes, page: result.page })
    },
  })

  const graph_query = tool({
    description:
      '声明式图查询。用 JSON 表达多跳遍历 + 属性过滤 + 聚合，一次 tool call 完成复杂查询。' +
      '适用场景：①需要 2+ 跳关系遍历；②批量属性过滤；③聚合统计。' +
      '简单的单节点/邻居探索仍建议用 inspect_node / query_neighbors / search_nodes（开销更低）。' +
      '查询结构：match（起点选择）→ traverse[]（多步边遍历）→ return（输出控制）。',
    inputSchema: GraphQuerySchema,
    execute: async (query): Promise<ToolResult> => {
      maybeLogToolCall('graph_query', { match: query.match }, policy)
      const engine = new GraphQueryEngine(store, policy, facts)
      return engine.execute(query)
    },
  })

  return { inspect_node, query_neighbors, search_nodes, graph_query }
}
