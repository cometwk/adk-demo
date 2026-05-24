# Semantic Reasoning Runtime — 第一阶段设计文档

> 本文档描述 V8 第一阶段的核心架构：
>
> - Runtime Orchestrator（执行编排）
> - GraphStore（Traversal）
> - ComputeStore（OLAP）
> - VectorStore（Semantic Search）
> - Tools 接口
> - Agent 运行模型
>
> FactStore 保留 V6 设计，仅做简化适配。

---

## 1. 架构总览

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
                │ Runtime          │────────────────────┐
                │ Orchestrator     │                    │ inject facts
                │ (Router/Policy)  │                    │ (immutable snapshots)
                └────────┬─────────┘                    ▼
                         │                          ┌─────────────┐
              ┌──────────┼────────────┐             │  FactStore  │
              ▼          ▼            ▼             │ (Reason Mem)│
        graph_query  compute_query  vector_query    └─────────────┘
        (Traversal)     (OLAP)     (Semantic Search)
              │          │            │
              ▼          ▼            ▼
         GraphStore  ComputeStore   VectorStore
```

### 1.1 核心职责边界

```text
Agent for reasoning      → 决定"下一步想知道什么"
Runtime for orchestration → 决定"怎样最高效地得到答案"
Graph for narrowing      → 关系收缩 / 局部遍历
OLAP for aggregation     → 全局聚合 / 列式扫描
```

### 1.2 与 V6 的关键差异


| 维度     | V6                 | V8 Phase 1                    |
| ------ | ------------------ | ----------------------------- |
| 工具直接访问 | Store              | Runtime Orchestrator          |
| 聚合职责   | GraphStore         | ComputeStore                  |
| 执行策略   | 无                  | Runtime 控制 cache/policy/limit |
| 工具调用链  | LLM → Tool → Store | LLM → Tool → Runtime → Store  |
| 事实注入点  | 各个 Tool 自行注入 | Runtime Orchestrator 集中注入 |


---

## 2. Runtime Orchestrator

### 2.1 定位

Runtime Orchestrator 是 V8 新增的核心组件，负责：

1. **Backend Routing** - 将查询路由到正确的 Store
2. **Policy Enforcement** - 统一执行 traversal limit / timeout / cache
3. **Cache Management** - 缓存命中 / 失效策略
4. **FactStore Injection** - 自动将结果注入 FactStore
5. **Execution Monitoring** - 执行追踪 / 错误处理

### 2.2 接口定义

```typescript
interface RuntimeOrchestrator {
  // Graph Query 执行（Traversal Only）
  executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>>

  // Compute Query 执行（OLAP Aggregation）
  executeComputeQuery(query: ComputeQuery): Promise<ToolResult<ComputeQueryResult>>

  // Vector Query 执行（Semantic Search）
  executeVectorQuery(query: VectorQuery): Promise<ToolResult<VectorQueryResult>>

  // 单节点访问（保持 V6 兼容）
  inspectNode(nodeId: string, opts?: InspectOpts): Promise<ToolResult<NodeData>>

  // 邻居查询（保持 V6 兼容）
  queryNeighbors(nodeId: string, opts?: NeighborOpts): Promise<ToolResult<Paginated<NeighborData>>>

  // 节点搜索（保持 V6 兼容）
  searchNodes(opts: SearchOpts): Promise<ToolResult<Paginated<NodeData>>>
}
```

### 2.3 核心实现骨架

```typescript
class SemanticRuntimeOrchestrator implements RuntimeOrchestrator {
  constructor(
    private graphStore: GraphStore,
    private computeStore: ComputeStore,
    private vectorStore: VectorStore,
    private factStore: FactStore,
    private config: RuntimeConfig,
    private workspace: Workspace, // 持有 workspace 引用，用于不可变注入 facts
    private cache?: CacheStore,
  ) {}

