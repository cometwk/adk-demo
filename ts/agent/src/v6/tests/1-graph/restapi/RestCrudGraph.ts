import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
} from '../../../runtime/graph-store'
import { projectFields } from '../../../runtime/graph-filters'
import type { Paginated } from '../../../runtime/types'
import type { RelationSchema } from '../../../ontology/schema'
import type { SearchParams } from './axios'
import {
  apiSearch,
  filtersToSearchParams,
  parseGlobalId,
  rowToNodeData,
  toGlobalId,
  TYPE_API_PREFIX,
} from './search-helpers'
import type {
  AgentClosureRow,
  AgentRelRow,
  AgentRow,
  GraphEntityType,
  MerchRow,
} from './types'

const DEFAULT_PAGE_LIMIT = 20

type NeighborHandler = (
  source: NodeData,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
) => Promise<Paginated<NeighborData>>

/** 基于 /admin{entity}/search 的 GraphStore 实现 */
export class RestCrudGraphStore implements GraphStore {
  private readonly relationHandlers: Map<string, NeighborHandler>

  constructor(_opts: { relations?: RelationSchema[] } = {}) {
    this.relationHandlers = buildRelationHandlers()
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
    const page = await apiSearch<Record<string, unknown>>(prefix, params)

    return {
      items: page.items.map((row) => rowToNodeData(type, row)),
      page: page.page,
    }
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
    if (!opts.relation) {
      throw new Error('getNeighbors: relation is required')
    }

    const source = await this.getNode(nodeId)
    if (!source) {
      return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const handler = this.relationHandlers.get(`${source.type}:${opts.relation}:${direction}`)
    if (!handler) {
      throw new Error(
        `getNeighbors: unsupported relation "${opts.relation}" direction="${direction}" from type ${source.type}`,
      )
    }

    return handler(source, direction, opts)
  }

  async getEdgeSummary(nodeId: string): Promise<EdgeSummary[]> {
    const source = await this.getNode(nodeId)
    if (!source) return []

    const summaries: EdgeSummary[] = []
    const seen = new Set<string>()

    for (const [key, handler] of this.relationHandlers) {
      if (!key.startsWith(`${source.type}:`)) continue
      const [, relation, direction] = key.split(':') as [string, string, 'out' | 'in']
      const sk = `${direction}:${relation}`
      if (seen.has(sk)) continue

      const page = await handler(source, direction, {
        relation,
        limit: 1,
        offset: 0,
      })
      const total = page.page.total ?? page.items.length
      if (total === 0) continue

      const targetType = page.items[0]?.type ?? 'Unknown'
      summaries.push({ relation, direction, targetType, count: total })
      seen.add(sk)
    }

    return summaries
  }
}

function buildRelationHandlers(): Map<string, NeighborHandler> {
  const m = new Map<string, NeighborHandler>()

  // Agent → 直接下级
  m.set('Agent:child_of:out', async (source, _dir, opts) => {
    const rawParentId = parseGlobalId(source.id).rawId
    return searchAsNeighbors(
      'Agent',
      { 'where.parent_id.eq': rawParentId },
      'child_of',
      'out',
      opts,
    )
  })

  // Agent → 直接上级
  m.set('Agent:child_of:in', async (source, _dir, opts) => {
    const parentId = source.properties.parent_id
    if (!parentId || parentId === '0') {
      return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }
    const parent = await fetchOne('Agent', String(parentId))
    if (!parent) {
      return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }
    return neighborsFromNodes([parent], 'child_of', 'in', opts)
  })

  // Agent → 闭包后代
  m.set('Agent:descendant_of:out', async (source, _dir, opts) => {
    const ancestorId = parseGlobalId(source.id).rawId
    const closures = await apiSearch<AgentClosureRow>(TYPE_API_PREFIX.AgentClosure, {
      'where.ancestor_id.eq': ancestorId,
      'where.depth.gt': 0,
      pagesize: opts.limit ?? DEFAULT_PAGE_LIMIT,
      page: opts.offset ? Math.floor((opts.offset ?? 0) / (opts.limit ?? DEFAULT_PAGE_LIMIT)) : 0,
    })
    const agentIds = closures.items.map((c) => c.descendant_id)
    return agentsByIds(agentIds, 'descendant_of', 'out', opts)
  })

  // Agent → 闭包祖先
  m.set('Agent:ancestor_of:out', async (source, _dir, opts) => {
    const descendantId = parseGlobalId(source.id).rawId
    const closures = await apiSearch<AgentClosureRow>(TYPE_API_PREFIX.AgentClosure, {
      'where.descendant_id.eq': descendantId,
      'where.depth.gt': 0,
      pagesize: opts.limit ?? DEFAULT_PAGE_LIMIT,
      page: opts.offset ? Math.floor((opts.offset ?? 0) / (opts.limit ?? DEFAULT_PAGE_LIMIT)) : 0,
    })
    const agentIds = closures.items.map((c) => c.ancestor_id)
    return agentsByIds(agentIds, 'ancestor_of', 'out', opts)
  })

  // Agent → 绑定商户（经 agent_rel）
  m.set('Agent:binds_merch:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    const rels = await apiSearch<AgentRelRow>(TYPE_API_PREFIX.AgentRel, {
      'where.agent_no.eq': agentNo,
      'where.agent_type.eq': 'MERCH',
      pagesize: 500,
      page: 0,
    })
    const merchIds = rels.items.map((r) => r.obj_id)
    return merchsByIds(merchIds, 'binds_merch', 'out', opts)
  })

  // Agent → 进件
  m.set('Agent:submitted_apply:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    return searchAsNeighbors(
      'Apply',
      { 'where.agent_no.eq': agentNo },
      'submitted_apply',
      'out',
      opts,
    )
  })

  // Agent → 日分润
  m.set('Agent:has_profit_daily:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    return searchAsNeighbors(
      'ProfitDaily',
      { 'where.agent_no.eq': agentNo },
      'has_profit_daily',
      'out',
      opts,
    )
  })

  // Merch → 绑定代理（入边 binds_merch）
  m.set('Merch:bound_by:out', async (source, _dir, opts) => {
    const merchNo = String(source.properties.merch_no ?? '')
    const rels = await apiSearch<AgentRelRow>(TYPE_API_PREFIX.AgentRel, {
      'where.obj_no.eq': merchNo,
      'where.agent_type.eq': 'MERCH',
      pagesize: 100,
      page: 0,
    })
    const agentNos = [...new Set(rels.items.map((r) => r.agent_no))]
    return agentsByNos(agentNos, 'bound_by', 'out', opts)
  })

  // Merch → 进件记录
  m.set('Merch:created_from:out', async (source, _dir, opts) => {
    const merchNo = String(source.properties.merch_no ?? '')
    return searchAsNeighbors(
      'Apply',
      { 'where.merch_no.eq': merchNo },
      'created_from',
      'out',
      opts,
    )
  })

  // Merch → 日交易
  m.set('Merch:has_order_daily:out', async (source, _dir, opts) => {
    const merchNo = String(source.properties.merch_no ?? '')
    return searchAsNeighbors(
      'OrderDaily',
      { 'where.merch_no.eq': merchNo },
      'has_order_daily',
      'out',
      opts,
    )
  })

  // Apply → 代理商
  m.set('Apply:submitted_by:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    return agentsByNos([agentNo], 'submitted_by', 'out', opts)
  })

  // Apply → 商户
  m.set('Apply:creates:out', async (source, _dir, opts) => {
    const merchNo = String(source.properties.merch_no ?? '')
    if (!merchNo) {
      return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }
    const page = await apiSearch<MerchRow>(TYPE_API_PREFIX.Merch, {
      'where.merch_no.eq': merchNo,
      pagesize: 1,
      page: 0,
    })
    const nodes = page.items.map((row) => rowToNodeData('Merch', row as unknown as Record<string, unknown>))
    return neighborsFromNodes(nodes, 'creates', 'out', opts)
  })

  // AgentRel → Agent / Merch
  m.set('AgentRel:for_agent:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    return agentsByNos([agentNo], 'for_agent', 'out', opts)
  })

  m.set('AgentRel:for_merch:out', async (source, _dir, opts) => {
    const objId = String(source.properties.obj_id ?? '')
    if (source.properties.agent_type !== 'MERCH') {
      return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }
    const merch = await fetchOne('Merch', objId)
    if (!merch) return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    return neighborsFromNodes([merch], 'for_merch', 'out', opts)
  })

  // AgentClosure → 祖先/后代 Agent
  m.set('AgentClosure:ancestor:out', async (source, _dir, opts) => {
    const ancestorId = String(source.properties.ancestor_id ?? '')
    const agent = await fetchOne('Agent', ancestorId)
    if (!agent) return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    return neighborsFromNodes([agent], 'ancestor', 'out', opts)
  })

  m.set('AgentClosure:descendant:out', async (source, _dir, opts) => {
    const descendantId = String(source.properties.descendant_id ?? '')
    const agent = await fetchOne('Agent', descendantId)
    if (!agent) return emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    return neighborsFromNodes([agent], 'descendant', 'out', opts)
  })

  // OrderDaily / ProfitDaily → 关联实体
  m.set('OrderDaily:for_merch:out', async (source, _dir, opts) => {
    const merchNo = String(source.properties.merch_no ?? '')
    const page = await apiSearch<MerchRow>(TYPE_API_PREFIX.Merch, {
      'where.merch_no.eq': merchNo,
      pagesize: 1,
      page: 0,
    })
    const nodes = page.items.map((row) => rowToNodeData('Merch', row as unknown as Record<string, unknown>))
    return neighborsFromNodes(nodes, 'for_merch', 'out', opts)
  })

  m.set('ProfitDaily:for_agent:out', async (source, _dir, opts) => {
    const agentNo = String(source.properties.agent_no ?? '')
    return agentsByNos([agentNo], 'for_agent', 'out', opts)
  })

  return m
}

