import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
} from '../../../runtime/graph-store'
import type { Paginated } from '../../../runtime/types'
import type { RelationSchema } from '../../../ontology/schema'
import {
  apiSearchSafe,
  filtersToSearchParams,
  parseGlobalId,
  rowToNodeData,
  TYPE_API_PREFIX,
} from './search-helpers'
import type { GraphEntityType } from './types'
import { paymentAccessBindings } from './access-bindings'
import { executeAccessBinding, fetchOne, sharedAccessContext } from './access-executor'

const DEFAULT_PAGE_LIMIT = 20

/** 基于 /admin{entity}/search 的 GraphStore 实现，完全由声明式 bindings 驱动 */
export class RestCrudGraphStore implements GraphStore {
  constructor(_opts: { relations?: RelationSchema[] } = {}) {
    // 实例化时，通常可以使用传入的 relations 校验 bindings
  }

  async getNode(id: string): Promise<NodeData | undefined> {
    const { type, rawId } = parseGlobalId(id)
    return fetchOne(type, rawId)
  }

  async findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>> {
    const type = opts.type as GraphEntityType
    const prefix = TYPE_API_PREFIX[type]
    if (!prefix) {
      throw new Error(`findNodes: unknown type "${opts.type}"`)
    }

    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
    const offset = opts.offset ?? 0
    const params = filtersToSearchParams(opts.where, opts.fields, offset, limit)
    const page = await apiSearchSafe<Record<string, unknown>>(prefix, params)

    return {
      items: page.items.map((row: Record<string, unknown>) => rowToNodeData(type, row)),
      page: page.page,
    }
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
    if (!opts.relation) {
      throw new Error('getNeighbors: relation is required')
    }

    const source = await this.getNode(nodeId)
    if (!source) {
      return sharedAccessContext.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const key = `${source.type}:${opts.relation}:${direction}`
    const binding = paymentAccessBindings[key]

    if (!binding) {
      throw new Error(
        `getNeighbors: unsupported relation "${opts.relation}" direction="${direction}" from type ${source.type}`,
      )
    }

    return executeAccessBinding(binding, source, opts)
  }

  async getEdgeSummary(nodeId: string): Promise<EdgeSummary[]> {
    const source = await this.getNode(nodeId)
    if (!source) return []

    const summaries: EdgeSummary[] = []
    const seen = new Set<string>()

    for (const [key, binding] of Object.entries(paymentAccessBindings)) {
      if (binding.fromType !== source.type) continue
      const direction = binding.direction
      const relation = binding.relation
      const sk = `${direction}:${relation}`
      if (seen.has(sk)) continue

      try {
        const page = await executeAccessBinding(binding, source, {
          relation,
          limit: 1,
          offset: 0,
        })
        const total = page.page.total ?? page.items.length
        if (total === 0) continue

        const targetType = page.items[0]?.type ?? binding.toType
        summaries.push({ relation, direction, targetType, count: total })
        seen.add(sk)
      } catch (err) {
        // 优雅处理未公开或 404 端点，直接跳过，防止 getEdgeSummary 崩掉
        continue
      }
    }

    return summaries
  }
}

export { toGlobalId, parseGlobalId } from './search-helpers'