  async executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>> {
    // 1. 实际执行前应在此处复用 V6 的安全校验与脱敏（checkTypeAccess, checkEntityAccess, redactProperties 等）

    // 2. Cache check
    if (this.cache) {
      const cached = await this.cache.get(query)
      if (cached) {
        // 缓存命中时同样触发 FactStore 注入，保持推理记忆一致性
        this.injectFacts(cached)
        return toolOk(cached)
      }
    }

    // 3. Policy validation (traversal depth, etc.)
    const validation = this.validateTraversalPolicy(query)
    if (!validation.ok) {
      return toolErr('POLICY_DENIED', validation.error || 'Policy validation failed')
    }

    // 4. Execute via GraphStore
    const result = await this.graphStore.query(query)

    // 5. Inject into FactStore (写入 workspace.bindings)
    this.injectFacts(result)

    // 6. Cache result
    if (this.cache) {
      await this.cache.set(query, result)
    }

    return toolOk(result)
  }

  async executeComputeQuery(query: ComputeQuery): Promise<ToolResult<ComputeQueryResult>> {
    // 1. 解析动态引用（选项 3：内存句柄动态引用代换）
    const resolvedQuery = this.resolveDynamicReferences(query)

    // 2. Execute via ComputeStore
    const result = await this.computeStore.aggregate(resolvedQuery)

    // 3. Inject into FactStore (写入 workspace.bindings)
    this.injectFacts(result)

    return toolOk(result)
  }

  private validateTraversalPolicy(query: GraphTraversalQuery): { ok: boolean; error?: string } {
    const depth = query.traverse?.length ?? 0
    const maxDepth = this.config.maxTraversalDepth ?? 5
    if (depth > maxDepth) {
      return { ok: false, error: `Traversal depth ${depth} exceeds limit ${maxDepth}` }
    }
    return { ok: true }
  }

  private resolveDynamicReferences(query: ComputeQuery): ComputeQuery {
    if (!query.filters) return query

    const resolvedFilters = query.filters.map(filter => {
      if (typeof filter.value === 'string' && filter.value.startsWith('$')) {
        const path = filter.value.substring(1) // 去掉 $ 符号，如 'workspace.candidates'
        const [entityId, property] = path.includes('.') ? path.split('.') : ['workspace', path]
        // 从只读的 factStore 获取已加载的事实绑定值
        const factValue = this.factStore.getValue(entityId, property)
        if (factValue) {
          return { ...filter, value: factValue }
        }
      }
      return filter
    })

    return { ...query, filters: resolvedFilters }
  }

  private injectFacts(result: GraphQueryResult | ComputeQueryResult): void {
    // 根据结果自动生成低阶快照事实绑定，推入工作区，维护不可变审计链路
    // 真正的高阶语义事实判定由 Agent 显式调用 bind_fact 执行（职责拆分）
    const bindings = this.extractBindingsFromQuery(result)
    this.workspace.bindings.push(...bindings)
  }

  private extractBindingsFromQuery(result: GraphQueryResult | ComputeQueryResult): FactBinding[] {
    // 实现具体结果转化为 FactBinding[] 快照绑定的逻辑
    return []
  }
}
```

### 2.4 配置参数

```typescript
interface RuntimeConfig {
  // Traversal 约束
  maxTraversalDepth: number      // 默认 5
  maxWorkingSet: number          // 默认 500
  
  // Timeout
  queryTimeoutMs: number         // 默认 30000
  
  // Cache
  cacheEnabled: boolean          // 默认 true
  cacheTTLSeconds: number        // 默认 300
  
  // Retry
  maxRetries: number             // 默认 2
  retryDelayMs: number           // 默认 100
}
```

---

## 3. GraphStore（Traversal Only）

### 3.1 定位变化

V6 的 GraphStore 承担了 traversal + aggregation，V8 只负责 **Traversal**：

```text
V6: GraphStore = Traversal + Aggregation
V8: GraphStore = Traversal Only
```

### 3.1.1 架构复用与迁移说明 (Migration Path)
为了避免“绿地（Greenfield）”过度开发带来的行为漂移与多套逻辑维护成本，V8 的 GraphStore 查询执行不从头编写，而是深度移植并重构 V6 已有的图查询引擎 `GraphQueryEngine`（位于 `src/v6/runtime/query-engine.ts`）以及相应的图属性求值过滤器（`src/v6/runtime/graph-filters.ts`）。

在第一阶段（Phase 1），我们将上述代码整体迁移、物理解离并重新编译注入到 `src/v8/engine` 下，保留其完整的 MATCH -> TRAVERSE -> RETURN 图过滤表达与全部核心测试覆盖。唯一的修改是在 `ReturnClause` 阶段剪除 `aggregate` 指标支持，将聚合计算全部转移给 ComputeStore 执行。

### 3.2 接口定义

```typescript
interface GraphStore {
  // ── 单节点访问 ──
  getNode(id: string): Promise<NodeData | undefined>
  getBaseNode(id: string): Promise<BaseNode | undefined>  // 方法调用用

