# Graph 模块设计文档

## 1. 定位与问题背景

Graph 模块是 V6 决策助手的**知识基础设施层**。它负责定义本体（Ontology）、存储实体与关系、提供渐进式图探索能力，是 Agent 执行推理时获取事实的唯一通道。

### 为什么需要一个独立的 Graph 层？

V5 的图访问存在三个结构性问题：

1. **本体定义散落在 seed 代码中**：类型、关系、属性的声明与实例化混在一起，无法独立测试、无法被 Agent 工具在运行时查询。
2. **全量注入 prompt**：9 个节点、3 类型、4 关系可以塞进 System Prompt，但真实业务 10⁶~10⁹ 实体时不可能全量注入——必须渐进披露。
3. **没有权限层**：所有用户看到同一张图，无法按角色裁剪可见子图、无法对敏感属性做脱敏。

V6 通过三个机制解决这三个问题：
- **装饰器驱动的本体注册**：`@agentType` / `@agentProperty` / `@agentMethod` / `@agentRelation` 四个装饰器让业务类自身即本体定义，`buildOntology` 从注册表自动提取。
- **渐进式披露（Progressive Disclosure）**：System Prompt 仅提供入口实体和 Schema，Agent 通过 `inspect_node` / `query_neighbors` / `search_nodes` 按需探索图。
- **策略层装饰器**：所有图工具在返回数据前经过 `PolicyContext` 过滤，实现实体级/类型级/属性级访问控制。

---

## 2. 设计原则

| 原则 | 做法 |
|------|------|
| **本体即代码** | T/R 的声明写在业务类的装饰器上，而非独立 JSON 或手动 seed；`buildOntology` 自动收集 |
| **渐进披露** | prompt 只注入 schema（类型 + 关系模式），不注入具体实体；Agent 按需探索 |
| **Store 单源关系** | 邻居与边只经 `GraphStore` 查询；`@agentRelation` 仅声明 Schema（见 [1-graph-layers.md](./1-graph-layers.md)） |
| **策略前置** | 工具层在返回结果前执行 `PolicyContext` 过滤，Agent 只能看到被授权的子图 |
| **分页防爆** | 所有返回列表的操作都有 `limit + offset` 分页，默认 20 条，防止大图把 context 撑满 |
| **边类型校验** | `Graph` 构造时可注入 `RelationSchema`，`addEdge` 自动检查边类型 + 端点类型是否合法 |

---

## 3. 模块文件结构

```
src/v6/runtime/
├── types.ts             — 基础类型：NodeId, Edge, ToolResult, PageInfo, FactBinding
├── decorator.ts         — 装饰器接口：@agentType, @agentProperty, @agentMethod, @agentRelation
├── registry.ts          — 装饰器实现：四大 Registry + AgentRegistry Facade
├── ontology-builder.ts  — buildOntology: 从 Registry 提取 Ontology = types + relations
├── graph.ts             — Graph 类：节点/边存储、邻居查询、节点搜索
├── eventStore.ts        — FactStore + EventStore（事实绑定与事件时间线）
└── trace.ts             — DecisionTrace（决策轨迹持久化）

src/v6/ontology/
└── schema.ts            — Ontology 类型定义：TypeSchema, RelationSchema, Ontology

src/v6/policy/
├── context.ts           — PolicyContext 类型定义 + 默认策略
└── filters.ts           — 工具层策略装饰器（withPolicy, checkEntityAccess, redactProperties）

src/v6/agent/tools/
├── graph.ts             — Agent 图工具（inspect_node, query_neighbors, search_nodes）
└── facts.ts             — Agent 事实工具（bind_fact, lookup_fact, aggregate_facts）
```

---

## 4. 核心类型

### 4.1 `Ontology` — 本体定义

```typescript
type Ontology = {
  version: string          // semver，用于追踪校准
  types: TypeSchema[]      // 类型定义集合
  relations: RelationSchema[]  // 关系定义集合
}
```

本体是系统的**静态知识骨架**，定义了"世界里有哪些类型的实体、它们之间有哪些关系"。Agent 在推理开始时通过 `inspect_schema` 获取本体，以此为蓝图规划探索路径。

