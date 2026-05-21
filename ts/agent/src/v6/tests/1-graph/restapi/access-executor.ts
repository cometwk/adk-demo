import type { NodeData, GetNeighborsOpts, NeighborData } from '../../../runtime/graph-store'
import type { Paginated } from '../../../runtime/types'
import { projectFields } from '../../../runtime/graph-filters'
import type { RestAccessBinding, AccessContext, RestEntityType } from '../../../provider/rest'
import type { GraphEntityType } from './types'
import type { SearchParams } from '../../../provider/rest'
import type { PaymentAccessContext } from './access-bindings'
import {
  apiSearch,
  apiSearchSafe,
  emptyPaginated,
  filtersToSearchParams,
  toGlobalId,
} from '../../../provider/rest'
import { TYPE_API_PREFIX } from './search-helpers'

const DEFAULT_PAGE_LIMIT = 20
const MAX_RESOLVE_LIMIT = 100

// ── 业务专用: rowToNodeData (处理 AgentClosure 复合键) ──

function rowToNodeData(type: GraphEntityType, row: Record<string, unknown>): NodeData {
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

/** 剥离 ID 的类型前缀 */
export function rawIdOf(node: NodeData): string {
  const i = node.id.indexOf(':')
  return i === -1 ? node.id : node.id.slice(i + 1)
}

/** 统一获取单节点数据 */
export async function fetchOne(type: GraphEntityType, rawId: string): Promise<NodeData | undefined> {
  const params: SearchParams =
    type === 'AgentClosure'
      ? (() => {
          const [ancestor_id, descendant_id] = rawId.split('_')
          return {
            'where.ancestor_id.eq': ancestor_id,
            'where.descendant_id.eq': descendant_id,
            pagesize: 1,
            page: 0,
          }
        })()
      : { 'where.id.eq': rawId, pagesize: 1, page: 0 }

  const page = await apiSearchSafe<Record<string, unknown>>(TYPE_API_PREFIX[type], params)
  const row = page.items[0]
  return row ? rowToNodeData(type, row) : undefined
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
      entry.properties = projectFields(props, opts.fields)
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

export async function agentsByIds(
  ctx: PaymentAccessContext,
  rawIds: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(rawIds.filter(Boolean))].slice(0, MAX_RESOLVE_LIMIT)
  // 使用 ctx.fetchMany 批量查询（经过 RestGraphStore.fetchManyImpl）
  const nodes = await ctx.fetchMany('Agent', unique)
  return neighborsFromNodes(nodes, relation, direction, opts)
}

export async function agentsByNos(
  ctx: PaymentAccessContext,
  agentNos: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(agentNos.filter(Boolean))].slice(0, MAX_RESOLVE_LIMIT)
  const nodes: NodeData[] = []
  for (const no of unique) {
    const page = await ctx.apiSearchSafe<any>(TYPE_API_PREFIX.Agent, {
      'where.agent_no.eq': no,
      pagesize: 1,
      page: 0,
    })
    const row = page.items[0]
    if (row) nodes.push(rowToNodeData('Agent', row))
  }
  return neighborsFromNodes(nodes, relation, direction, opts)
}

export async function merchsByIds(
  ctx: PaymentAccessContext,
  rawIds: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(rawIds.filter(Boolean))].slice(0, MAX_RESOLVE_LIMIT)
  // 使用 ctx.fetchMany 批量查询（经过 RestGraphStore.fetchManyImpl）
  const nodes = await ctx.fetchMany('Merch', unique)
  return neighborsFromNodes(nodes, relation, direction, opts)
}

/** 注入给声明式/编程式 Bindings 的上下文实现 */
export const sharedAccessContext: PaymentAccessContext = {
  rawId: rawIdOf,
  toGlobalId: toGlobalId,
  apiSearch: apiSearch,
  apiSearchSafe: apiSearchSafe,
  fetchOne: fetchOne as (type: string, rawId: string) => Promise<NodeData | undefined>,
  // fetchMany 由 RestGraphStore.buildAccessContext 提供（会被合并覆盖）
  fetchMany: async (_type: string, _rawIds: string[]) => {
    throw new Error('fetchMany should be provided by RestGraphStore, not sharedAccessContext')
  },
  agentsByIds: agentsByIds as (ctx: PaymentAccessContext, agentIds: string[], relation: string, direction: 'out' | 'in', opts: GetNeighborsOpts) => Promise<Paginated<NeighborData>>,
  agentsByNos: agentsByNos as (ctx: PaymentAccessContext, agentNos: string[], relation: string, direction: 'out' | 'in', opts: GetNeighborsOpts) => Promise<Paginated<NeighborData>>,
  merchsByIds: merchsByIds as (ctx: PaymentAccessContext, merchIds: string[], relation: string, direction: 'out' | 'in', opts: GetNeighborsOpts) => Promise<Paginated<NeighborData>>,
  neighborsFromNodes: neighborsFromNodes,
  emptyNeighbors: (limit, offset) => emptyPaginated(limit, offset),
}

/** 核心统一执行器 */
export async function executeAccessBinding(
  binding: RestAccessBinding,
  source: NodeData,
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  if (binding.kind === 'custom') {
    return binding.handler(source, opts, sharedAccessContext)
  }

  if (binding.kind === 'search') {
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
    const offset = opts.offset ?? 0
    const extraParams = binding.params(source, sharedAccessContext)
    const searchParams = {
      ...filtersToSearchParams(opts.where, opts.fields, offset, limit),
      ...extraParams,
    }
    const searchPrefix = TYPE_API_PREFIX[binding.searchOn as GraphEntityType]
    const page = await apiSearchSafe<Record<string, unknown>>(searchPrefix, searchParams)
    const nodes = page.items.map((row: Record<string, unknown>) => rowToNodeData(binding.toType as GraphEntityType, row))
    return neighborsFromNodes(nodes, binding.relation, binding.direction, opts, page.page)
  }

  throw new Error(`Unsupported access binding kind: "${(binding as any).kind}"`)
}
