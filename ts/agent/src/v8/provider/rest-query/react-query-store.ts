import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
  Paginated,
  ToolResult,
} from '../../engine'
import type { GraphQueryResult, GraphTraversalQuery, QueryRow } from '../../engine/query/graph-query'
import type { PolicyContext } from '../../policy/context'
import { OPEN_POLICY } from '../../policy/context'
import { checkEntityAccess, checkTypeAccess, redactProperties } from '../../policy/filters'
import { matchesFilters, projectFields } from '../../engine/query/filters'
import { parseGlobalId, toGlobalId, toolOk, toolErr } from '../../engine'
import { BaseNode } from '../../ontology/base-node'
import type { RestEntityType, RestNodeClassRegistry } from './bindings'
import type { AccessContext, RestAccessBinding, RestAccessBindingMap } from './context'
import { apiSearch, apiSearchSafe, apiSearchArraySafe, emptyPaginated, isNotFoundError } from './api-search'
import { filtersToSearchParams, rawIdOf, neighborsFromNodes } from './helpers'
import type { SearchParams } from './http-client'

const DEFAULT_PAGE_LIMIT = 20
const MAX_LIMIT = 200
const MAX_WORKING_SET = 500

export class RestQueryGraphStore implements GraphStore {
  protected readonly bindings: RestAccessBindingMap
  protected readonly ctx: AccessContext
  protected readonly idGenerator?: (type: RestEntityType, row: Record<string, unknown>) => string
  protected readonly nodeCache: Map<string, BaseNode> = new Map()

  constructor(
    bindings: RestAccessBindingMap,
    partialCtx?: Partial<AccessContext>,
    opts?: {
      idGenerator?: (type: RestEntityType, row: Record<string, unknown>) => string
    }
  ) {
    this.bindings = bindings
    this.idGenerator = opts?.idGenerator
    this.ctx = this.buildAccessContext(partialCtx)
  }

  protected buildAccessContext(partialCtx?: Partial<AccessContext>): AccessContext {
    const base = this.createBaseContext()
    if (!partialCtx) return base
    return { ...base, ...partialCtx }
  }

  protected createBaseContext(): AccessContext {
    const self = this
    return {
      typeRegistry: {},
      rawId: rawIdOf,
      toGlobalId: toGlobalId,
      apiSearch: apiSearch,
      apiSearchSafe: apiSearchSafe,
      fetchOne: async (type: RestEntityType, rawId: string): Promise<NodeData | undefined> => {
        return self.fetchOneImpl(type, rawId)
      },
      fetchMany: async (type: RestEntityType, rawIds: string[]): Promise<NodeData[]> => {
        return self.fetchManyImpl(type, rawIds)
      },
      neighborsFromNodes: neighborsFromNodes,
      emptyNeighbors: (limit, offset) => emptyPaginated(limit, offset),
    }
  }

  protected async fetchOneImpl(type: RestEntityType, rawId: string): Promise<NodeData | undefined> {
    const prefix = this.ctx.typeRegistry[type]?.prefix
    if (!prefix) throw new Error(`fetchOne: unknown type "${type}"`)

    const params: SearchParams = { 'where.id.eq': rawId, pagesize: 1, page: 0 }
    const page = await apiSearchSafe<Record<string, unknown>>(prefix, params)
    const row = page.items[0]
    return row ? this.rowToNodeData(type, row) : undefined
  }

  protected async fetchManyImpl(type: RestEntityType, rawIds: string[]): Promise<NodeData[]> {
    const prefix = this.ctx.typeRegistry[type]?.prefix
    if (!prefix) throw new Error(`fetchMany: unknown type "${type}"`)

    // 批量查询实现（已移除测试 throw 语句）
    const params: SearchParams = { 'where.id.in': rawIds.join(',') }
    const rows = await apiSearchArraySafe<Record<string, unknown>>(prefix, params)
    return rows.map((row) => this.rowToNodeData(type, row))
  }

  protected rowToNodeData(type: RestEntityType, row: Record<string, unknown>, fields?: string[]): NodeData {
    let rawId = String(row.id ?? '')
    if (this.idGenerator) {
      rawId = this.idGenerator(type, row)
    }
    const { id: _id, ...rest } = row
    return {
      id: toGlobalId(type, rawId),
      type,
      properties: fields ? fields.reduce((acc, field) => {
        acc[field] = row[field]
        return acc
      }, {} as Record<string, unknown>) : rest,
    }
  }

  parseGlobalId(id: string): { type: RestEntityType; rawId: string } {
    const parsed = parseGlobalId(id)
    if (!parsed) {
      throw new Error(`Invalid global node id "${id}"`)
    }
    // 验证类型是否在注册表中
    if (!this.ctx.typeRegistry[parsed.type]) {
      throw new Error(`Unknown entity type in id "${id}"`)
    }
    return parsed as { type: RestEntityType; rawId: string }
  }

