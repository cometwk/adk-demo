import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, type MethodSchema, type RelationRegistryEntry } from './registry'
import type { Edge, NodeId, PageInfo, Paginated } from './types'
import type { RelationSchema } from '../ontology/schema'

// Helper: 检查节点的 agentVisible 属性是否匹配 query
function matchesAgentVisibleProperties(node: BaseNode, query: string): boolean {
  const className = node.constructor.name
  const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className)

  for (const schema of propSchemas) {
    if (!schema.agentVisible) continue
    const value = (node as unknown as Record<string, unknown>)[schema.propertyName]
    if (typeof value === 'string' && value.includes(query)) return true
  }
  return false
}

export abstract class BaseNode {
  private _id: NodeId

  constructor(id: NodeId) {
    this._id = id
  }

  get id(): NodeId {
    return this._id
  }

  getCapabilities(): MethodSchema[] {
    const className = this.constructor.name
    return AgentMethodRegistry.getMethodsForClass(className)
  }

  getProperties(): Record<string, unknown> {
    const className = this.constructor.name
    const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className)
    const result: Record<string, unknown> = {}
    for (const schema of propSchemas) {
      result[schema.propertyName] = (this as Record<string, unknown>)[schema.propertyName]
    }
    return result
  }

  getRelationSchemas(): RelationRegistryEntry[] {
    return AgentRelationRegistry.getRelationsForClass(this.constructor.name)
  }

  resolveRelation(relationType: string): NodeId[] {
    const entries = AgentRelationRegistry.getRelationsForClass(this.constructor.name)
    const entry = entries.find((e) => e.type === relationType)
    if (!entry) return []
    const method = (this as unknown as Record<string, () => NodeId[]>)[entry.methodName]
    if (typeof method !== 'function') return []
    return method.call(this) ?? []
  }

  resolveAllRelations(): Record<string, NodeId[]> {
    const entries = AgentRelationRegistry.getRelationsForClass(this.constructor.name)
    const result: Record<string, NodeId[]> = {}
    for (const entry of entries) {
      const method = (this as unknown as Record<string, () => NodeId[]>)[entry.methodName]
      if (typeof method === 'function') {
        result[entry.type] = method.call(this) ?? []
      }
    }
    return result
  }
}

export type NeighborEntry = {
  nodeId: string
  type: string
  relation: string
  direction: 'out' | 'in'
}

export type QueryNeighborsOpts = {
  relation?: string
  direction?: 'out' | 'in' | 'both'
  typeFilter?: string
  limit?: number
  offset?: number
}

export type SearchNodeResult = {
  nodeId: string
  type: string
  relation?: string
  direction?: 'out' | 'in'
}

export type SearchNodesOpts = {
  query?: string
  type?: string
  relatedTo?: string
  limit?: number
  offset?: number
}

const DEFAULT_PAGE_LIMIT = 20

export class Graph {
  nodes = new Map<string, BaseNode>()
  edges: Edge[] = []

  // RelationSchema index: edge type → schema (optional; when present, addEdge validates against it)
  private readonly relationIndex: Map<string, RelationSchema>

  constructor(opts: { relations?: RelationSchema[] } = {}) {
    this.relationIndex = new Map((opts.relations ?? []).map((r) => [r.type, r]))
  }

  addNode(node: BaseNode) {
    this.nodes.set(node.id, node)
  }

  addEdge(edge: Edge): void {
    if (this.relationIndex.size > 0) {
      const schema = this.relationIndex.get(edge.type)
      if (!schema) {
        throw new Error(
          `addEdge: unknown edge type "${edge.type}". ` +
            `Declared types: [${[...this.relationIndex.keys()].join(', ')}]`,
        )
      }
      const fromNode = this.nodes.get(edge.from)
      const toNode = this.nodes.get(edge.to)
      if (fromNode) {
        const actual = fromNode.constructor.name
        if (actual !== schema.fromType) {
          throw new Error(
            `addEdge "${edge.type}": node "${edge.from}" has type "${actual}", schema expects fromType "${schema.fromType}"`,
          )
        }
      }
      if (toNode) {
        const actual = toNode.constructor.name
        if (actual !== schema.toType) {
          throw new Error(
            `addEdge "${edge.type}": node "${edge.to}" has type "${actual}", schema expects toType "${schema.toType}"`,
          )
        }
      }
    }
    this.edges.push(edge)
  }

  /** 当图中已有边时，从实际边派生 RelationSchema（fromType/toType 由节点类型推断） */
  deriveRelationSchemas(): RelationSchema[] {
    const seen = new Map<string, RelationSchema>()
    for (const edge of this.edges) {
      const fromType = this.nodes.get(edge.from)?.constructor.name ?? 'Unknown'
      const toType = this.nodes.get(edge.to)?.constructor.name ?? 'Unknown'
      const key = `${fromType}:${edge.type}:${toType}`
      if (!seen.has(key)) {
        seen.set(key, { type: edge.type, fromType, toType, description: '' })
      }
    }
    return Array.from(seen.values())
  }

  getNode(id: string): BaseNode | undefined {
    return this.nodes.get(id)
  }

  getOutEdges(nodeId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const e of this.edges) {
      if (e.from === nodeId) {
        ;(result[e.type] ??= []).push(e.to)
      }
    }

    // Lazy resolution: fall back to @agentRelation resolvers for relation types
    // that have no static edges for this node
    const node = this.nodes.get(nodeId)
    if (node) {
      const resolved = node.resolveAllRelations()
      for (const [type, ids] of Object.entries(resolved)) {
        if (!result[type] && ids.length > 0) {
          result[type] = ids
        }
      }
    }

