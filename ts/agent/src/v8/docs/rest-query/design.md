# Rest Query Provider — 设计文档

> 本文档描述 V8 RestQueryProvider 的两阶段设计：
>
> - Phase 1：架构迁移（standalone）
> - Phase 2：Runtime Orchestrator 集成
>
> 核心目标：将 V6 的 `src/v6/provider/rest` 重构到 `src/v8/provider/rest-query`，
> 保持 REST API 查询能力，适配 V8 新架构。

---

## 1. 架构总览

### 1.1 Phase 1 架构（迁移）

```text
┌─────────────────────────────────────────────────────┐
│                   RestQueryProvider                  │
│              (Standalone GraphStore Impl)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐     ┌─────────────────────┐   │
│  │ RestGraphStore  │────▶│ RestAccessBinding   │   │
│  │ (Core Store)    │     │ (Relation Config)   │   │
│  └────────┬────────┘     └─────────────────────┘   │
│           │                                         │
│           │ fetch nodes                             │
│           ▼                                         │
│  ┌─────────────────┐     ┌─────────────────────┐   │
│  │  ApiSearchLayer │────▶│  HttpClient         │   │
│  │ (Search/Query)  │     │  (axios + token)    │   │
│  └─────────────────┘     └─────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 1.2 Phase 2 架构（Runtime 集成）

```text
                    User Intent
                          │
                          ▼
                ┌──────────────────┐
                │    LLM Agent     │
                │ (Semantic Reason)│
                └────────┬─────────┘
                         │
                         │ tool call
                         ▼
                ┌──────────────────┐
                │ Runtime          │
                │ Orchestrator     │
                │ (Router/Policy)  │
                └────────┬─────────┘
                         │
                         │ executeGraphQuery
                         ▼
                ┌──────────────────┐
                │ RestQueryProvider │──▶ RestAccessBinding
                │ (GraphStore Impl) │
                └────────┬─────────┘
                         │
                         │ REST API
                         ▼
                ┌──────────────────┐
                │   HttpClient     │
                │ (axios + token)  │
                └──────────────────┘
```

### 1.3 核心职责边界

```text
RestQueryProvider  → 将 REST API 数据映射为图结构
RestAccessBinding  → 定义关系查询策略（search/custom）
HttpClient         → 管理 REST 连接、认证、错误处理
Runtime (Phase 2)  → 执行策略、缓存、FactStore 注入
```

### 1.4 与 V6 的关键差异

| 维度           | V6                          | V8 Phase 1                | V8 Phase 2                |
| -------------- | --------------------------- | ------------------------- | ------------------------- |
| 目录位置       | `src/v6/provider/rest`      | `src/v8/provider/rest-query` | 同 Phase 1                |
| 命名空间       | `RestGraphStore`            | `RestQueryProvider`       | 同 Phase 1                |
| 工具直接访问   | GraphStore                  | GraphStore（standalone）  | Runtime Orchestrator      |
| Ontology 集成  | 无                          | 无（独立并行）            | 无（独立并行）            |
| HTTP 客户端    | 全局 axios                  | 同 V6                     | 同 V6                     |
| FactStore 注入 | 无                          | 无                        | Runtime 集中注入          |
| 缓存           | nodeCache（节点实例）        | 同 V6                     | Runtime 控制 cache/policy |

---

## 2. RestQueryProvider（核心类）

### 2.1 定位

RestQueryProvider 是 V8 的远程 REST API 图存储实现：

1. **GraphStore 接口实现** - 提供节点/邻居/边摘要查询
2. **关系绑定驱动** - 通过 RestAccessBinding 定义关系映射
3. **REST API 适配** - 将 REST 响应转换为 NodeData/NeighborData

### 2.2 接口定义

```typescript
interface RestQueryProvider extends GraphStore {
  // ── 继承 GraphStore 接口 ──
  getNode(id: string): Promise<NodeData | undefined>
  getBaseNode(id: string): Promise<BaseNode | undefined>
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // ── RestQueryProvider 特有 ──
  parseGlobalId(id: string): { type: RestEntityType; rawId: string }
}
```

### 2.3 核心实现骨架

```typescript
class RestQueryProvider implements GraphStore {
  protected readonly bindings: RestAccessBindingMap
  protected readonly ctx: AccessContext
  protected readonly nodeCache: Map<string, BaseNode> = new Map()

