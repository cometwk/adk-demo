import type { GetNeighborsOpts, NeighborData, NodeData } from '../../runtime/graph-store'
import type { PropertyFilter } from '../../runtime/query-types'
import type { Paginated } from '../../runtime/types'
import type { SearchParams } from './axios'
import type { RestEntityType } from './types'

const DEFAULT_PAGE_LIMIT = 20

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

export function toGlobalId(type: RestEntityType, rawId: string | number): string {
  return `${type}:${String(rawId)}`
}

export function parseGlobalId(
  id: string,
  typeToPrefix: Record<RestEntityType, string>,
): { type: RestEntityType; rawId: string } {
  const i = id.indexOf(':')
  if (i <= 0) {
    throw new Error(`Invalid global node id "${id}"; expected "Type:rawId"`)
  }
  const type = id.slice(0, i)
  if (!typeToPrefix[type]) {
    throw new Error(`Unknown entity type in id "${id}"`)
  }
  return { type, rawId: id.slice(i + 1) }
}

export function filtersToSearchParams(
  filters: PropertyFilter[] | undefined,
  fields?: string[],
  offset = 0,
  limit = DEFAULT_PAGE_LIMIT,
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

export function rawIdOf(node: NodeData): string {
  const i = node.id.indexOf(':')
  return i === -1 ? node.id : node.id.slice(i + 1)
}

export function matchesNeighborFilters(
  props: Record<string, unknown>,
  filters: NonNullable<GetNeighborsOpts['where']>,
): boolean {
  for (const f of filters) {
    const v = props[f.property]
    switch (f.op) {
      case 'eq':
        if (v !== f.value) return false
        break
      case 'ne':
        if (v === f.value) return false
        break
      case 'contains':
        if (!String(v).includes(String(f.value))) return false
        break
      case 'in':
        if (!Array.isArray(f.value) || !f.value.includes(v)) return false
        break
      default:
        break
    }
  }
  return true
}

export function neighborsFromNodes(
  nodes: NodeData[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
  pageInfo?: Paginated<NodeData>['page'],
): Paginated<NeighborData> {
  const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
  const offset = opts.offset ?? 0
  let filtered = nodes

  if (opts.targetType) {
    filtered = filtered.filter((n) => n.type === opts.targetType)
  }

  const items: NeighborData[] = []
  for (const n of filtered) {
    const props = n.properties
    if (opts.where?.length && !matchesNeighborFilters(props, opts.where)) continue

    const entry: NeighborData = {
      nodeId: n.id,
      type: n.type,
      relation,
      direction,
    }
    if (opts.fields?.length) {
      entry.properties = props
    }
    items.push(entry)
  }

  const slice = items.slice(offset, offset + limit)
  return {
    items: slice,
    page: pageInfo ?? {
      offset,
      limit,
      hasMore: offset + limit < items.length,
      total: items.length,
    },
  }
}