### 4.2 `TypeSchema` — 类型模式

```typescript
type TypeSchema = {
  name: string                // 类型名，如 'Reader', 'Book'
  description: string         // 语义描述
  properties: TypeProperty[]  // 属性列表
  methods: TypeMethod[]       // 方法列表
}

type TypeProperty = {
  name: string
  type: string                // 'number' | 'string' | 'boolean' | ...
  description: string
  agentVisible: boolean       // Agent 是否可直接搜索到此属性
  sensitive?: boolean         // 敏感标记，Policy 层据此脱敏
}

type TypeMethod = {
  name: string
  description: string
}
```

`TypeSchema` 来自 `@agentType` + `@agentProperty` + `@agentMethod` 三个装饰器的自动收集，业务开发者不需要手动维护。

### 4.3 `RelationSchema` — 关系模式

```typescript
type RelationSchema = {
  type: string       // 边类型名，如 'borrows', 'managed_by'
  fromType: string   // 源类型名（NOT 节点 ID）
  toType: string     // 目标类型名
  description: string
}
```

`RelationSchema` 描述**类型之间的结构性关系**，与 `CausalGraph` 中的因果关系严格分离。关系模式通过 `@agentRelation` 装饰器自动收集，也支持 `buildOntology` 时手动补充。

### 4.4 `BaseNode` — 图节点基类

```typescript
abstract class BaseNode {
  id: NodeId

  getCapabilities(): MethodSchema[]           // 获取该节点注册的所有方法
  getProperties(): Record<string, unknown>    // 获取该节点的所有属性值
  getRelationSchemas(): RelationRegistryEntry[]  // 获取该节点注册的所有关系
  resolveRelation(type: string): NodeId[]     // 按关系类型动态解析目标节点
  resolveAllRelations(): Record<string, NodeId[]>  // 解析所有关系
}
```

业务实体类继承 `BaseNode`，通过装饰器注册本体信息。节点同时承担**数据载体**和**本体定义源**两个角色。

### 4.5 `Edge` — 图边

```typescript
type Edge = {
  from: NodeId
  to: NodeId
  type: string  // 必须匹配某个 RelationSchema.type
}
```

边是无属性的有向连接。当 `Graph` 构造时传入了 `RelationSchema`，`addEdge` 会做类型合法性校验。

### 4.6 `Graph` — 图容器

```typescript
class Graph {
  nodes: Map<string, BaseNode>
  edges: Edge[]

  addNode(node: BaseNode): void
  addEdge(edge: Edge): void                   // 可选类型校验
  getNode(id: string): BaseNode | undefined
  getOutEdges(nodeId: string): Record<string, string[]>
  getInEdges(nodeId: string): Record<string, string[]>
  queryNeighbors(nodeId: string, opts?): Paginated<NeighborEntry>
  searchNodes(opts?): Paginated<SearchNodeResult>
  deriveRelationSchemas(): RelationSchema[]   // 从已有边推断 RelationSchema
}
```

`Graph` 是纯数据容器，不涉及任何业务逻辑。所有业务规则通过 Rule 模块执行。

---

## 5. 装饰器注册机制

### 5.1 四大装饰器

| 装饰器 | 目标 | 注册位置 | 作用 |
|--------|------|----------|------|
| `@agentType` | 类 | `AgentTypeRegistry` | 声明实体类型名 + 描述 |
| `@agentProperty` | 属性 | `AgentPropertyRegistry` | 声明属性的类型、描述、可见性、敏感性 |
| `@agentMethod` | 方法 | `AgentMethodRegistry` | 声明方法签名、前置条件、关联规则、所需事实 |
| `@agentRelation` | 方法 | `AgentRelationRegistry` | 声明关系类型、目标类型，方法返回目标节点 ID 列表 |

四者协同工作：类装饰器提供类型级元数据，属性/方法装饰器提供成员级元数据，关系装饰器同时定义边的 Schema 和动态解析逻辑。

### 5.2 `AgentRegistry` Facade