  constructor(
    bindings: RestAccessBindingMap,
    partialCtx?: Partial<AccessContext>,
    opts?: {
      idGenerator?: (type: RestEntityType, row: Record<string, unknown>) => string
    }
  ) {
    this.bindings = bindings
    this.ctx = this.buildAccessContext(partialCtx)
  }

  async getNode(id: string): Promise<NodeData | undefined> {
    const { type, rawId } = this.parseGlobalId(id)
    return this.ctx.fetchOne(type, rawId)
  }

  async getBaseNode(id: string): Promise<BaseNode | undefined> {
    // 检查缓存
    const cached = this.nodeCache.get(id)
    if (cached) return cached

    // 异步获取数据并创建 BaseNode 实例
    const data = await this.getNode(id)
    if (!data) return undefined

    const NodeClass = this.ctx.typeRegistry[type]?.class
    const node = new NodeClass(id)
    setNodeGraphStore(node, this)
    Object.assign(node, data.properties)

    this.nodeCache.set(id, node)
    return node
  }

  async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
    const source = await this.getNode(nodeId)
    if (!source) return this.ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0)

    const direction = opts.direction === 'in' ? 'in' : 'out'
    const key = `${source.type}:${opts.relation}:${direction}`
    const binding = this.bindings[key]

    if (!binding) {
      throw new Error(`Unsupported relation "${opts.relation}" from type ${source.type}`)
    }

    return this.executeBinding(binding, source, opts)
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
      const extraParams = binding.params(source, this.ctx)
      const searchParams = {
        ...filtersToSearchParams(opts.where, opts.fields, opts.offset ?? 0, opts.limit ?? 20),
        ...extraParams,
      }
      return this.executeSearchBinding(binding, searchParams, opts)
    }

    throw new Error(`Unsupported binding kind`)
  }
}
```

---

## 3. RestAccessBinding（关系绑定）

### 3.1 定位

RestAccessBinding 定义实体类型之间的关系映射策略：

- **search 绑定**：通过 REST API 搜索获取邻居
- **custom 绑定**：自定义处理器逻辑

### 3.2 类型定义

```typescript
type RestAccessBinding =
  | {
      kind: 'search'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      searchOn: RestEntityType
      params: (source: NodeData, ctx: AccessContext) => SearchParams
      optional?: boolean
    }
  | {
      kind: 'custom'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      handler: CustomHandler
    }

type RestAccessBindingMap = Record<string, RestAccessBinding>
```

### 3.3 绑定 Key 规则

```text
key = `${fromType}:${relation}:${direction}`

示例：
- 'Merch:for_agent:out' → 商户的代理商关系（出边）
- 'Agent:for_merch:in' → 代理商的商户关系（入边）
```

### 3.4 使用示例

```typescript
const bindings: RestAccessBindingMap = {
  // search 绑定：商户 → 代理商
  'Merch:for_agent:out': {
    kind: 'search',
    relation: 'for_agent',
    fromType: 'Merch',
    toType: 'Agent',
    direction: 'out',
    searchOn: 'Agent',
    params: (source, ctx) => ({
      'where.merch_no.eq': ctx.rawId(source),
    }),
  },

  // custom 绑定：自定义处理逻辑
  'Merch:order_daily:out': {
    kind: 'custom',
    relation: 'order_daily',
    fromType: 'Merch',
    toType: 'OrderDaily',
    direction: 'out',
    handler: async (source, opts, ctx) => {
      // 自定义查询逻辑
      const rawId = ctx.rawId(source)
      const results = await customQuery(rawId, opts)
      return neighborsFromNodes(results, 'order_daily', 'out', opts)
    },
  },
}
```

---

## 4. AccessContext（访问上下文）

### 4.1 定位

AccessContext 封装 REST API 访问所需的共享能力和辅助函数：

- 类型注册表
- API 搜索函数
- ID 编码/解码

### 4.2 接口定义

```typescript
interface AccessContext {
  // ── 类型注册 ──
  typeRegistry: RestNodeClassRegistry

  // ── ID 处理 ──
  rawId: (node: NodeData) => string
  toGlobalId: (type: RestEntityType, rawId: string | number) => string

  // ── API 搜索 ──
  apiSearch: <T>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>
  apiSearchSafe: <T>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>

  // ── 数据获取 ──
  fetchOne: (type: RestEntityType, rawId: string) => Promise<NodeData | undefined>
  fetchMany: (type: RestEntityType, rawIds: string[]) => Promise<NodeData[]>

