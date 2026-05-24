import type { GetNeighborsOpts, NeighborData, NodeData, Paginated } from '../../engine'
import type { PropertyFilter } from '../../engine/query/graph-query'
import type { SearchParams } from './http-client'
import type { RestEntityType } from './bindings'
import { toGlobalId } from '../../engine'

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

// ID 编解码函数复用 engine 模块，不在此重新定义
// import { parseGlobalId, toGlobalId } from '../../engine'

export function filtersToSearchParams(
  filters: PropertyFilter[] | undefined,
  fields?: string[],
  offset?: number,
  limit?: number
): SearchParams {
  // 防御性默认值，防止 NaN 计算
  const _limit = limit ?? DEFAULT_PAGE_LIMIT
  const _offset = offset ?? 0

  const params: SearchParams = {
    page: _limit > 0 ? Math.floor(_offset / _limit) : 0,
    pagesize: _limit,
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

// 导出 toGlobalId 以供外部使用（从 engine 模块复用）
export { toGlobalId }