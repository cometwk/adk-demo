import { BaseNode, setNodeGraphStore } from '../runtime/graph'
import { matchesFilters, projectFields } from '../runtime/graph-filters'
import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
} from '../runtime/graph-store'
import type { Edge, NodeId, PageInfo, Paginated } from '../runtime/types'
import type { RelationSchema } from '../ontology/schema'

const DEFAULT_PAGE_LIMIT = 20

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
    ...(all.length <= 500 ? { total: all.length } : {}),
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
    setNodeGraphStore(node, this)
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

  /** 异步获取 BaseNode（方法执行、实体链接等） */
  async getBaseNode(id: string): Promise<BaseNode | undefined> {
    return this.nodes.get(id)
  }

  // ── GraphStore ──

  async getNode(id: string): Promise<NodeData | undefined> {
    const node = await this.getBaseNode(id)
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

    const pushNeighbor = async (
      targetId: string,
      typeName: string,
      rel: string,
      dir: 'out' | 'in',
    ) => {
      if (targetType && typeName !== targetType) return
      const key = `${dir}:${rel}:${targetId}`
      if (seen.has(key)) return

      const target = await this.getBaseNode(targetId)
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
          await pushNeighbor(e.to, target?.constructor.name ?? 'Unknown', e.type, 'out')
        }
      }
    }

    if (direction === 'in' || direction === 'both') {
      for (const e of this.edges) {
        if (e.to === nodeId && e.type === relation) {
          const source = this.nodes.get(e.from)
          await pushNeighbor(e.from, source?.constructor.name ?? 'Unknown', e.type, 'in')
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

// 保留旧类型导出（向后兼容）
export type NeighborEntry = NeighborData
export type QueryNeighborsOpts = GetNeighborsOpts
export type SearchNodesOpts = FindNodesOpts
