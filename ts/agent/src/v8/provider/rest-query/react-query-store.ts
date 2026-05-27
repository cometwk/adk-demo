import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  GraphQueryContext,
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
const BATCH_IN_CHUNK = 100

function extractForeignKeyField(params: SearchParams): string | undefined {
  for (const key of Object.keys(params)) {
    const match = key.match(/^where\.(.+)\.eq$/)
    if (match) return match[1]
  }
  return undefined
}

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

  async getNode(id: string, ctx?: GraphQueryContext): Promise<NodeData | undefined> {
    const cached = ctx?.nodeDataCache?.get(id)
    if (cached) return cached

    const parsed = parseGlobalId(id)
    if (!parsed) return undefined
    const node = await this.ctx.fetchOne(parsed.type, parsed.rawId)
    if (node && ctx?.nodeDataCache) {
      ctx.nodeDataCache.set(id, node)
    }
    return node
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

  async getNeighbors(
    nodeId: string,
    opts: GetNeighborsOpts,
    ctx?: GraphQueryContext
  ): Promise<Paginated<NeighborData>> {
    if (!opts.relation) {
      throw new Error('getNeighbors: relation is required')
    }

    const source = await this.getNode(nodeId, ctx)
    if (!source) {
      return this.ctx.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
    }
    if (ctx?.nodeDataCache) {
      ctx.nodeDataCache.set(nodeId, source)
    }

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const key = `${source.type}:${opts.relation}:${direction}`
    const binding = this.bindings[key]

    if (!binding) {
      throw new Error(
        `getNeighbors: unsupported relation "${opts.relation}" direction="${direction}" from type ${source.type}`
      )
    }

    const page = await this.executeBinding(binding, source, opts)
    this.cacheNeighborNodeData(ctx, page.items, opts.fields)
    return page
  }

  async getNeighborsBatch(
    nodeIds: string[],
    opts: GetNeighborsOpts,
    ctx?: GraphQueryContext
  ): Promise<Map<string, Paginated<NeighborData>>> {
    const result = new Map<string, Paginated<NeighborData>>()
    if (nodeIds.length === 0) return result
    if (!opts.relation) {
      throw new Error('getNeighborsBatch: relation is required')
    }

    const sources = await this.resolveSourceNodes(nodeIds, ctx)
    if (sources.length === 0) {
      for (const id of nodeIds) {
        result.set(id, this.ctx.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0))
      }
      return result
    }

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const sample = sources[0]!
    const bindingKey = `${sample.type}:${opts.relation}:${direction}`
    const binding = this.bindings[bindingKey]

    if (!binding) {
      throw new Error(
        `getNeighborsBatch: unsupported relation "${opts.relation}" direction="${direction}" from type ${sample.type}`
      )
    }

    if (binding.kind === 'custom' && binding.batchHandler) {
      const batch = await binding.batchHandler(sources, opts, this.ctx)
      for (const id of nodeIds) {
        result.set(
          id,
          batch.get(id) ?? this.ctx.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
        )
      }
      for (const page of batch.values()) {
        this.cacheNeighborNodeData(ctx, page.items, opts.fields)
      }
      return result
    }

    if (binding.kind === 'search') {
      const batch = await this.executeSearchBindingBatch(binding, sources, opts)
      for (const id of nodeIds) {
        result.set(
          id,
          batch.get(id) ?? this.ctx.emptyNeighbors(opts.limit ?? DEFAULT_PAGE_LIMIT, opts.offset ?? 0)
        )
      }
      for (const page of batch.values()) {
        this.cacheNeighborNodeData(ctx, page.items, opts.fields)
      }
      return result
    }

    for (const id of nodeIds) {
      result.set(id, await this.getNeighbors(id, opts, ctx))
    }
    return result
  }

  protected cacheNeighborNodeData(
    ctx: GraphQueryContext | undefined,
    neighbors: NeighborData[],
    fields?: string[]
  ): void {
    const cache = ctx?.nodeDataCache
    if (!cache) return
    for (const neighbor of neighbors) {
      if (!neighbor.properties || cache.has(neighbor.nodeId)) continue
      cache.set(neighbor.nodeId, {
        id: neighbor.nodeId,
        type: neighbor.type,
        properties: neighbor.properties,
      })
    }
    if (fields?.length) return
  }

  protected async resolveSourceNodes(nodeIds: string[], ctx?: GraphQueryContext): Promise<NodeData[]> {
    const sources: NodeData[] = []
    const missingByType = new Map<string, string[]>()

    for (const id of nodeIds) {
      const cached = ctx?.nodeDataCache?.get(id)
      if (cached) {
        sources.push(cached)
        continue
      }
      const parsed = parseGlobalId(id)
      if (!parsed) continue
      const list = missingByType.get(parsed.type) ?? []
      list.push(parsed.rawId)
      missingByType.set(parsed.type, list)
    }

    const fetchedByGlobalId = new Map<string, NodeData>()
    for (const [type, rawIds] of missingByType) {
      const unique = [...new Set(rawIds)]
      for (let i = 0; i < unique.length; i += BATCH_IN_CHUNK) {
        const chunk = unique.slice(i, i + BATCH_IN_CHUNK)
        const nodes = await this.fetchManyImpl(type as RestEntityType, chunk)
        for (const node of nodes) {
          fetchedByGlobalId.set(node.id, node)
          ctx?.nodeDataCache?.set(node.id, node)
        }
      }
    }

    for (const id of nodeIds) {
      if (ctx?.nodeDataCache?.has(id)) {
        const node = ctx.nodeDataCache.get(id)!
        if (!sources.some((s) => s.id === id)) sources.push(node)
        continue
      }
      const node = fetchedByGlobalId.get(id)
      if (node) sources.push(node)
    }

    return sources
  }

  protected async fetchNodesByIds(
    nodeIds: Iterable<string>,
    ctx?: GraphQueryContext,
    fields?: string[]
  ): Promise<Map<string, NodeData>> {
    const result = new Map<string, NodeData>()
    const missingByType = new Map<string, string[]>()

    for (const id of nodeIds) {
      const cached = ctx?.nodeDataCache?.get(id)
      if (cached) {
        result.set(id, cached)
        continue
      }
      const parsed = parseGlobalId(id)
      if (!parsed) continue
      const list = missingByType.get(parsed.type) ?? []
      list.push(parsed.rawId)
      missingByType.set(parsed.type, list)
    }

    for (const [type, rawIds] of missingByType) {
      const unique = [...new Set(rawIds)]
      for (let i = 0; i < unique.length; i += BATCH_IN_CHUNK) {
        const chunk = unique.slice(i, i + BATCH_IN_CHUNK)
        const nodes = await this.fetchManyImpl(type as RestEntityType, chunk)
        for (const node of nodes) {
          const projected =
            fields && fields.length > 0
              ? { ...node, properties: projectFields(node.properties, fields) }
              : node
          result.set(node.id, projected)
          ctx?.nodeDataCache?.set(node.id, projected)
        }
      }
    }

    return result
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

  protected async executeSearchBindingBatch(
    binding: RestAccessBinding & { kind: 'search' },
    sources: NodeData[],
    opts: GetNeighborsOpts
  ): Promise<Map<string, Paginated<NeighborData>>> {
    const result = new Map<string, Paginated<NeighborData>>()
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT
    const offset = opts.offset ?? 0

    if (sources.length === 0) return result

    const sampleParams = binding.params(sources[0]!, this.ctx)
    const fkField = extractForeignKeyField(sampleParams)
    if (!fkField) {
      for (const source of sources) {
        result.set(source.id, await this.executeBinding(binding, source, opts))
      }
      return result
    }

    const rawIdToSourceId = new Map(sources.map((s) => [this.ctx.rawId(s), s.id]))
    const rawIds = [...rawIdToSourceId.keys()]
    const grouped = new Map<string, NodeData[]>()

    for (let i = 0; i < rawIds.length; i += BATCH_IN_CHUNK) {
      const chunk = rawIds.slice(i, i + BATCH_IN_CHUNK)
      const searchParams = {
        ...filtersToSearchParams(opts.where, opts.fields, 0, MAX_WORKING_SET),
        [`where.${fkField}.in`]: chunk.join(','),
      }
      const searchPrefix = this.ctx.typeRegistry[binding.searchOn]?.prefix
      const page = await apiSearchSafe<Record<string, unknown>>(searchPrefix, searchParams)
      const nodes = page.items.map((row) => this.rowToNodeData(binding.toType, row, opts.fields))

      for (const node of nodes) {
        const fk = String(node.properties[fkField] ?? '')
        const sourceId = rawIdToSourceId.get(fk)
        if (!sourceId) continue
        const list = grouped.get(sourceId) ?? []
        list.push(node)
        grouped.set(sourceId, list)
      }
    }

    for (const source of sources) {
      const nodes = grouped.get(source.id) ?? []
      result.set(
        source.id,
        neighborsFromNodes(nodes, binding.relation, binding.direction, opts)
      )
    }

    for (const source of sources) {
      if (!result.has(source.id)) {
        result.set(source.id, this.ctx.emptyNeighbors(limit, offset))
      }
    }

    return result
  }

  // ── GraphTraversalQuery Execution ──

  async query(
    query: GraphTraversalQuery,
    policy: PolicyContext = OPEN_POLICY,
    ctx?: GraphQueryContext
  ): Promise<ToolResult<GraphQueryResult>> {
    const workingSets = new Map<string, Set<string>>()
    const startAlias = query.match.alias ?? '_start'
    const returnFields = query.return.fields

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
      ctx?.nodeDataCache?.set(node.id, node)
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
      const neighborOpts: GetNeighborsOpts = {
        relation: step.relation,
        direction: step.direction ?? 'out',
        targetType: step.targetType,
        where: step.where,
        fields: returnFields,
        limit: MAX_WORKING_SET,
        offset: 0,
      }

      const neighborsMap = await this.getNeighborsBatch(Array.from(fromSet), neighborOpts, ctx)

      for (const fromId of fromSet) {
        const neighbors = neighborsMap.get(fromId)
        if (!neighbors) continue

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
    const nodeIds = Array.from(nodeSet)
    const nodeMap = await this.fetchNodesByIds(nodeIds, ctx, returnFields)

    for (const nodeId of nodeIds) {
      if (allRows.length >= MAX_WORKING_SET) {
        truncated = true
        break
      }
      const node = nodeMap.get(nodeId)
      if (!node) continue

      const props = redactProperties(node.properties, policy)
      const projected =
        returnFields && returnFields.length > 0 ? projectFields(props, returnFields) : props

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