```typescript
const AgentRegistry = {
  getTypeSchema(className: string): TypeSchema | undefined
  getRegisteredClasses(): string[]
  getRelationSchemas(): RelationSchema[]
  clear(): void
}
```

`AgentRegistry` 是四大 Registry 的统一入口，组合 Type + Property + Method + Relation 生成完整的 `TypeSchema`。`buildOntology` 只调用这个 Facade。

### 5.3 `buildOntology` — 本体构建

```typescript
function buildOntology(opts: { version: string; relations?: RelationSchema[] }): Ontology
```

执行流程：
1. 从 `AgentRegistry.getRelationSchemas()` 自动收集装饰器声明的关系
2. 与 `opts.relations` 手动补充的关系合并（按 `fromType:type:toType` 去重）
3. 从 `AgentRegistry.getRegisteredClasses()` 取所有类型名
4. 对每个类型调用 `AgentRegistry.getTypeSchema()` 组装完整 TypeSchema
5. 返回 `Ontology { version, types, relations }`

**设计动机**：业务代码只需 `import './entities'` 触发装饰器注册，然后 `buildOntology({ version: '1.0.0' })` 即可得到完整本体，零手动维护。

---

## 6. 图数据管理

### 6.1 节点与边的存储

`Graph` 使用 `Map<string, BaseNode>` 存储节点、`Edge[]` 数组存储边。这是内存实现，适合 demo 和中等规模场景。

### 6.2 边类型校验

当 `Graph` 构造时传入 `relations` 参数：

```typescript
const g = new Graph({ relations: ontology.relations })
```

`addEdge` 会执行三重校验：
1. 边类型必须在声明的 RelationSchema 中存在
2. 源节点的类型必须匹配 `schema.fromType`
3. 目标节点的类型必须匹配 `schema.toType`

任何一条不满足会抛出错误。这将 schema 级别的约束提前到数据写入时刻，而不是查询时才发现。

### 6.3 关系查询：Store 单源（双源已废弃）

> **⚠️ 历史**：本节曾描述「双源合并」（`Graph.edges` + `@agentRelation` resolver）。自 GraphStore 抽象落地后已**废弃**。终态设计见 **[1-graph-layers.md](./1-graph-layers.md)**。

当前实现：

1. **边事实**：仅存在于 `GraphStore`（`InMemoryGraphStore.edges` 或未来的 `SqlGraphStore`）。
2. **关系 Schema**：由 `@agentRelation`（或拟议的 `@agentRelations`）注册到 `AgentRelationRegistry`，供 `buildOntology` 与 `addEdge` 校验。
3. **邻居查询**：`getNeighbors` / `graph_query` TRAVERSE 只读 Store，**不**调用 `BaseNode.resolveRelation`。
4. **生产映射**：关系类型 → 物理表/FK 通过 `RelationBinding` 配置，由 `SqlGraphStore` 生成 SQL（见 1-graph-layers.md §5）。

### 6.4 分页机制

所有返回列表的查询（`queryNeighbors` / `searchNodes`）统一使用分页：

```typescript
type PageInfo = {
  offset: number
  limit: number
  hasMore: boolean
  total?: number    // 仅当总数 ≤ 1000 时返回（避免大图全量计数）
}

type Paginated<T> = {
  items: T[]
  page: PageInfo
}
```

默认 `limit = 20`。当实体数量大时，Agent 需要多次翻页或调整过滤条件来获取目标数据。

---

## 7. 渐进式披露（Progressive Disclosure）

渐进式披露是 Graph 模块的核心设计策略，解决"大规模图不能塞进 prompt"的问题。

### 7.1 三层信息梯度

| 层级 | 内容 | 获取方式 | 注入时机 |
|------|------|----------|----------|
| Schema 层 | 类型定义 + 关系模式 | `inspect_schema` | System Prompt |
| 入口层 | 入口实体 ID + 基本属性 | `inspect_node` | Planner 给定 |
| 探索层 | 邻居节点、方法结果、深层子图 | `query_neighbors` / `search_nodes` | Executor 按需 |

Agent 在推理过程中沿着关系边逐步展开：先看入口实体 → 发现关系 → 查邻居 → 检查邻居属性 → 调用方法 → 绑定事实。