  // ── 邻居构建 ──
  neighborsFromNodes: (
    nodes: NodeData[],
    relation: string,
    direction: 'out' | 'in',
    opts: GetNeighborsOpts,
    pageInfo?: Paginated<NodeData>['page']
  ) => Paginated<NeighborData>
  emptyNeighbors: (limit: number, offset: number) => Paginated<NeighborData>
}

interface RestNodeClassRegistry {
  [type: RestEntityType]: {
    class?: new (id: string) => BaseNode
    prefix: string  // API 前缀，如 '/merch'
  }
}
```

---

## 5. ApiSearchLayer（API 搜索层）

### 5.1 定位

ApiSearchLayer 提供 REST API 搜索的封装和错误处理：

- 统一的搜索参数转换
- 404/权限错误的优雅处理
- 分页数据的标准化

### 5.2 搜索参数映射

```typescript
// Graph 过滤器 → REST API 参数
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

// 转换函数
function filtersToSearchParams(
  filters: PropertyFilter[] | undefined,
  fields?: string[],
  offset?: number,
  limit?: number
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
```

### 5.3 错误处理策略

```typescript
// 不可用的 API 前缀缓存（避免重复 404）
const unavailablePrefixes = new Set<string>()

async function apiSearchSafe<T>(
  prefix: string,
  query?: SearchParams
): Promise<Paginated<T>> {
  // 前缀已标记为不可用，直接返回空结果
  if (unavailablePrefixes.has(prefix)) {
    return emptyPaginated(query?.pagesize ?? 20, (query?.page ?? 0) * (query?.pagesize ?? 20))
  }

  try {
    return await apiSearch<T>(prefix, query)
  } catch (err) {
    if (isNotFoundError(err)) {
      // 标记为不可用，后续请求直接返回空
      unavailablePrefixes.add(prefix)
      return emptyPaginated(query?.pagesize ?? 20, (query?.page ?? 0) * (query?.pagesize ?? 20))
    }
    throw err
  }
}
```

---

## 6. HttpClient（HTTP 客户层）

### 6.1 定位

HttpClient 管理 REST API 连接和认证：

- 全局 axios 配置
- Token 懒加载和自动刷新
- 请求/响应拦截器

### 6.2 配置说明

```typescript
// ── 全局配置 ──
const host = 'http://localhost:5099'
axios.defaults.baseURL = host

// ── Token 管理（懒加载 + 防并发）─
let token: string | null = null
let initPromise: Promise<string> | null = null

async function initToken(): Promise<string> {
  if (token) return token
  if (!initPromise) {
    initPromise = signin({ mobile: 'wk', password: '123123', clientid: '123456' })
      .then(res => { token = res.token; return token })
      .catch(err => { initPromise = null; throw err })
  }
  return initPromise
}

// ── 请求拦截器 ──
axios.interceptors.request.use(async (config) => {
  if (!token) await initToken()
  return { ...config, headers: { ...config.headers, authorization: 'Bearer ' + token } }
})

// ── 响应拦截器 ──
axios.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 错误处理：401/403 → 特定错误，其他 → 通用错误
    const code = error.response?.status
    if (code === 401) throw new Error('无权限')
    if (code === 403) throw new Error('禁止访问')
    throw new Error(error.response?.data?.message || '网络错误')
  }
)
```

---

## 7. 目录结构

```text
src/v8/provider/rest-query/
├── RestQueryProvider.ts     — 核心类（GraphStore 实现）
├── bindings.ts              — RestAccessBinding 类型定义
├── context.ts               — AccessContext 类型定义
├── api-search.ts            — API 搜索层封装
├── http-client.ts           — HTTP 客户层（axios + token）
├── helpers.ts               — 辅助函数（ID 编解码、过滤转换）
└── index.ts                 — 公共导出
```

---

## 8. Phase 1 实现优先级

| 优先级 | 模块                   | 说明                         |
| ------ | ---------------------- | ---------------------------- |
| P0     | RestQueryProvider      | 核心类迁移                   |
| P0     | bindings.ts            | 类型定义迁移                 |
| P0     | context.ts             | 类型定义迁移                 |
| P0     | api-search.ts          | API 搜索层迁移               |
| P0     | http-client.ts         | HTTP 客户层迁移（保持不变）  |
| P0     | helpers.ts             | 辅助函数迁移                 |
| P1     | 单元测试               | 复用 V6 测试                 |

---

## 9. Phase 2：Runtime Orchestrator 集成

### 9.1 调用链变化

```text
Phase 1: Tool → RestQueryProvider → REST API
Phase 2: Tool → Runtime Orchestrator → RestQueryProvider → REST API
```

### 9.2 Runtime 集成点

```typescript
class SemanticRuntimeOrchestrator {
  constructor(
    private graphStore: GraphStore,  // RestQueryProvider 作为实现
    private computeStore: ComputeStore,
    private vectorStore: VectorStore,
    private factStore: FactStore,
    private config: RuntimeConfig,
    private workspace: Workspace,
    private cache?: CacheStore,
  ) {}