  // ── 节点搜索 ──
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>

  // ── 邻居访问 ──
  getNeighbors(nodeId: string, opts?: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // ── Traversal Query ──
  query(query: GraphTraversalQuery): Promise<GraphQueryResult>
}
```

### 3.3 GraphTraversalQuery（精简版）

V8 的 GraphQuery 只保留 traversal，移除 aggregate：

```typescript
interface GraphTraversalQuery {
  match: {
    type: string
    where?: PropertyFilter[]
    alias?: string
  }
  
  traverse?: TraverseStep[]
  
  return: {
    alias?: string
    fields?: string[]
    limit?: number
    offset?: number
    // 注意：移除 aggregate
  }
}

interface TraverseStep {
  from?: string
  relation: string
  direction?: 'out' | 'in' | 'both'
  targetType?: string
  where?: PropertyFilter[]
  alias?: string
  require?: 'exists' | 'none'
}
```

### 3.4 查询结果

```typescript
type GraphQueryResult = {
  mode: 'nodes'
  rows: QueryRow[]
  total: number
  truncated: boolean
}

type QueryRow = {
  nodeId: string
  type: string
  properties: Record<string, unknown>
}
```

---

## 4. ComputeStore（OLAP）

### 4.1 定位

ComputeStore 负责 **列式聚合计算**：

```text
sum / avg / count / min / max
groupBy
orderBy
（window / timeseries / ranking 移至 Phase 2）
```

**不负责**：图遍历、关系展开。

### 4.2 接口定义

```typescript
interface ComputeStore {
  // ── 聚合查询 ──
  aggregate(query: ComputeQuery): Promise<ComputeQueryResult>

  // ── 数据源元信息 ──
  getSources(): Promise<ComputeSource[]>
  getSourceSchema(source: string): Promise<SourceSchema>
}

interface ComputeSource {
  name: string
  description?: string
  rowCount?: number
}

interface SourceSchema {
  fields: FieldSchema[]
}

interface FieldSchema {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean'
  aggregatable: boolean
}
```

### 4.3 ComputeQuery DSL

```typescript
interface ComputeQuery {
  // 数据源（如 OrderDaily, ProfitDaily）
  source: string

  // 过滤条件
  filters?: ComputeFilter[]

  // 聚合指标
  metrics: AggregateMetric[]

  // 分组
  groupBy?: string[]

  // 排序
  orderBy?: OrderSpec[]

  // 分页
  limit?: number
  offset?: number
}

interface ComputeFilter {
  field: string
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
  value: unknown | unknown[]
}

interface AggregateMetric {
  field: string           // "*" 表示 count
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max'
  as?: string             // 输出别名
}

interface OrderSpec {
  field: string
  direction: 'asc' | 'desc'
}
```

### 4.4 查询结果

```typescript
interface ComputeQueryResult {
  rows: ComputeRow[]
  total: number
  truncated: boolean
  executionTimeMs: number
}

interface ComputeRow {
  group?: Record<string, unknown>   // groupBy 的值
  [metricAlias: string]: unknown    // 聚合结果
}
```

### 4.5 实现示例

**场景：本月无交易商户**

```json
{
  "source": "OrderDaily",
  "filters": [
    { "field": "merch_no", "op": "in", "value": ["M001", "M002", "M003"] },
    { "field": "report_date", "op": "between", "value": ["2026-05-01", "2026-05-31"] }
  ],
  "metrics": [
    { "field": "*", "fn": "count", "as": "txn_cnt" },
    { "field": "total_amount", "fn": "sum", "as": "total_amt" }
  ],
  "groupBy": ["merch_no"],
  "orderBy": [{ "field": "txn_cnt", "direction": "asc" }],
  "limit": 100
}
```

### 4.5.1 数据源播种与扁平化转换 (Seeding & ETL)
在 V6 架构中，`OrderDaily` 被模拟建模为图形数据库中的常规子节点（如 `Merch → OrderDaily via for_merch`）。为了支撑 V8 内存版的 ComputeStore 纯一维列式聚合计算：
1. **现有测试夹具加载**：在 `InMemoryComputeStore` 初始化时，它会主动解析现有的 SQL 静态数据夹具（位于 `src/v6/tests/1-graph/restapi/ddl/` 的订单和收益 DDL 与插入脚本）加载基础数据。
2. **图扁平化适配器（ETL Adapter）**：在第一阶段内存运行态，Orchestrator 包含一个轻量的数据打平适配器，在测试场景下可以直接将 V6 图结构中的 `OrderDaily` 节点的图属性扁平化转换为规范的一维 Record Row 数据，并播种注入到 `InMemoryComputeStore` 中，以此保证一期开发能复用全部既有销售演示数据并实现完备的数据对齐。

---

## 5. VectorStore（Semantic Search）

### 5.1 定位

VectorStore 负责 **语义搜索**：

```text
相似实体搜索
知识检索
embedding-based query
```

### 5.2 接口定义

```typescript
interface VectorStore {
  // ── 语义搜索 ──
  search(query: VectorQuery): Promise<VectorQueryResult>

