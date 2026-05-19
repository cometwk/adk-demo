import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, type MethodSchema, type RelationRegistryEntry } from './registry'
import { matchesFilters, projectFields } from './graph-filters'
import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
} from './graph-store'
import type { Edge, NodeId, PageInfo, Paginated } from './types'
import type { RelationSchema } from '../ontology/schema'

const DEFAULT_PAGE_LIMIT = 20

const nodeGraphStores = new WeakMap<BaseNode, InMemoryGraphStore>()

/** 节点加入 InMemoryGraphStore 后，行为层方法可通过此访问边数据 */
export function getNodeGraphStore(node: BaseNode): InMemoryGraphStore | undefined {
  return nodeGraphStores.get(node)
}

// ── BaseNode：本体注册 + 方法执行载体 ──

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

  protected getGraphStore(): InMemoryGraphStore | undefined {
    return getNodeGraphStore(this)
  }
}

function nodeToData(node: BaseNode, fields?: string[]): NodeData {
  const props = node.getProperties()
  return {
    id: node.id,
    type: node.constructor.name,
    properties: projectFields(props, fields),
  }
}

function paginate<T>(all: T[], offset: number, limit: number): Paginated<T> {
  const page = all.slice(offset, offset + limit)
  const pageInfo: PageInfo = {
    offset,
    limit,
    hasMore: offset + limit < all.length,
    ...(all.length <= 1000 ? { total: all.length } : {}),
  }
  return { items: page, page: pageInfo }
}

// ── InMemoryGraphStore ──

export class InMemoryGraphStore implements GraphStore {
  nodes = new Map<string, BaseNode>()
  edges: Edge[] = []

  private readonly relationIndex: Map<string, RelationSchema>

  constructor(opts: { relations?: RelationSchema[] } = {}) {
    this.relationIndex = new Map((opts.relations ?? []).map((r) => [r.type, r]))
  }

  addNode(node: BaseNode): void {
    nodeGraphStores.set(node, this)
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

  /** 同步获取 BaseNode（方法执行、实体链接等） */
  getBaseNode(id: string): BaseNode | undefined {
    return this.nodes.get(id)
  }

  /** @deprecated 使用 getBaseNode */
  getNodeSync(id: string): BaseNode | undefined {
    return this.getBaseNode(id)
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

  // ── GraphStore ──

  async getNode(id: string): Promise<NodeData | undefined> {
    const node = this.getBaseNode(id)
    if (!node) return undefined
    return nodeToData(node)
  }

  async findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>> {
    const { type, where, fields, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts
    const all: NodeData[] = []

    for (const [, node] of this.nodes) {
      if (node.constructor.name !== type) continue
      const props = node.getProperties()
      if (where && where.length > 0 && !matchesFilters(props, where)) continue
      all.push(nodeToData(node, fields))
    }

    return paginate(all, offset, limit)
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
    const {
      relation,
      direction = 'both',
      targetType,
      where,
      fields,
      limit = DEFAULT_PAGE_LIMIT,
      offset = 0,
    } = opts

    if (!relation) {
      throw new Error('getNeighbors: relation is required')
    }

    const all: NeighborData[] = []
    const seen = new Set<string>()

    const pushNeighbor = (
      targetId: string,
      typeName: string,
      rel: string,
      dir: 'out' | 'in',
    ) => {
      if (targetType && typeName !== targetType) return
      const key = `${dir}:${rel}:${targetId}`
      if (seen.has(key)) return

      const target = this.getBaseNode(targetId)
      if (!target) return

      const props = target.getProperties()
      if (where && where.length > 0 && !matchesFilters(props, where)) return

      seen.add(key)
      const entry: NeighborData = {
        nodeId: targetId,
        type: typeName,
        relation: rel,
        direction: dir,
      }
      if (fields && fields.length > 0) {
        entry.properties = projectFields(props, fields)
      }
      all.push(entry)
    }

    if (direction === 'out' || direction === 'both') {
      for (const e of this.edges) {
        if (e.from === nodeId && e.type === relation) {
          const target = this.nodes.get(e.to)
          pushNeighbor(e.to, target?.constructor.name ?? 'Unknown', e.type, 'out')
        }
      }
    }

    if (direction === 'in' || direction === 'both') {
      for (const e of this.edges) {
        if (e.to === nodeId && e.type === relation) {
          const source = this.nodes.get(e.from)
          pushNeighbor(e.from, source?.constructor.name ?? 'Unknown', e.type, 'in')
        }
      }
    }

    return paginate(all, offset, limit)
  }

  async getEdgeSummary(nodeId: string): Promise<EdgeSummary[]> {
    const counts = new Map<string, EdgeSummary>()

    const bump = (rel: string, dir: 'out' | 'in', targetType: string) => {
      const key = `${dir}:${rel}:${targetType}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { relation: rel, direction: dir, targetType, count: 1 })
      }
    }

    for (const e of this.edges) {
      if (e.from === nodeId) {
        const targetType = this.nodes.get(e.to)?.constructor.name ?? 'Unknown'
        bump(e.type, 'out', targetType)
      }
      if (e.to === nodeId) {
        const sourceType = this.nodes.get(e.from)?.constructor.name ?? 'Unknown'
        bump(e.type, 'in', sourceType)
      }
    }

    return Array.from(counts.values())
  }
}

/** 向后兼容别名 */
export type Graph = InMemoryGraphStore

// 保留旧类型导出
export type NeighborEntry = NeighborData

export type QueryNeighborsOpts = GetNeighborsOpts
export type SearchNodesOpts = FindNodesOpts