  // ── GraphStore Interface ──

  async getNode(id: string): Promise<NodeData | undefined> {
    const parsed = parseGlobalId(id)
    if (!parsed) return undefined
    return this.ctx.fetchOne(parsed.type, parsed.rawId)
  }

  async getBaseNode(id: string): Promise<BaseNode | undefined> {
    // 检查缓存
    const cached = this.nodeCache.get(id)
    if (cached) return cached

    // 解析 ID 获取 type
    const parsed = parseGlobalId(id)
    if (!parsed) return undefined

    const { type } = parsed

    // 获取 NodeClass，校验是否存在
    const NodeClass = this.ctx.typeRegistry[type]?.class
    if (!NodeClass) return undefined

    // 异步获取数据并创建 BaseNode 实例
    const data = await this.getNode(id)
    if (!data) return undefined

    // V8: BaseNode 不持有 GraphStore 引用，直接创建实例并填充属性
    const node = new NodeClass(id)
    if (data.properties) {
      Object.assign(node, data.properties)
    }

    // 缓存完整实例（Phase 1: 仅缓存 BaseNode 实例）
    this.nodeCache.set(id, node)
    return node
  }

  async findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>> {
    const type = opts.type as RestEntityType
    const prefix = this.ctx.typeRegistry[type]?.prefix
    if (!prefix) {
      throw new Error(`findNodes: unknown type "${opts.type}"`)
    }

    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
    const offset = opts.offset ?? 0
    const params = filtersToSearchParams(opts.where, opts.fields, offset, limit)
    const page = await apiSearchSafe<Record<string, unknown>>(prefix, params)

    return {
      items: page.items.map((row: Record<string, unknown>) => this.rowToNodeData(type, row, opts.fields)),
      page: page.page,
    }
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
    if (!opts.relation) {
      throw new Error('getNeighbors: relation is required')
    }

    const source = await this.getNode(nodeId)
    if (!source) {
      return this.ctx.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const key = `${source.type}:${opts.relation}:${direction}`
    const binding = this.bindings[key]

    if (!binding) {
      throw new Error(
        `getNeighbors: unsupported relation "${opts.relation}" direction="${direction}" from type ${source.type}`
      )
    }

    return this.executeBinding(binding, source, opts)
  }

  async getEdgeSummary(nodeId: string): Promise<EdgeSummary[]> {
    const source = await this.getNode(nodeId)
    if (!source) return []

    const summaries: EdgeSummary[] = []
    const seen = new Set<string>()

    for (const [key, binding] of Object.entries(this.bindings)) {
      if (binding.fromType !== source.type) continue
      const direction = binding.direction
      const relation = binding.relation
      const sk = `${direction}:${relation}`
      if (seen.has(sk)) continue

      try {
        const page = await this.executeBinding(binding, source, {
          relation,
          limit: 1,
          offset: 0,
        })
        const total = page.page.total ?? page.items.length
        if (total === 0) continue

        const targetType = page.items[0]?.type ?? binding.toType
        summaries.push({ relation, direction, targetType, count: total })
        seen.add(sk)
      } catch {
        continue
      }
    }

    return summaries
  }

  protected executeBinding(
    binding: RestAccessBinding,
    source: NodeData,
    opts: GetNeighborsOpts
  ): Promise<Paginated<NeighborData>> {
    if (binding.kind === 'custom') {
      return binding.handler(source, opts, this.ctx)
    }

    if (binding.kind === 'search') {
      const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
      const offset = opts.offset ?? 0
      const extraParams = binding.params(source, this.ctx)
      const searchParams = {
        ...filtersToSearchParams(opts.where, opts.fields, offset, limit),
        ...extraParams,
      }
      return this.executeSearchBinding(binding, searchParams, opts)
    }

    throw new Error(`Unsupported binding kind`)
  }

  protected async executeSearchBinding(
    binding: RestAccessBinding & { kind: 'search' },
    searchParams: SearchParams,
    opts: GetNeighborsOpts
  ): Promise<Paginated<NeighborData>> {
    const searchPrefix = this.ctx.typeRegistry[binding.searchOn]?.prefix
    const page = await apiSearchSafe<Record<string, unknown>>(searchPrefix, searchParams)
    const nodes = page.items.map((row) => this.rowToNodeData(binding.toType, row, opts.fields))
    return neighborsFromNodes(nodes, binding.relation, binding.direction, opts, page.page)
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

    // RETURN phase
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
      const node = await this.getNode(nodeId)
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