  // ── 索引管理 ──
  indexEntity(entity: VectorEntity): Promise<void>
  removeEntity(entityId: string): Promise<void>
}

interface VectorQuery {
  // 查询文本（会被 embedding）
  query: string

  // 过滤条件
  filters?: VectorFilter[]

  // 返回数量
  topK?: number

  // 最小相似度
  minScore?: number
}

interface VectorEntity {
  id: string
  type: string
  content: string    // 用于 embedding 的文本
  metadata?: Record<string, unknown>
}

interface VectorQueryResult {
  hits: VectorHit[]
  total: number
}

interface VectorHit {
  entityId: string
  entityType: string
  score: number
  content?: string
  metadata?: Record<string, unknown>
}
```

### 5.3 实现说明

Phase 1 可使用 **简化实现**：

- 内存版：简单文本匹配
- 外部版：pgvector / Milvus / Pinecone

**Phase 1 暂不强制要求 embedding**，但接口预留。

---

## 6. Tools 接口

### 6.1 工具列表


| 工具                | Routed Store  | 职责           |
| ----------------- | ------------ | ------------ |
| `inspect_node`    | GraphStore   | 单节点详情        |
| `search_nodes`    | GraphStore   | 类型搜索         |
| `query_neighbors` | GraphStore   | 1 跳邻居        |
| `graph_query`     | GraphStore   | 多跳 traversal |
| `compute_query`   | ComputeStore | OLAP 聚合      |
| `vector_query`    | VectorStore  | 语义搜索         |

*注：在 V8 架构中，所有工具并不直接操作 backend stores，其底层的 `execute` 回调函数一律被路由（Routed）并分发给 `RuntimeOrchestrator` 执行安全、缓存与并发管控（统一满足：LLM → Tool → Runtime → Store 调用链）。*


### 6.2 graph_query（V8）

与 V6 相比，**移除 aggregate**：

```typescript
const graph_query = tool({
  description:
    '声明式图遍历。用 JSON 表达多跳关系遍历 + 属性过滤。' +
    '适用场景：①需要 2+ 跳关系遍历；②批量属性过滤；③存在性断言。' +
    '聚合统计请使用 compute_query。',
  inputSchema: GraphTraversalQuerySchema,
  execute: async (query) => {
    return runtime.executeGraphQuery(query)
  }
})
```

### 6.3 compute_query（新增）

```typescript
const compute_query = tool({
  description:
    '列式聚合查询。用于大规模数据分析：sum/avg/count、groupBy、排序。' +
    '数据源如 OrderDaily、ProfitDaily。' +
    '不负责图遍历，请先用 graph_query 收缩候选集合。',
  inputSchema: ComputeQuerySchema,
  execute: async (query) => {
    return runtime.executeComputeQuery(query)
  }
})
```

### 6.4 vector_query（新增）

```typescript
const vector_query = tool({
  description:
    '语义相似性搜索。基于文本含义而非精确匹配。' +
    '适用场景：①模糊知识检索；②相似实体发现。',
  inputSchema: VectorQuerySchema,
  execute: async (query) => {
    return runtime.executeVectorQuery(query)
  }
})
```

### 6.5 Tool Schema 定义

```typescript
// GraphTraversalQuery Schema
const GraphTraversalQuerySchema = z.object({
  match: MatchClauseSchema,
  traverse: z.array(TraverseStepSchema).optional(),
  return: ReturnClauseSchema.omit({ aggregate: true }),  // 移除 aggregate
})

// ComputeQuery Schema
const ComputeQuerySchema = z.object({
  source: z.string().describe('数据源名称（如 OrderDaily）'),
  filters: z.array(ComputeFilterSchema).optional(),
  metrics: z.array(AggregateMetricSchema).describe('聚合指标'),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(OrderSpecSchema).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

// VectorQuery Schema
const VectorQuerySchema = z.object({
  query: z.string().describe('语义查询文本'),
  filters: z.array(VectorFilterSchema).optional(),
  topK: z.number().optional().default(10),
  minScore: z.number().optional().default(0.5),
})
```

---

## 7. Agent 运行模型

### 7.1 整体流程

```typescript
async function runSemanticReasoningAgent(
  task: ReasoningTask,
  runtime: RuntimeOrchestrator,
  ontology: Ontology,
  factStore: FactStore,
  workspace: Workspace,
  model: any,
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(ontology)
  const userMessage = task.goal

  const tools = {
    inspect_node: createInspectNodeTool(runtime),
    search_nodes: createSearchNodesTool(runtime),
    query_neighbors: createQueryNeighborsTool(runtime),
    graph_query: createGraphQueryTool(runtime),
    compute_query: createComputeQueryTool(runtime),
    vector_query: createVectorQueryTool(runtime),
    
    // FactStore 工具（保留 V6）
    bind_fact: createBindFactTool(factStore),
    lookup_fact: createLookupFactTool(factStore),
    
    // 候选/证据工具（保留 V6）
    propose_candidates: createProposeCandidatesTool(workspace),
    record_evidence: createRecordEvidenceTool(workspace),
    declare_uncertainty: createDeclareUncertaintyTool(workspace),
  }

  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  return {
    facts: factStore.snapshot(),
    workspace,
    verdict: parseVerdict(result.text),
    rawText: result.text,
  }
}
```

### 7.2 System Prompt 核心规则

```text
# 操作规则

## 查询分工与两阶段软校验（Soft Constraint）
1. graph_query 用于关系收缩 / 多跳遍历。
2. compute_query 用于聚合统计 / 列式分析。
3. 严禁使用 graph_query 执行大范围全局聚合运算（聚合统计应交给 compute_query 执行）。
4. 必须先用 graph_query 缩小候选集合，再用 compute_query 在候选集上做聚合。虽然平台一期采用软性约束（选项 A 放任全表扫描），但 Agent 应自觉保持防线，在 compute_query 过滤条件中主动附加 narrowing 产生的候选集，避免发起 unscoped 全表扫描。

## 事实收集与读写隔离（职责拆分）
5. **Runtime 自动记录快照事实**：Orchestrator 在执行查询后会自动抓取中间数据流（如商户候选集合），作为底层的只读快照（如 `workspace.candidates`）记录到运行上下文中。
6. **Agent 显式绑定语义断言**：在分析完图过滤和列聚合数据后，Agent 必须通过调用 `bind_fact` 显式写入高阶语义断言事实（例如：“商户 Merch:M003 本月无交易且入驻不足30天，判定其符合退机考核条件”），用以生成最终证据。严禁 Agent 将原始的低阶物理查询记录重复手动绑定，践行“Runtime 录原始快照，Agent 存推理断言”的权能分工。
7. 允许在 compute_query 过滤条件中使用内存句柄动态引用（如 `"value": "$workspace.candidates"`），直接引用 Runtime 自动搜集并注入的候选集合，以减少大基数 ID 列表在两阶段工具之间的传输。
```

### 7.3 典型执行路径示例与实体主键桥接 (Entity Key Bridge)

在实际推理中，`graph_query` 返回的候选集是全局编码后的节点全局 ID（Global ID，如 `Merch:M001`, `Merch:M002`），而底层 OLAP 列式数据库（ComputeStore）中存储和计算的维度键为原始的业务裸 ID（Raw ID，如 `M001`, `M002`）。

参考 `RestGraphStore.ts` 中 `rowToNodeData` 处理 `toGlobalId(type, rawId)` 的主键全局化编码规则，在 Phase 1，Agent 可以直接读取 properties 属性中的 `merch_no` 裸键进行大列表搬运，也可以直接利用 Orchestrator 提供的动态引用句柄隐式代换（通过内置的 `parseGlobalId(id).rawId` 规则无感还原）。

**用户问题：哪些代理商进件的商户，本月没有交易？**

```text
Step 1: Agent 调用 graph_query 过滤并遍历出目标商户节点
  → 找出目标代理商绑定的商户
  → 得到图查询结果：
    [
      { "nodeId": "Merch:M001", "type": "Merch", "properties": { "merch_no": "M001" } },
      { "nodeId": "Merch:M002", "type": "Merch", "properties": { "merch_no": "M002" } },
      { "nodeId": "Merch:M003", "type": "Merch", "properties": { "merch_no": "M003" } }
    ]
  → 此时 Runtime 自动将候选节点全局 ID [Merch:M001, Merch:M002, Merch:M003] 作为原始快照写入 `workspace.candidates` 中。

Step 2: Agent 调用 compute_query 进行列式聚合（支持两种传递模式）

  【模式 A：大基数 ID 列表显式搬运（首期物理兼容支持）】
  → Agent 自行解析并过滤，提取属性 properties 中的业务裸键 [M001, M002, M003]
  → 发起 compute_query，显式搬运裸 ID 数组：
    {
      "source": "OrderDaily",
      "filters": [
        { "field": "merch_no", "op": "in", "value": ["M001", "M002", "M003"] }
      ],
      "metrics": [{ "field": "*", "fn": "count", "as": "txn_cnt" }],
      "groupBy": ["merch_no"]
    }

  【模式 B：内存句柄动态引用（选项 3：极简内存引用，最推荐）】
  → Agent 免去 ID 搬运，直接指定引用句柄：
    {
      "source": "OrderDaily",
      "filters": [
        { "field": "merch_no", "op": "in", "value": "$workspace.candidates" }
      ],
      "metrics": [{ "field": "*", "fn": "count", "as": "txn_cnt" }],
      "groupBy": ["merch_no"]
    }
  → Orchestrator 在底层自动执行 parseGlobalId 解码并注入候选：
    - 读取 "workspace.candidates" → [Merch:M001, Merch:M002, Merch:M003]
    - 对每个 globalId 执行 `parseGlobalId(id).rawId` 得到 [M001, M002, M003]
    - 隐式代换为裸键数组后下发给 InMemoryComputeStore，高效完成单轮过滤。

Step 3: Agent 观察 compute_query 聚合结果
  → 发现 M003 的 txn_cnt 为 0

Step 4: Agent 调用 bind_fact 绑定高阶语义推理事实
  → bind_fact({ entityId: "Merch:M003", property: "status", value: "no_transaction_this_month" })

Step 5: Agent 输出最终诊断结论 (verdict)
```

---

## 8. FactStore（简化版）

### 8.1 定位

FactStore 作为 **推理态记忆**：

```text
中间事实
候选集合
证据
不确定性
```

### 8.2 接口（保持 V6 只读物理设计）

```typescript
class FactStore {
  // FactStore 仅作为推理周期的不可变、只读快照提供给 Agent 消费
  get(entityId: string, property: string): FactBinding | undefined
  getValue(entityId: string, property: string): unknown
  forEntity(entityId: string): FactBinding[]
  all(): FactBinding[]
  has(entityId: string, property: string): boolean
  snapshot(): FactBinding[]
}
```

### 8.3 Runtime 自动注入与不可变状态修改 (Immutable Snapshot Flow)

为了与 V6 高度稳健、且具备历史可追溯与多时间节点还原的只读快照机制（Immutable Snapshot）保持完美对齐，第一阶段不允许在 `FactStore` 实例上直接调用可变（mutable）修改。

任何低阶查询事实的自动注入，必须通过 Orchestrator 向 mutable 的 `workspace.bindings` 数组追加 `FactBinding` 完成。在 Agent 的单次推理循环（Run Loop Step）结束后，系统会根据最新 `workspace.bindings` 重建全新的不可变 `FactStore` 只读实例传给下一次推理。

```typescript
class SemanticRuntimeOrchestrator {
  constructor(
    private graphStore: GraphStore,
    private computeStore: ComputeStore,
    private vectorStore: VectorStore,
    private factStore: FactStore,
    private config: RuntimeConfig,
    private workspace: Workspace, // 持有工作区物理引用，向 bindings 数组追加写入
    private cache?: CacheStore,
  ) {}

  private injectFacts(result: GraphQueryResult | ComputeQueryResult): void {
    const bindings = this.extractBindingsFromQuery(result)
    // 自动追加到不可变溯源数组中，保证历史可重放和回溯
    this.workspace.bindings.push(...bindings)
  }

  private extractBindingsFromQuery(result: GraphQueryResult | ComputeQueryResult): FactBinding[] {
    // 内存适配，根据查询出的节点或行记录生成标准低阶 FactBinding
    return []
  }
}
```
```

---

## 9. 目录结构

```text
src/v8/engine/
├── runtime/
│   ├── orchestrator.ts        — RuntimeOrchestrator 核心
│   ├── config.ts              — RuntimeConfig
│   └── types.ts               — 公共类型定义
│
├── stores/
│   ├── graph-store.ts         — GraphStore 接口
│   ├── compute-store.ts       — ComputeStore 接口
│   ├── vector-store.ts        — VectorStore 接口
│   └── fact-store.ts          — FactStore（简化版）
│
├── query/
│   ├── graph-query.ts         — GraphTraversalQuery DSL
│   ├── compute-query.ts       — ComputeQuery DSL
│   ├── vector-query.ts        — VectorQuery DSL
│   └── filters.ts             — PropertyFilter 求值
│
├── tools/
│   ├── graph-tools.ts         — inspect_node / search_nodes / query_neighbors / graph_query
│   ├── compute-tools.ts       — compute_query
│   ├── vector-tools.ts        — vector_query
│   └── fact-tools.ts          — bind_fact / lookup_fact
│
├── agent/
│   ├── executor.ts            — runSemanticReasoningAgent
│   ├── prompt.ts              — System Prompt 构建器
│   └── verdict.ts             — 结果解析
│
└── impl/
    ├── in-memory-graph.ts     — InMemoryGraphStore
    ├── in-memory-compute.ts   — InMemoryComputeStore
    └── in-memory-vector.ts    — InMemoryVectorStore
```

*注：为了最大程度降低 V6 和 V8 分支之间核心数据结构的维护复杂度，在 `./query` 的物理实现中应深度复用并重构 V6 现有的 `src/v6/runtime/query-types.ts` 和 `graph-filters.ts`，仅对其 Zod 结构及求值进行剪裁或派生扩展，绝对避免完全绿地（Greenfield）式的重复造轮子。*

---

## 10. Phase 1 实现优先级


| 优先级 | 模块                  | 说明                     |
| --- | ------------------- | ---------------------- |
| P0  | RuntimeOrchestrator | 核心新增，必须先完成             |
| P0  | GraphStore 接口       | 保持 V6 兼容，移除 aggregate  |
| P0  | graph_query 工具      | 修改 Schema，移除 aggregate |
| P0  | ComputeStore 接口     | 新增，Phase 1 用内存实现       |
| P0  | compute_query 工具    | 新增                     |
| P0  | Agent Executor      | 适配新 tools，首期作为 P0 端到端验收核心 |
| P1  | FactStore 简化        | 保持 V6 不可变设计，增加自动注入         |
| P2  | VectorStore 接口      | 接口定义，内存 stub 实现        |
| P2  | vector_query 工具     | Phase 1 可选             |
| 移出  | CacheStore          | 移出一期，推迟至 Phase 2 |


---

## 11. 与传统系统的对比


| 维度     | 传统 Graph DB | V8 Semantic Runtime |
| ------ | ----------- | ------------------- |
| 查询模型   | Cypher 静态查询 | Agent 动态推理          |
| 聚合方式   | Graph 内聚合   | Compute Store 专用    |
| 执行策略   | Planner 决定  | Runtime + Agent 协作  |
| 推理记忆   | 无           | FactStore           |
| Replan | 不支持         | Agent 自然形成          |


---

## 12. 下一步：Phase 2

Phase 2 将实现具体 Store：

- **GraphStore**: Neo4j / SQL 实现
- **ComputeStore**: ClickHouse / DuckDB 实现
- **VectorStore**: pgvector / Milvus 实现
- **Semantic Tools**: find_related_entities / aggregate_metrics

---

## 附录 A：完整类型定义

```typescript
// === Runtime ===
interface RuntimeOrchestrator {
  executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>>
  executeComputeQuery(query: ComputeQuery): Promise<ToolResult<ComputeQueryResult>>
  executeVectorQuery(query: VectorQuery): Promise<ToolResult<VectorQueryResult>>
  inspectNode(nodeId: string, opts?: InspectOpts): Promise<ToolResult<NodeData>>
  queryNeighbors(nodeId: string, opts?: NeighborOpts): Promise<ToolResult<Paginated<NeighborData>>>
  searchNodes(opts: SearchOpts): Promise<ToolResult<Paginated<NodeData>>>
}

// === GraphStore ===
interface GraphStore {
  getNode(id: string): Promise<NodeData | undefined>
  getBaseNode(id: string): Promise<BaseNode | undefined>
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
  getNeighbors(nodeId: string, opts?: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>
  query(query: GraphTraversalQuery): Promise<GraphQueryResult>
}

// === ComputeStore ===
interface ComputeStore {
  aggregate(query: ComputeQuery): Promise<ComputeQueryResult>
  getSources(): Promise<ComputeSource[]>
  getSourceSchema(source: string): Promise<SourceSchema>
}

// === VectorStore ===
interface VectorStore {
  search(query: VectorQuery): Promise<VectorQueryResult>
  indexEntity(entity: VectorEntity): Promise<void>
  removeEntity(entityId: string): Promise<void>
}

// === Query DSLs ===
interface GraphTraversalQuery {
  match: { type: string; where?: PropertyFilter[]; alias?: string }
  traverse?: TraverseStep[]
  return: { alias?: string; fields?: string[]; limit?: number; offset?: number }
}

interface ComputeQuery {
  source: string
  filters?: ComputeFilter[]
  metrics: AggregateMetric[]
  groupBy?: string[]
  orderBy?: OrderSpec[]
  limit?: number
  offset?: number
}

interface VectorQuery {
  query: string
  filters?: VectorFilter[]
  topK?: number
  minScore?: number
}
```

## 附录 B：Zod Schema 定义

```typescript
// === PropertyFilter ===
const CompareOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'])

const PropertyFilterSchema = z.object({
  property: z.string(),
  op: CompareOpSchema,
  value: z.unknown(),
})

// === GraphTraversalQuery ===
const MatchClauseSchema = z.object({
  type: z.string(),
  where: z.array(PropertyFilterSchema).optional(),
  alias: z.string().optional(),
})

const TraverseStepSchema = z.object({
  from: z.string().optional(),
  relation: z.string(),
  direction: z.enum(['out', 'in', 'both']).optional(),
  targetType: z.string().optional(),
  where: z.array(PropertyFilterSchema).optional(),
  alias: z.string().optional(),
  require: z.enum(['exists', 'none']).optional(),
})

const ReturnClauseSchema = z.object({
  alias: z.string().optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

const GraphTraversalQuerySchema = z.object({
  match: MatchClauseSchema,
  traverse: z.array(TraverseStepSchema).optional(),
  return: ReturnClauseSchema,
})

// === ComputeQuery ===
const ComputeFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between']),
  value: z.union([z.unknown(), z.array(z.unknown())]),
})

const AggregateMetricSchema = z.object({
  field: z.string(),
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max']),
  as: z.string().optional(),
})

const OrderSpecSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
})

const ComputeQuerySchema = z.object({
  source: z.string(),
  filters: z.array(ComputeFilterSchema).optional(),
  metrics: z.array(AggregateMetricSchema),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(OrderSpecSchema).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})

// === VectorQuery ===
const VectorFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'in']),
  value: z.union([z.unknown(), z.array(z.unknown())]),
})

const VectorQuerySchema = z.object({
  query: z.string(),
  filters: z.array(VectorFilterSchema).optional(),
  topK: z.number().optional().default(10),
  minScore: z.number().optional().default(0.5),
})
```