### 7.2 搜索策略

`searchNodes` 支持三种搜索模式：

1. **全局搜索**：仅提供 `query`（ID 子字符串匹配）和/或 `type`（类型过滤）
2. **属性搜索**：当 `query` 匹配到某节点 `agentVisible = true` 的属性值时，也纳入结果
3. **锚点搜索**：提供 `relatedTo`（锚点节点 ID），返回与该节点有边关系的所有邻居，结果包含 `relation` 和 `direction` 字段

**设计动机**：Agent 可能不知道目标实体的 ID，但知道类型或属性值。`agentVisible` 让特定属性变成可搜索索引，避免 Agent 盲猜。

---

## 8. 策略层（PolicyContext）

### 8.1 策略结构

```typescript
type PolicyContext = {
  principal: Principal        // 谁在操作：userId, roles, tenantId
  scope: ScopePolicy          // 可见范围：allowedTypes, deniedEntityIds...
  redaction: RedactionPolicy   // 脱敏策略：sensitiveProperties, mode
  audit: AuditPolicy           // 审计策略：是否记录工具调用和事实读取
}
```

### 8.2 三级访问控制

| 级别 | 检查方式 | 适用工具 |
|------|----------|----------|
| 实体级 | `checkEntityAccess(nodeId, policy)` — deniedEntityIds 黑名单 + allowedEntityIds 白名单 | inspect_node, query_neighbors, bind_fact, lookup_fact |
| 类型级 | `checkTypeAccess(typeName, policy)` — deniedTypes / allowedTypes | inspect_node, query_neighbors, search_nodes |
| 属性级 | `redactProperties(props, policy)` — 对 sensitiveProperties 做 drop/mask/summarize | inspect_node 返回的 properties |

### 8.3 策略执行位置

策略检查在**工具函数内部**执行，而非工具外部的装饰器。每个图工具的 `execute` 函数开头都调用 `checkEntityAccess` / `checkTypeAccess`，返回结果前调用 `redactProperties`。

这比外部装饰器更直接——工具函数能根据具体请求参数做细粒度判断（如 `inspect_node` 的 `fields` 参数决定是否需要检查属性脱敏）。

### 8.4 默认开放策略

```typescript
const OPEN_POLICY: PolicyContext = {
  principal: { userId: 'demo_user', roles: ['admin'] },
  scope: {},
  redaction: { sensitiveProperties: [], mode: 'drop' },
  audit: { logToolCalls: false, logFactReads: false },
}
```

Demo 和测试场景使用 `OPEN_POLICY`，不做任何过滤。生产场景由调用方构造限制性 PolicyContext。

---

## 9. Agent 工具接口

Executor（LLM）通过三个图工具与 Graph 交互：

### `inspect_node`

```
输入: nodeId, fields?（type | properties | outEdges | inEdges | methods）, at?（ISO 8601）
输出: { type, properties, outEdges, inEdges, methods }
```

核心图探索工具。`fields` 参数允许 Agent 只请求需要的部分（减少 token 消耗）。`at` 参数用于诊断模式的时间旅行：如果提供且 FactStore 可用，绑定的事实将覆盖图属性。

**FactStore 叠加**：即使不提供 `at` 参数，`inspect_node` 也会将 FactStore 中已绑定的事实叠加到图属性上。这确保 Agent 看到的属性值始终是最新的已知状态。

### `query_neighbors`

```
输入: nodeId, relation?, direction?（out | in | both）, typeFilter?, limit?, offset?
输出: { neighbors: [{ nodeId, type, relation, direction }], page }
```

沿关系边探索邻居。支持三维过滤（关系类型 × 方向 × 节点类型）和分页。内部执行双源合并（静态边 + @agentRelation 动态解析）。

### `search_nodes`

```
输入: query?, type?, relatedTo?, limit?, offset?
输出: { nodes: [{ nodeId, type, relation?, direction? }], page }
```

全局或锚点搜索。当 Agent 不知道具体节点 ID 时，通过类型或属性值模糊查找。