    return result
  }

  getInEdges(nodeId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const e of this.edges) {
      if (e.to === nodeId) {
        ;(result[e.type] ??= []).push(e.from)
      }
    }
    return result
  }

  queryNeighbors(nodeId: string, opts: QueryNeighborsOpts = {}): Paginated<NeighborEntry> {
    const { relation, direction = 'both', typeFilter, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts
    const all: NeighborEntry[] = []
    const seen = new Set<string>()

    if (direction === 'out' || direction === 'both') {
      // Static edges
      const staticRelTypes = new Set<string>()
      for (const e of this.edges) {
        if (e.from === nodeId && (!relation || e.type === relation)) {
          staticRelTypes.add(e.type)
          const target = this.nodes.get(e.to)
          const typeName = target?.constructor.name ?? 'Unknown'
          if (!typeFilter || typeName === typeFilter) {
            const key = `out:${e.type}:${e.to}`
            if (!seen.has(key)) {
              seen.add(key)
              all.push({ nodeId: e.to, type: typeName, relation: e.type, direction: 'out' })
            }
          }
        }
      }

      // Lazy resolution for relation types with no static edges on this node
      const node = this.nodes.get(nodeId)
      if (node) {
        const entries = node.getRelationSchemas()
        for (const entry of entries) {
          if (relation && entry.type !== relation) continue
          if (staticRelTypes.has(entry.type)) continue
          const ids = node.resolveRelation(entry.type)
          for (const targetId of ids) {
            const target = this.nodes.get(targetId)
            const typeName = target?.constructor.name ?? entry.toType
            if (!typeFilter || typeName === typeFilter) {
              const key = `out:${entry.type}:${targetId}`
              if (!seen.has(key)) {
                seen.add(key)
                all.push({ nodeId: targetId, type: typeName, relation: entry.type, direction: 'out' })
              }
            }
          }
        }
      }
    }

    if (direction === 'in' || direction === 'both') {
      // Static edges
      for (const e of this.edges) {
        if (e.to === nodeId && (!relation || e.type === relation)) {
          const source = this.nodes.get(e.from)
          const typeName = source?.constructor.name ?? 'Unknown'
          if (!typeFilter || typeName === typeFilter) {
            const key = `in:${e.type}:${e.from}`
            if (!seen.has(key)) {
              seen.add(key)
              all.push({ nodeId: e.from, type: typeName, relation: e.type, direction: 'in' })
            }
          }
        }
      }

      // Lazy resolution for incoming edges: scan source nodes whose
      // @agentRelation toType matches this node's type
      const targetNode = this.nodes.get(nodeId)
      if (targetNode) {
        const targetType = targetNode.constructor.name
        const incomingEntries = AgentRelationRegistry.getRelationsForToType(targetType)
        for (const entry of incomingEntries) {
          if (relation && entry.type !== relation) continue
          for (const [otherId, otherNode] of this.nodes) {
            if (otherNode.constructor.name !== entry.fromType) continue
            const ids = otherNode.resolveRelation(entry.type)
            if (ids.includes(nodeId)) {
              const typeName = otherNode.constructor.name
              if (!typeFilter || typeName === typeFilter) {
                const key = `in:${entry.type}:${otherId}`
                if (!seen.has(key)) {
                  seen.add(key)
                  all.push({ nodeId: otherId, type: typeName, relation: entry.type, direction: 'in' })
                }
              }
            }
          }
        }
      }
    }

    const page = all.slice(offset, offset + limit)
    const pageInfo: PageInfo = {
      offset,
      limit,
      hasMore: offset + limit < all.length,
      ...(all.length <= 1000 ? { total: all.length } : {}),
    }

    return { items: page, page: pageInfo }
  }

  searchNodes(opts: SearchNodesOpts): Paginated<SearchNodeResult> {
    const { query, type, relatedTo, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts

    // 如果提供 relatedTo，搜索其邻居节点
    if (relatedTo) {
      const all: SearchNodeResult[] = []

      // out 方向的邻居
      for (const e of this.edges) {
        if (e.from === relatedTo) {
          const target = this.nodes.get(e.to)
          if (!target) continue
          const typeName = target.constructor.name
          if (type && typeName !== type) continue
          if (query && !e.to.includes(query) && !matchesAgentVisibleProperties(target, query)) continue
          all.push({
            nodeId: e.to,
            type: typeName,
            relation: e.type,
            direction: 'out',
          })
        }
      }

      // in 方向的邻居
      for (const e of this.edges) {
        if (e.to === relatedTo) {
          const source = this.nodes.get(e.from)
          if (!source) continue
          const typeName = source.constructor.name
          if (type && typeName !== type) continue
          if (query && !e.from.includes(query) && !matchesAgentVisibleProperties(source, query)) continue
          all.push({
            nodeId: e.from,
            type: typeName,
            relation: e.type,
            direction: 'in',
          })
        }
      }

      const page = all.slice(offset, offset + limit)
      const pageInfo: PageInfo = {
        offset,
        limit,
        hasMore: offset + limit < all.length,
        ...(all.length <= 1000 ? { total: all.length } : {}),
      }

      return { items: page, page: pageInfo }
    }

    // 全局搜索（不提供 relatedTo）
    const all: SearchNodeResult[] = []

    for (const [nodeId, node] of this.nodes) {
      const typeName = node.constructor.name
      if (type && typeName !== type) continue
      if (query && !nodeId.includes(query) && !matchesAgentVisibleProperties(node, query)) continue
      all.push({ nodeId, type: typeName })
    }

    const page = all.slice(offset, offset + limit)
    const pageInfo: PageInfo = {
      offset,
      limit,
      hasMore: offset + limit < all.length,
      ...(all.length <= 1000 ? { total: all.length } : {}),
    }

    return { items: page, page: pageInfo }
  }
}
