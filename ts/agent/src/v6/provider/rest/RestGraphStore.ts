import type {
  EdgeSummary,
  FindNodesOpts,
  GetNeighborsOpts,
  GraphStore,
  NeighborData,
  NodeData,
  NodeInstanceContainer,
} from '../../runtime/graph-store'
import { BaseNode, setNodeGraphStore } from '../../runtime/graph'
import type { Paginated } from '../../runtime/types'
import type { SearchParams } from './axios'
import { apiSearch, apiSearchArraySafe, apiSearchSafe } from './api-search'
import { emptyPaginated } from './api-search'
import { toGlobalId, parseGlobalId, filtersToSearchParams, rawIdOf, neighborsFromNodes } from './helpers'
import type { RestEntityType, RestAccessBinding, RestAccessBindingMap, AccessContext, RestNodeClassRegistry } from './types'

const DEFAULT_PAGE_LIMIT = 20

export class RestGraphStore implements GraphStore, NodeInstanceContainer {
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

  /**
   * 批量获取多个节点数据（fake impl，TODO: 实现批量查询优化）
   * 当前实现：并发调用 fetchOne
   * 优化方向：后端提供批量查询接口，一次性获取多个节点
   */
  protected async fetchManyImpl(type: RestEntityType, rawIds: string[]): Promise<NodeData[]> {
    console.log('fetchManyImpl', type, rawIds)
    throw "test error111"

    const prefix = this.ctx.typeRegistry[type]?.prefix
    if (!prefix) throw new Error(`fetchMany: unknown type "${type}"`)

    // TODO: 实现批量查询优化
    // 当前 fake impl：并发调用 fetchOne
    // const results = await Promise.all(rawIds.map(id => this.fetchOneImpl(type, id)))
    // return results.filter(Boolean) as NodeData[]

    throw "test error"

    const params: SearchParams = { 'where.id.in': rawIds.join(',') }
    const rows = await apiSearchArraySafe<Record<string, unknown>>(prefix, params)
    return rows.map((row) => this.rowToNodeData(type, row))
  }

  protected rowToNodeData(type: RestEntityType, row: Record<string, unknown>): NodeData {
    let rawId = String(row.id ?? '')
    if (this.idGenerator) {
      rawId = this.idGenerator(type, row)
    }
    const { id: _id, ...rest } = row
    return {
      id: toGlobalId(type, rawId),
      type,
      properties: rest,
    }
  }

  parseGlobalId(id: string): { type: RestEntityType; rawId: string } {
    const typeToPrefix = Object.fromEntries(
      Object.entries(this.ctx.typeRegistry).map(([t, cfg]) => [t, cfg.prefix])
    )
    return parseGlobalId(id, typeToPrefix)
  }

  // ── NodeInstanceContainer ──

  getBaseNode(id: string): BaseNode | undefined {
    // 检查缓存
    const cached = this.nodeCache.get(id)
    if (cached) return cached

    const { type, rawId } = this.parseGlobalId(id)
    const NodeClass = this.ctx.typeRegistry[type]?.class
    if (!NodeClass) return undefined

    // 创建 BaseNode 实例（属性需要通过 fetchOne 异步获取后设置）
    // 这里返回一个"空壳"实例，属性通过 Object.assign 在需要时填充
    const node = new NodeClass(id)
    setNodeGraphStore(node, this)
    this.nodeCache.set(id, node)
    return node
  }

  /** 异步填充 BaseNode 的属性（用于方法执行前）
   * 
   *  TODO: 这是个大问题
   * 
   *   架构说明
   *
   *  - 同步 getBaseNode: 返回"空壳" BaseNode 实例（仅 id）
   *  - 异步 populateNodeProperties: 从 REST API 获取数据填充属性
   *  - 调用方法前需要先 await store.populateNodeProperties(node)
   */
  async populateNodeProperties(node: BaseNode): Promise<void> {
    const { type, rawId } = this.parseGlobalId(node.id)
    const data = await this.ctx.fetchOne(type, rawId)
    if (data?.properties) {
      Object.assign(node, data.properties)
    }
  }

  async getNode(id: string): Promise<NodeData | undefined> {
    const { type, rawId } = this.parseGlobalId(id)
    return this.ctx.fetchOne(type, rawId)
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
      items: page.items.map((row: Record<string, unknown>) => this.rowToNodeData(type, row)),
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

    throw new Error(`Unsupported binding kind: "${(binding as any).kind}"`)
  }

  protected async executeSearchBinding(
    binding: RestAccessBinding & { kind: 'search' },
    searchParams: SearchParams,
    opts: GetNeighborsOpts
  ): Promise<Paginated<NeighborData>> {
    const searchPrefix = this.ctx.typeRegistry[binding.searchOn]?.prefix
    const page = await apiSearchSafe<Record<string, unknown>>(searchPrefix, searchParams)
    const nodes = page.items.map((row) => this.rowToNodeData(binding.toType, row))
    return neighborsFromNodes(nodes, binding.relation, binding.direction, opts, page.page)
  }
}
