import type { PolicyContext } from '../../policy/context'
import { OPEN_POLICY } from '../../policy/context'
import { checkEntityAccess, checkTypeAccess, redactProperties } from '../../policy/filters'
import { matchesFilters, projectFields } from '../../engine/query/filters'
import type { GraphQueryResult, GraphTraversalQuery, QueryRow } from '../../engine/query/graph-query'
import type { Edge, EdgeSummary, NeighborData, NodeData, PageInfo, Paginated, ToolResult } from '../../engine/runtime/types'
import { toolErr, toolOk } from '../../engine/runtime/types'
import type { FindNodesOpts, GetNeighborsOpts, GraphStore } from '../../engine/stores/graph-store'

const DEFAULT_PAGE_LIMIT = 20
const MAX_LIMIT = 200
const MAX_WORKING_SET = 500

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

// ── InMemoryGraphStore (V8) ──
// Simplified: uses NodeData directly, no BaseNode decorator pattern
// Implements GraphStore interface for traversal-only queries

export class InMemoryGraphStore implements GraphStore {
  nodes = new Map<string, NodeData>()
  edges: Edge[] = []

  addNode(node: NodeData): void {
    this.nodes.set(node.id, node)
  }

  addEdge(edge: Edge): void {
    this.edges.push(edge)
  }

  // ── GraphStore Interface Methods ──

  async getNode(id: string): Promise<NodeData | undefined> {
    return this.nodes.get(id)
  }

  async findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>> {
    const { type, where, fields, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts
    const all: NodeData[] = []

    for (const [, node] of this.nodes) {
      if (type && node.type !== type) continue
      if (where && where.length > 0 && !matchesFilters(node.properties, where)) continue
      const projected = fields && fields.length > 0 ? projectFields(node.properties, fields) : node.properties
      all.push({ id: node.id, type: node.type, properties: projected })
    }

    return paginate(all, offset, limit)
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts = {}): Promise<Paginated<NeighborData>> {
    const { relation, direction = 'both', targetType, where, fields, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts

    const all: NeighborData[] = []
    const seen = new Set<string>()

    const pushNeighbor = (targetId: string, typeName: string, rel: string, dir: 'out' | 'in') => {
      if (targetType && typeName !== targetType) return
      const key = `${dir}:${rel}:${targetId}`
      if (seen.has(key)) return

      const target = this.nodes.get(targetId)
      if (!target) return

      if (where && where.length > 0 && !matchesFilters(target.properties, where)) return

      seen.add(key)
      const entry: NeighborData = {
        nodeId: targetId,
        type: typeName,
        relation: rel,
        direction: dir,
      }
      if (fields && fields.length > 0) {
        entry.properties = projectFields(target.properties, fields)
      }
      all.push(entry)
    }

    if (direction === 'out' || direction === 'both') {
      for (const e of this.edges) {
        if (e.from === nodeId && (relation === undefined || e.type === relation)) {
          const target = this.nodes.get(e.to)
          pushNeighbor(e.to, target?.type ?? 'Unknown', e.type, 'out')
        }
      }
    }

    if (direction === 'in' || direction === 'both') {
      for (const e of this.edges) {
        if (e.to === nodeId && (relation === undefined || e.type === relation)) {
          const source = this.nodes.get(e.from)
          pushNeighbor(e.from, source?.type ?? 'Unknown', e.type, 'in')
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
        const targetType = this.nodes.get(e.to)?.type ?? 'Unknown'
        bump(e.type, 'out', targetType)
      }
      if (e.to === nodeId) {
        const sourceType = this.nodes.get(e.from)?.type ?? 'Unknown'
        bump(e.type, 'in', sourceType)
      }
    }

    return Array.from(counts.values())
  }

  // ── GraphTraversalQuery Execution ──

  async query(query: GraphTraversalQuery, policy: PolicyContext = OPEN_POLICY): Promise<ToolResult<GraphQueryResult>> {
    const workingSets = new Map<string, Set<string>>()
    const startAlias = query.match.alias ?? '_start'

    // MATCH phase
    if (!checkTypeAccess(query.match.type, policy)) {
      return toolErr('POLICY_DENIED', `MATCH: type "${query.match.type}" denied by policy`)
    }

    const matchPage = await this.findNodes({
      type: query.match.type,
      where: query.match.where,
      limit: MAX_WORKING_SET,
      offset: 0,
    })

    const matchSet = new Set<string>()
    for (const node of matchPage.items) {
      if (!checkEntityAccess(node.id, policy)) continue
      matchSet.add(node.id)
    }
    workingSets.set(startAlias, matchSet)

    // TRAVERSE phase
    let currentAlias = startAlias
    for (const step of query.traverse ?? []) {
      const fromAlias = step.from ?? currentAlias
      const fromSet = workingSets.get(fromAlias)
      if (!fromSet) {
        return toolErr(
          'INVALID_ARGS',
          `TRAVERSE: alias "${fromAlias}" not found, known aliases: [${Array.from(workingSets.keys()).join(', ')}]`
        )
      }

      if (step.targetType && !checkTypeAccess(step.targetType, policy)) {
        return toolErr('POLICY_DENIED', `TRAVERSE: targetType "${step.targetType}" denied by policy`)
      }

      const survivors = new Set<string>()
      const targets = new Set<string>()

      for (const fromId of fromSet) {
        const neighbors = await this.getNeighbors(fromId, {
          relation: step.relation,
          direction: step.direction ?? 'out',
          targetType: step.targetType,
          where: step.where,
          limit: MAX_WORKING_SET,
          offset: 0,
        })

        let hasMatch = false
        for (const neighbor of neighbors.items) {
          if (!checkEntityAccess(neighbor.nodeId, policy)) continue
          if (!checkTypeAccess(neighbor.type, policy)) continue
          hasMatch = true
          targets.add(neighbor.nodeId)
        }

        if (hasMatch) {
          survivors.add(fromId)
        }
      }

      if (step.require === 'exists') {
        workingSets.set(fromAlias, survivors)
      } else if (step.require === 'none') {
        const original = workingSets.get(fromAlias)!
        const noMatch = new Set(Array.from(original).filter((id) => !survivors.has(id)))
        workingSets.set(fromAlias, noMatch)
      }

      if (step.alias) {
        workingSets.set(step.alias, targets)
      }
      currentAlias = step.alias ?? fromAlias
    }

    // RETURN phase (V8: NO aggregate)
    const alias = query.return.alias ?? currentAlias
    const nodeSet = workingSets.get(alias)
    if (!nodeSet) {
      return toolErr(
        'INVALID_ARGS',
        `RETURN: alias "${alias}" not found, known aliases: [${Array.from(workingSets.keys()).join(', ')}]`
      )
    }

    const limit = Math.min(query.return.limit ?? 50, MAX_LIMIT)
    const offset = query.return.offset ?? 0

    const allRows: QueryRow[] = []
    let truncated = false

    for (const nodeId of nodeSet) {
      if (allRows.length >= MAX_WORKING_SET) {
        truncated = true
        break
      }
      const node = this.nodes.get(nodeId)
      if (!node) continue

      const props = redactProperties(node.properties, policy)
      const projected =
        query.return.fields && query.return.fields.length > 0 ? projectFields(props, query.return.fields) : props

      allRows.push({ nodeId, type: node.type, properties: projected })
    }

    const paged = allRows.slice(offset, offset + limit)
    const result: GraphQueryResult = {
      mode: 'nodes',
      rows: paged,
      total: allRows.length,
      truncated,
    }

    return toolOk(result)
  }
}