  async executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>> {
    // 1. Policy validation
    // 2. Cache check
    // 3. Execute via graphStore (RestQueryProvider)
    // 4. Inject into FactStore
    // 5. Cache result
    const result = await this.graphStore.query(query)
    this.injectFacts(result)
    return toolOk(result)
  }
}
```

### 9.3 Phase 2 实现优先级

| 优先级 | 模块                   | 说明                         |
| ------ | ---------------------- | ---------------------------- |
| P0     | Runtime Orchestrator   | 集成 RestQueryProvider       |
| P0     | graph_query 工具       | 调用链适配                   |
| P1     | CacheStore             | Runtime 缓存管理             |
| P1     | FactStore 注入         | 自动注入查询结果             |

---

## 10. 关键设计决策

| 决策                              | 选择             | 原因                           |
| --------------------------------- | ---------------- | ------------------------------ |
| 架构定位                          | 两阶段设计       | 降低迁移风险，渐进适配         |
| Ontology 集成                     | 独立并行         | RestAccessBinding 保持稳定，Ontology 仅用于 Prompt |
| HTTP 客户端                       | 保持不变         | 降低迁移复杂度，token 管理稳定 |
| 命名空间                          | RestQueryProvider | 与 V8 其他命名风格一致         |

---

## 附录 A：完整类型定义

```typescript
// === RestEntityType ===
type RestEntityType = string

// === RestNodeClassRegistry ===
interface RestNodeClassRegistry {
  [type: RestEntityType]: {
    class?: new (id: string) => BaseNode
    prefix: string
  }
}

// === RestAccessBinding ===
type RestAccessBinding =
  | {
      kind: 'search'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      searchOn: RestEntityType
      params: (source: NodeData, ctx: AccessContext) => SearchParams
      optional?: boolean
    }
  | {
      kind: 'custom'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      handler: CustomHandler
    }

// === AccessContext ===
interface AccessContext {
  typeRegistry: RestNodeClassRegistry
  rawId: (node: NodeData) => string
  toGlobalId: (type: RestEntityType, rawId: string | number) => string
  apiSearch: <T>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>
  apiSearchSafe: <T>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>
  fetchOne: (type: RestEntityType, rawId: string) => Promise<NodeData | undefined>
  fetchMany: (type: RestEntityType, rawIds: string[]) => Promise<NodeData[]>
  neighborsFromNodes: (nodes: NodeData[], relation: string, direction: 'out' | 'in', opts: GetNeighborsOpts, pageInfo?: Paginated<NodeData>['page']) => Paginated<NeighborData>
  emptyNeighbors: (limit: number, offset: number) => Paginated<NeighborData>
}

// === SearchParams ===
interface SearchParams {
  page?: number
  pagesize?: number
  select?: string
  order?: string
} & Record<string, number | string>
```

---

## 附录 B：V6 文件映射表

| V6 文件                         | V8 文件                      | 变化说明               |
| ------------------------------- | ---------------------------- | ---------------------- |
| `src/v6/provider/rest/index.ts` | `src/v8/provider/rest-query/index.ts` | 重命名                 |
| `src/v6/provider/rest/RestGraphStore.ts` | `src/v8/provider/rest-query/RestQueryProvider.ts` | 类重命名               |
| `src/v6/provider/rest/types.ts` | `src/v8/provider/rest-query/bindings.ts` + `context.ts` | 拆分为两个文件         |
| `src/v6/provider/rest/api-search.ts` | `src/v8/provider/rest-query/api-search.ts` | 无变化                 |
| `src/v6/provider/rest/axios.ts` | `src/v8/provider/rest-query/http-client.ts` | 文件重命名             |
| `src/v6/provider/rest/helpers.ts` | `src/v8/provider/rest-query/helpers.ts` | 无变化                 |

---

## 下一步

→ `/ce:plan` 进行 Phase 1 实现规划