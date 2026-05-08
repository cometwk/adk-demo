import { tool } from 'ai'
import { z } from 'zod'
import type { PolicyContext } from '../policy/context'
import { checkEntityAccess, checkTypeAccess, maybeLogToolCall, redactProperties } from '../policy/filters'
import type { FactStore } from '../runtime/factStore'
import type { Graph } from '../runtime/graph'
import { type ToolResult, toolErr, toolOk } from '../runtime/types'

type NodeField = 'type' | 'properties' | 'outEdges' | 'inEdges' | 'methods'
const VALID_FIELDS: NodeField[] = ['type', 'properties', 'outEdges', 'inEdges', 'methods']

export function createGraphTools(graph: Graph, policy: PolicyContext, facts?: FactStore) {
  const inspect_node = tool({
    description:
      '检查图节点。字段：type, properties, outEdges, inEdges, methods。' +
      '可选 `at` (ISO 8601) 用于时间旅行：如果提供且 FactStore 可用，绑定的事实将覆盖图属性。',
    inputSchema: z.object({
      nodeId: z.string().describe('要检查的节点 ID'),
      fields: z
        .array(z.enum(['type', 'properties', 'outEdges', 'inEdges', 'methods']))
        .optional()
        .describe('要返回的特定字段。省略则返回所有字段'),
      at: z.string().optional().describe('ISO 8601 时间戳用于时间旅行（诊断模式）'),
    }),
    execute: async ({ nodeId, fields, at }): Promise<ToolResult> => {
      maybeLogToolCall('inspect_node', { nodeId, fields, at }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied by policy`)
      }

      const node = graph.getNode(nodeId)
      if (!node) {
        return toolErr('NOT_FOUND', `Node '${nodeId}' not found`, {
          expected: { hint: 'Use search_nodes to find available nodes' },
        })
      }

      const typeName = node.constructor.name
      if (!checkTypeAccess(typeName, policy)) {
        return toolErr('POLICY_DENIED', `Access to type '${typeName}' is denied by policy`)
      }

      const requestedFields = fields ?? VALID_FIELDS
      const data: Record<string, unknown> = {}

      if (requestedFields.includes('type')) {
        data.type = typeName
      }
      if (requestedFields.includes('properties')) {
        let props = node.getProperties()
        // Time-travel: override with bound facts if `at` is provided and facts exist
        if (at && facts) {
          const boundFacts = facts.forEntity(nodeId)
          for (const bf of boundFacts) {
            props = { ...props, [bf.property]: bf.value }
          }
        } else if (facts) {
          // Always overlay FactStore bindings over graph properties
          const boundFacts = facts.forEntity(nodeId)
          for (const bf of boundFacts) {
            props = { ...props, [bf.property]: bf.value }
          }
        }
        data.properties = redactProperties(props, policy)
      }
      if (requestedFields.includes('outEdges')) {
        data.outEdges = graph.getOutEdges(nodeId)
      }
      if (requestedFields.includes('inEdges')) {
        data.inEdges = graph.getInEdges(nodeId)
      }
      if (requestedFields.includes('methods')) {
        data.methods = node.getCapabilities().map((m) => ({
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
    description: '查询节点的邻居，可选按关系、方向、类型过滤和分页。',
    inputSchema: z.object({
      nodeId: z.string().describe('起始节点 ID'),
      relation: z.string().optional().describe('按边关系类型过滤'),
      direction: z.enum(['out', 'in', 'both']).default('both').describe('边方向过滤'),
      typeFilter: z.string().optional().describe('按节点类型名称过滤邻居'),
      limit: z.number().optional().default(20).describe('每页最大结果数'),
      offset: z.number().optional().default(0).describe('分页偏移量'),
    }),
    execute: async ({ nodeId, relation, direction, typeFilter, limit, offset }): Promise<ToolResult> => {
      maybeLogToolCall('query_neighbors', { nodeId, relation, direction }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied by policy`)
      }
      if (!graph.getNode(nodeId)) {
        return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)
      }

      const result = graph.queryNeighbors(nodeId, {
        relation,
        direction,
        typeFilter,
        limit,
        offset,
      })
      const filteredItems = result.items.filter(
        (n) => checkEntityAccess(n.nodeId, policy) && checkTypeAccess(n.type, policy)
      )

      return toolOk({ neighbors: filteredItems, page: result.page })
    },
  })

  const search_nodes = tool({
    description:
      '搜索图节点。可选参数：query（ID 子字符串）、type（节点类型）、relatedTo（锚点节点 ID，返回其所有邻居）。' +
      '当提供 relatedTo 时，结果包含 relation 和 direction 字段。',
    inputSchema: z.object({
      query: z.string().optional().describe('匹配节点 ID 的子字符串'),
      type: z.string().optional().describe("按节点类型名称过滤（如 'Book', 'Reader'）"),
      relatedTo: z.string().optional().describe('锚点节点 ID：返回与此节点有边关系的所有邻居'),
      limit: z.number().optional().default(20).describe('每页最大结果数'),
      offset: z.number().optional().default(0).describe('分页偏移量'),
    }),
    execute: async ({ query, type, relatedTo, limit, offset }): Promise<ToolResult> => {
      maybeLogToolCall('search_nodes', { query, type, relatedTo }, policy)

      const result = graph.searchNodes({ query, type, relatedTo, limit, offset })
      const filteredItems = result.items.filter(
        (n) => checkEntityAccess(n.nodeId, policy) && checkTypeAccess(n.type, policy)
      )

      return toolOk({ nodes: filteredItems, page: result.page })
    },
  })

  return { inspect_node, query_neighbors, search_nodes }
}