三个工具均在返回前执行 PolicyContext 过滤，Agent 无法绕过策略看到未授权的数据。

---

## 10. FactStore 与事实绑定

### 10.1 从 V5 的扁平 KV 到 V6 的结构化绑定

V5 使用 `Record<string, any>` 存储事实，导致命名空间冲突（`workload_alice` vs `workload_bob`）和来源不可追溯。

V6 的 `FactBinding` 为每条事实提供完整元数据：

```typescript
type FactBinding = {
  entityId: string       // 实体命名空间
  property: string       // 属性名称
  value: unknown
  source: FactSource     // 来源（graph_property / method_result / aggregation / user_input / derived）
  confidence: number     // 0..1 置信度
  validFrom: string      // ISO 8601: 该值开始生效的时间
  validUntil?: string    // ISO 8601: 该值失效的时间
  observedAt: string     // ISO 8601: 系统记录该绑定的时间
}
```

### 10.2 FactStore 与 EventStore 的关系

```
EventStore（时间线，所有事件和派生事实）
    │
    └── factsAt(t) ──→ FactStore（某一时刻的事实快照）
```

- **Predictive 模式**：`FactStore = EventStore.factsAt(now)` 的投影，是"现在"切片
- **Diagnostic 模式**：直接操作 EventStore 的时间窗口查询和 but-for 事件擦除

两种模式共享同一份底层数据。`FactStore` 本身是不可变的只读快照，Rules 在其上评估。

### 10.3 Agent 事实工具

| 工具 | 方向 | 作用 |
|------|------|------|
| `bind_fact` | 写入 | Executor 从 inspect_node / call_method 获取值后，显式绑定到 FactStore |
| `lookup_fact` | 读取 | Executor 在调用 call_method 前查询事实，避免盲零传参 |
| `aggregate_facts` | 聚合 | 对多个实体的同一属性做 sum/avg/count/min/max |

这三个工具是 V6 **fact-with-binding** 原则的核心实现：所有事实都有明确的来源和置信度，Agent 不再拼扁平 KV。

---

## 11. Demo 示例（图书馆借阅场景）

`src/v6/demo/ex4/` 展示了一个完整的图书馆借阅场景。

### 11.1 实体类型定义

| 类型 | 说明 | 关键属性 | 方法 | 关系 |
|------|------|----------|------|------|
| `Reader` | 图书馆读者 | currentBorrowCount, hasOverdueBook, name | checkBorrowEligibility | borrows → Book, overdue → Book, requests → Book |
| `Book` | 馆藏书籍 | title, isbn, daysOnShelf, lendable | checkNewBookStatus | managed_by → Library |
| `Library` | 图书馆机构 | maxBorrowPerReader, newBookProtectionDays | evaluateBorrowRequest | — |

### 11.2 图数据 Seed

```
                 borrows
xiao_ming ──────────────→ book_gone_with_wind
    │  borrows            book_three_body
    │  overdue
    │──────────────────→ book_old_man_and_sea
    │  requests
    └──────────────────→ book_ai_history (新书, 上架 3 天)

book_* ───managed_by──→ city_library
```

### 11.3 本体构建

```typescript
import './entities'  // 触发装饰器注册
export const libraryOntology = buildOntology({ version: '1.0.0' })
```

`import './entities'` 的副作用是执行所有装饰器，将 Reader/Book/Library 的类型信息、属性、方法、关系写入四大 Registry。`buildOntology` 从 Registry 自动提取，生成完整 Ontology。

### 11.4 边类型校验

```typescript
const g = seedLibraryGraph(ontology.relations)
// addEdge({ from: 'xiao_ming', to: 'book_ai_history', type: 'borrows' })
//   → 校验 xiao_ming.type === Reader (borrows.fromType)
//   → 校验 book_ai_history.type === Book (borrows.toType)
//   → 通过

// 假如写错：addEdge({ from: 'city_library', to: 'book_ai_history', type: 'borrows' })
//   → 抛出 Error: node "city_library" has type "Library", schema expects fromType "Reader"
```

---

## 12. 端到端执行追踪

