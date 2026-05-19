import axios from 'axios'
import type { PropertyFilter } from '../../../runtime/query-types'
import type { NodeData } from '../../../runtime/graph-store'
import type { Paginated } from '../../../runtime/types'
import type { SearchParams, TableData } from './axios'
import type { GraphEntityType } from './types'

const DEFAULT_LIMIT = 20

/** 实体类型 → REST search 路径前缀 */
export const TYPE_API_PREFIX: Record<GraphEntityType, string> = {
  Agent: '/agent',
  Merch: '/merch',
  Apply: '/apply',
  AgentRel: '/agent_rel',
  AgentClosure: '/agent_closure',
  OrderDaily: '/order_daily',
  ProfitDaily: '/profit_daily',
}

const GRAPH_FILTER_TO_API_OP: Record<string, string> = {
  eq: 'eq',
  ne: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  contains: 'like',
  in: 'in',
}

export function toGlobalId(type: GraphEntityType, rawId: string | number): string {
  return `${type}:${String(rawId)}`
}

export function parseGlobalId(id: string): { type: GraphEntityType; rawId: string } {
  const i = id.indexOf(':')
  if (i <= 0) {
    throw new Error(`Invalid global node id "${id}"; expected "Type:rawId"`)
  }
  const type = id.slice(0, i) as GraphEntityType
  if (!TYPE_API_PREFIX[type]) {
    throw new Error(`Unknown entity type in id "${id}"`)
  }
  return { type, rawId: id.slice(i + 1) }
}

export function rowToNodeData(type: GraphEntityType, row: Record<string, unknown>): NodeData {
  let rawId = String(row.id ?? '')
  if (type === 'AgentClosure') {
    rawId = `${row.ancestor_id}_${row.descendant_id}`
  }
  const { id: _id, ...rest } = row
  return {
    id: toGlobalId(type, rawId),
    type,
    properties: rest,
  }
}

export function filtersToSearchParams(
  filters: PropertyFilter[] | undefined,
  fields?: string[],
  offset = 0,
  limit = DEFAULT_LIMIT,
): SearchParams {
  const params: SearchParams = {
    page: limit > 0 ? Math.floor(offset / limit) : 0,
    pagesize: limit,
  }
  if (fields?.length) {
    params.select = fields.join(',')
  }
  for (const f of filters ?? []) {
    const apiOp = GRAPH_FILTER_TO_API_OP[f.op]
    if (!apiOp) continue
    let value = f.value
    if (f.op === 'contains' && typeof value === 'string') {
      value = `%${value}%`
    }
    if (f.op === 'in' && Array.isArray(value)) {
      value = value.join(',')
    }
    params[`where.${f.property}.${apiOp}`] = value as string | number
  }
  return params
}

export async function apiSearch<T extends Record<string, unknown>>(
  prefix: string,
  query?: SearchParams,
): Promise<Paginated<T>> {
  const r = (await axios.get(`/admin${prefix}/search`, { params: query })) as TableData<T>
  const limit = r.pagesize || DEFAULT_LIMIT
  const offset = r.page * limit
  return {
    items: r.data,
    page: {
      offset,
      limit,
      hasMore: r.total > offset + r.data.length,
      total: r.total,
    },
  }
}