async function fetchOne(type: GraphEntityType, rawId: string): Promise<NodeData | undefined> {
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

  const page = await apiSearch<Record<string, unknown>>(TYPE_API_PREFIX[type], params)
  const row = page.items[0]
  return row ? rowToNodeData(type, row) : undefined
}

async function searchAsNeighbors(
  targetType: GraphEntityType,
  extraParams: SearchParams,
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
  const offset = opts.offset ?? 0
  const page = await apiSearch<Record<string, unknown>>(TYPE_API_PREFIX[targetType], {
    ...filtersToSearchParams(opts.where, opts.fields, offset, limit),
    ...extraParams,
  })
  const nodes = page.items.map((row) => rowToNodeData(targetType, row))
  return neighborsFromNodes(nodes, relation, direction, opts, page.page)
}

async function agentsByIds(
  rawIds: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(rawIds.filter(Boolean))]
  const nodes: NodeData[] = []
  for (const id of unique) {
    const n = await fetchOne('Agent', id)
    if (n) nodes.push(n)
  }
  return neighborsFromNodes(nodes, relation, direction, opts)
}

async function agentsByNos(
  agentNos: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(agentNos.filter(Boolean))]
  const nodes: NodeData[] = []
  for (const no of unique) {
    const page = await apiSearch<AgentRow>(TYPE_API_PREFIX.Agent, {
      'where.agent_no.eq': no,
      pagesize: 1,
      page: 0,
    })
    const row = page.items[0]
    if (row) nodes.push(rowToNodeData('Agent', row as unknown as Record<string, unknown>))
  }
  return neighborsFromNodes(nodes, relation, direction, opts)
}

async function merchsByIds(
  rawIds: string[],
  relation: string,
  direction: 'out' | 'in',
  opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
  const unique = [...new Set(rawIds.filter(Boolean))]
  const nodes: NodeData[] = []
  for (const id of unique) {
    const n = await fetchOne('Merch', id)
    if (n) nodes.push(n)
  }
  return neighborsFromNodes(nodes, relation, direction, opts)
}

function neighborsFromNodes(
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

function matchesNeighborFilters(
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

function emptyNeighbors(limit: number, offset: number): Paginated<NeighborData> {
  return {
    items: [],
    page: { offset, limit, hasMore: false, total: 0 },
  }
}

export { toGlobalId, parseGlobalId } from './search-helpers'