以图书馆借阅场景为例，展示 Agent 如何通过图工具完成事实收集。

### 前提：初始状态

```
Graph:
  xiao_ming (Reader): currentBorrowCount=2, hasOverdueBook=true
  book_ai_history (Book): daysOnShelf=3, lendable=true
  city_library (Library): maxBorrowPerReader=3, newBookProtectionDays=7

PolicyContext: OPEN_POLICY（无限制）
FactStore: 空（Agent 需要通过工具绑定事实）
```

### Step 1 — Agent 查看入口实体

```
Agent → inspect_node({ nodeId: "xiao_ming", fields: ["type", "properties", "outEdges"] })

→ {
    type: "Reader",
    properties: { name: "小明", currentBorrowCount: 2, hasOverdueBook: true },
    outEdges: {
      borrows: ["book_gone_with_wind", "book_three_body"],
      overdue: ["book_old_man_and_sea"],
      requests: ["book_ai_history"]
    }
  }
```

Agent 发现 xiao_ming 正在申请借 book_ai_history，且有逾期书籍。

### Step 2 — Agent 绑定已知事实

```
Agent → bind_fact({ entityId: "xiao_ming", property: "currentBorrowCount", value: 2, sourceKind: "graph_property" })
Agent → bind_fact({ entityId: "xiao_ming", property: "hasOverdueBook", value: true, sourceKind: "graph_property" })
```

显式绑定到 FactStore，供后续规则评估使用。

### Step 3 — Agent 探索目标书籍

```
Agent → inspect_node({ nodeId: "book_ai_history", fields: ["type", "properties"] })

→ {
    type: "Book",
    properties: { title: "人工智能简史", isbn: "978-7-115-54672-0", daysOnShelf: 3, lendable: true }
  }

Agent → bind_fact({ entityId: "book_ai_history", property: "daysOnShelf", value: 3, sourceKind: "graph_property" })
```

Agent 发现 daysOnShelf=3，这是一本新书。

### Step 4 — Agent 搜索相关规则

```
Agent → inspect_rules({ entityType: "Reader" })
Agent → inspect_rules({ entityType: "Book" })
```

发现适用规则：`borrow_limit_exceeded`、`overdue_blocks_borrow`、`new_book_not_lendable`、`good_borrow_record`。

### Step 5 — Agent 逐条验证规则

```
Agent → evaluate_rule({ ruleId: "new_book_not_lendable", entityId: "book_ai_history" })
→ { triggered: true, explanation: "书籍上架仅 3 天，不足 7 天保护期" }

Agent → evaluate_rule({ ruleId: "overdue_blocks_borrow", entityId: "xiao_ming" })
→ { triggered: true, explanation: "读者有逾期未还书籍" }
```

### Step 6 — Critic 接管

Executor 完成事实绑定后，Critic（确定性）从 FactStore 读取所有绑定，执行 ruleDag + MCDA 评分。两条 hard_constraint 均触发，ALLOWED 候选被 Veto。

**最终路径**：inspect_node（发现） → bind_fact（绑定） → evaluate_rule（验证） → Critic（判决）

---

## 13. 扩展边界

以下功能已识别、**刻意推迟**：

| 功能 | 推迟原因 | 扩展入口 |
|------|----------|----------|
| 向量检索的实体链接 | 当前 searchNodes 用 ID 子字符串匹配 + agentVisible 属性搜索已满足 demo | searchNodes 中增加 embedding 维度 |
| 实时图更新 | FactStore 仍是请求级快照 | EventStore + validUntil 重拉机制 |
| 图分区/分片 | 内存 Map 够用 | Graph 接口不变，底层换 DB |
| 多租户图隔离 | PolicyContext 提供 tenantId 但未使用 | Graph 构造时注入 tenantId 过滤 |
| 属性索引 | agentVisible 做线性扫描 | 对高频搜索属性建倒排索引 |
| 关系属性（边属性） | Edge 类型无属性字段 | Edge 增加 `properties?: Record<string, unknown>` |
| deriveRelationSchemas 自动同步 | 当前仅按需调用 | 在 addEdge 时自动更新 relationIndex |
