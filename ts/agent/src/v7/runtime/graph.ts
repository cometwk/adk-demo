import { AgentMethodRegistry, AgentPropertyRegistry, type MethodSchema } from './registry'
import type { Edge, NodeId, PageInfo, Paginated } from './types'

export abstract class BaseNode {
  id: NodeId
  constructor(id: NodeId) {
    this.id = id
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

const DEFAULT_PAGE_LIMIT = 20

export class Graph {
  nodes = new Map<string, BaseNode>()
  edges: Edge[] = []

  addNode(node: BaseNode) {
    this.nodes.set(node.id, node)
  }

  addEdge(edge: Edge) {
    this.edges.push(edge)
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

    if (direction === 'out' || direction === 'both') {
      for (const e of this.edges) {
        if (e.from === nodeId && (!relation || e.type === relation)) {
          const target = this.nodes.get(e.to)
          const typeName = target?.constructor.name ?? 'Unknown'
          if (!typeFilter || typeName === typeFilter) {
            all.push({
              nodeId: e.to,
              type: typeName,
              relation: e.type,
              direction: 'out',
            })
          }
        }
      }
    }

    if (direction === 'in' || direction === 'both') {
      for (const e of this.edges) {
        if (e.to === nodeId && (!relation || e.type === relation)) {
          const source = this.nodes.get(e.from)
          const typeName = source?.constructor.name ?? 'Unknown'
          if (!typeFilter || typeName === typeFilter) {
            all.push({
              nodeId: e.from,
              type: typeName,
              relation: e.type,
              direction: 'in',
            })
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

  searchNodes(opts: {
    query?: string
    type?: string
    limit?: number
    offset?: number
  }): Paginated<{ nodeId: string; type: string }> {
    const { query, type, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts
    const all: { nodeId: string; type: string }[] = []

    for (const [nodeId, node] of this.nodes) {
      const typeName = node.constructor.name
      if (type && typeName !== type) continue
      if (query && !nodeId.includes(query)) continue
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
