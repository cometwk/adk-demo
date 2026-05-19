# Graph 查询层设计文档

本文档覆盖 V6 Graph 模块的**查询能力**设计，包括 GraphStore 存储抽象、4 个 Agent 工具的接口契约、以及声明式 graph_query 查询引擎。

与 [1-graph-design.md](1-graph-design.md) 的关系：1-graph-design 聚焦**本体 + 数据结构**，本文聚焦**查询接口 + 执行机制**。

---

## 1. 问题背景：为什么需要重新设计查询层

V6 初版的图查询存在两个结构性缺陷。

### 1.1 全量内存假设

```
seedGraph()  →  Graph { nodes: Map, edges: Edge[] }  →  全量扫描
```

`Graph` 是一个具体类，所有查询（`matchNodes`、`queryNeighbors`、`searchNodes`）都直接遍历内存 Map/数组。数据必须在启动时全量灌入，不可能对接数据库。

核心矛盾：**`BaseNode` 同时承担本体定义、数据存储、行为执行三个角色**。数据库场景下，不可能为每条 DB 行实例化一个 `BaseNode` 子类。

### 1.2 工具接口 N+1 问题

| 工具 | 返回内容 | 能否过滤 | 问题 |
|------|----------|----------|------|
| `search_nodes` | `{ nodeId, type }` | 无 where | 只返回 ID，看属性需再调 N 次 `inspect_node` |
| `query_neighbors` | `{ nodeId, type, relation }` | 无 where | 同上 |
| `inspect_node` | 全量属性 + outEdges | outEdges 无分页 | 10 万条边直接撑爆 context |

前三个工具各管一块，但每块不完整：发现节点时看不到属性，看属性时必须先知道 ID。Agent 被迫做 N+1 往返。

---

## 2. 设计原则

| 原则 | 做法 |
|------|------|
| **存储抽象** | 所有查询通过 `GraphStore` 接口，不直接依赖内存 Map |
| **过滤下推** | `where` + `fields` 在接口层定义，内存 / SQL / 外部 API 均可在源头过滤 |
| **无 N+1** | 每个工具都能按需带回属性，一次调用拿到完整信息 |
| **边摘要防爆** | `inspect_node` 不返回边 ID 列表，只返回 `{ relation, count }` 摘要 |
| **渐进复杂度** | 简单查询用 `inspect_node` / `search_nodes` / `query_neighbors`，多跳查询用 `graph_query` |
| **策略前置** | 所有工具在返回前执行 `PolicyContext` 过滤，Agent 无法绕过 |
| **全异步** | `GraphStore` 方法返回 `Promise`，支持数据库 I/O |

---

## 3. GraphStore 接口

### 3.1 接口定义

```typescript
interface GraphStore {
  getNode(id: string): Promise<NodeData | undefined>

  findNodes(opts: {
    type: string
    where?: PropertyFilter[]
    fields?: string[]
    limit?: number
    offset?: number
  }): Promise<Paginated<NodeData>>

  getNeighbors(nodeId: string, opts?: {
    relation?: string
    direction?: 'out' | 'in' | 'both'
    targetType?: string
    where?: PropertyFilter[]
    fields?: string[]
    limit?: number
    offset?: number
  }): Promise<Paginated<NeighborData>>

  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>
}
```

### 3.2 DTO 类型

```typescript
type NodeData = {
  id: string
  type: string
  properties: Record<string, unknown>
}

type NeighborData = {
  nodeId: string
  type: string
  relation: string
  direction: 'out' | 'in'
  properties?: Record<string, unknown>   // 有 fields 时带回
}

type EdgeSummary = {
  relation: string
  direction: 'out' | 'in'
  targetType: string
  count: number                          // 只返回数量，不返回 ID 列表
}
```

### 3.3 关键设计决策

- **`findNodes` 的 `type` 必填**：无类型的全局搜索等价于全表扫描，在接口层禁止。
- **`where` + `fields` 下推**：`InMemoryGraphStore` 在扫描时执行 `matchesFilters` / `projectFields`；未来的 `SqlGraphStore` 翻译为 SQL `WHERE` 子句。
- **`getEdgeSummary` 替代 `getOutEdges` / `getInEdges`**：不返回完整 ID 列表，只返回 `{ relation, direction, targetType, count }`。Agent 看到 count 后用 `query_neighbors` 翻页获取详情。
- **返回 `NodeData`（纯 DTO）而非 `BaseNode`（类实例）**：数据库场景不需要实例化业务类。

### 3.4 PropertyFilter

所有 `where` 条件复用同一套过滤器类型，工具层和 `graph_query` 共享：

```typescript
type CompareOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'

type PropertyFilter = {
  property: string
  op: CompareOp
  value: unknown      // "in" 时为数组
}
```

所有过滤条件之间为 AND 逻辑。

### 3.5 实现

当前有一个内存实现：

```
InMemoryGraphStore implements GraphStore
  nodes: Map<string, BaseNode>
  edges: Edge[]
```

扩展点：实现 `SqlGraphStore` 即可对接数据库，工具层和 `GraphQueryEngine` 无需改动。

---

## 4. Agent 工具接口

四个工具构成**连续的信息梯度**，每个工具覆盖一个复杂度层级：

```
inspect_node:     按 ID 看单节点详情    → 属性 + 边摘要 + 方法
search_nodes:     按类型 + 条件批量发现  → 可选带回属性
query_neighbors:  按邻居 + 条件遍历     → 可选带回属性（1 跳）
graph_query:      声明式多跳 + 聚合     → 完整数据（N 跳）
```

### 4.1 `inspect_node`

**定位**：Agent 已知节点 ID，查看其完整信息。

```
输入:
  nodeId: string                        // 必填
  fields?: ('type'|'properties'|'edgeSummary'|'methods')[]
  at?: string                           // ISO 8601，诊断模式时间旅行

输出:
  type: string
  properties: { ... }                   // 经 FactStore 叠加 + Policy 脱敏
  edgeSummary: EdgeSummary[]            // 只有 count，不返回 ID 列表
  methods: [{ name, description, ... }]
```

**与旧版区别**：`outEdges` / `inEdges`（返回全量 ID 列表）替换为 `edgeSummary`（只返回 count），防止大图撑爆 context。

### 4.2 `search_nodes`

**定位**：Agent 不知道具体 ID，按类型和属性条件发现节点。

```
输入:
  type: string                          // 必填
  where?: PropertyFilter[]              // 属性过滤（AND）
  fields?: string[]                     // 要带回的属性
  limit?: number
  offset?: number

输出:
  nodes: [{ nodeId, type, properties? }]
  page: PageInfo
```

**与旧版区别**：
- `type` 从可选变**必填**（无类型搜索 = 全表扫描，无意义）
- 删除 `query`（ID 子字符串匹配在 UUID 系统中无用）
- 删除 `relatedTo`（与 `query_neighbors` 重复）
- 新增 `where` + `fields`，一次调用拿到过滤后的数据 + 属性

### 4.3 `query_neighbors`

**定位**：从已知节点出发，沿关系边探索 1 跳邻居。

```
输入:
  nodeId: string                        // 必填
  relation?: string
  direction?: 'out' | 'in' | 'both'
  targetType?: string
  where?: PropertyFilter[]              // 邻居属性过滤
  fields?: string[]                     // 要带回的邻居属性
  limit?: number
  offset?: number

输出:
  neighbors: [{ nodeId, type, relation, direction, properties? }]
  page: PageInfo
```

**与旧版区别**：新增 `where` + `fields`，不再需要拿到 ID 后再逐个 `inspect_node`。

### 4.4 `graph_query`

**定位**：声明式多跳查询，一次 tool call 完成复杂推理。

```
输入: GraphQuery (JSON)
  match:     起点选择（type + where + alias）
  traverse:  多步边遍历（relation + direction + where + require + alias）
  return:    输出控制（alias + fields + limit/offset + aggregate）

输出:
  mode: 'nodes' | 'aggregate'
  rows: QueryRow[] | QueryAggregateRow[]
  total?: number
  truncated?: boolean
```

适用场景：
- 2+ 跳关系遍历
- 批量属性过滤
- 聚合统计（count / sum / avg / min / max + groupBy）

简单查询不建议用 `graph_query`（开销更高）。

---

## 5. 声明式查询引擎（GraphQueryEngine）

### 5.1 执行管线

```
MATCH（起点选择）
  │
  ├── type + where 过滤 → 初始工作集（Set<nodeId>）
  │
  ▼
TRAVERSE[]（多步遍历）
  │
  ├── 对工作集中每个节点调 store.getNeighbors
  ├── where: 目标节点属性过滤
  ├── alias: 命名中间结果集
  └── require:
  │     'exists' → 从源集合剔除无匹配目标的节点
  │     'none'   → 从源集合剔除有匹配目标的节点（反向过滤）
  │
  ▼
RETURN（输出控制）
  │
  ├── alias: 返回哪个阶段的节点集
  ├── fields: 属性投影
  ├── limit/offset: 分页
  └── aggregate: groupBy + metrics
```

### 5.2 alias 机制

`alias` 是工作集的命名句柄。`traverse` 步骤可通过 `from` 引用之前任意阶段的工作集，支持分叉查询：

```json
{
  "match": { "type": "Reader", "alias": "reader" },
  "traverse": [
    { "relation": "borrows", "alias": "book", "require": "exists" },
    { "from": "reader", "relation": "overdue", "require": "exists" },
    { "from": "reader", "relation": "managed_by", "where": [...], "require": "exists" }
  ],
  "return": { "alias": "reader" }
}
```

三个 `traverse` 步骤都从 `reader` 出发，分别检查不同条件，`require: "exists"` 逐步缩小 `reader` 集合。

### 5.3 require 语义

| require | 效果 |
|---------|------|
| 省略 | 不修改源集合，只收集目标集合 |
| `exists` | 从源集合中**保留**至少有一个匹配目标的节点 |
| `none` | 从源集合中**保留**没有任何匹配目标的节点 |

示例：`require: "exists"` 找有逾期书的读者，`require: "none"` 找没有逾期书的读者。

### 5.4 聚合

`return.aggregate` 支持 `groupBy` + `metrics`：

```json
{
  "match": { "type": "Book" },
  "return": {
    "aggregate": {
      "groupBy": "category",
      "metrics": [
        { "field": "*", "fn": "count", "as": "total" },
        { "field": "daysOnShelf", "fn": "avg", "as": "avg_days" }
      ]
    }
  }
}
```

支持的聚合函数：`count` / `sum` / `avg` / `min` / `max`。

### 5.5 防爆机制

| 参数 | 默认值 | 最大值 | 说明 |
|------|--------|--------|------|
| RETURN limit | 50 | 200 | 最终结果分页 |
| 中间工作集 | - | 1000 | MATCH / TRAVERSE 步骤上限，超过截断 |
| 结果截断标记 | - | - | `truncated: true` 告知 Agent 数据不完整 |

---

## 6. 查询示例

### 6.1 简单属性过滤

> 找所有金卡读者

```json
{
  "match": { "type": "Reader", "where": [{ "property": "membershipLevel", "op": "eq", "value": "gold" }] },
  "return": { "fields": ["name", "currentBorrowCount"] }
}
```

**效果**：1 次 tool call，直接带回属性。旧版需要 `search_nodes` + N 次 `inspect_node`。

### 6.2 多跳查询

> 找借阅了科学类书籍、且有逾期、且其注册分馆支持馆际互借的读者

```json
{
  "match": { "type": "Reader", "alias": "reader" },
  "traverse": [
    {
      "relation": "borrows", "direction": "out", "targetType": "Book", "alias": "book"
    },
    {
      "from": "book", "relation": "belongs_to", "direction": "out", "targetType": "Category",
      "where": [{ "property": "name", "op": "eq", "value": "自然科学" }],
      "require": "exists"
    },
    {
      "from": "reader", "relation": "overdue", "direction": "out", "require": "exists"
    },
    {
      "from": "reader", "relation": "registered_at", "direction": "out", "targetType": "Branch",
      "where": [{ "property": "allowInterLibraryLoan", "op": "eq", "value": true }],
      "require": "exists"
    }
  ],
  "return": { "alias": "reader", "fields": ["name", "membershipLevel"] }
}
```

**效果**：1 次 tool call。旧版需要 20+ 轮往返。

### 6.3 聚合统计

> 各作者在馆书籍的平均上架天数

```json
{
  "match": { "type": "Author", "alias": "author" },
  "traverse": [
    { "relation": "written_by", "direction": "in", "targetType": "Book", "alias": "book" }
  ],
  "return": {
    "alias": "book",
    "aggregate": {
      "groupBy": "title",
      "metrics": [
        { "field": "daysOnShelf", "fn": "avg", "as": "avg_days" },
        { "field": "*", "fn": "count", "as": "count" }
      ]
    }
  }
}
```

---

## 7. 工具选择指南

Agent 在 System Prompt 中被告知以下选择策略：

| 场景 | 推荐工具 | 理由 |
|------|----------|------|
| 知道节点 ID，看详情 | `inspect_node` | 直达，无开销 |
| 按条件找节点 | `search_nodes` | type 必填 + where 过滤 |
| 从节点出发看 1 跳邻居 | `query_neighbors` | 支持 where + fields |
| 2+ 跳遍历 / 聚合 / 复杂条件 | `graph_query` | 一次到位，避免多轮往返 |

不同工具的 context 消耗对比：

| 场景 | 旧版 tool calls | 新版 tool calls | 节省 |
|------|-----------------|-----------------|------|
| 找所有金卡读者（4 个） | 1 + 4 = 5 | 1 | 80% |
| 看 3 个邻居的属性 | 1 + 3 = 4 | 1 | 75% |
| 3 跳多条件查询 | 20~30 | 1 | 97% |

---

## 8. 文件结构

```
src/v6/runtime/
├── graph-store.ts       — GraphStore 接口 + NodeData / NeighborData / EdgeSummary 类型
├── graph-filters.ts     — 共享过滤器：evalFilter / matchesFilters / projectFields
├── graph.ts             — InMemoryGraphStore implements GraphStore + BaseNode
├── query-types.ts       — GraphQuery / PropertyFilter / MatchClause / TraverseStep / ReturnClause
├── query-engine.ts      — GraphQueryEngine: MATCH → TRAVERSE → RETURN 管线

src/v6/agent/tools/
├── graph.ts             — 4 个 Agent 工具：inspect_node / search_nodes / query_neighbors / graph_query
```

---

## 9. 扩展边界

以下功能已识别、刻意推迟：

| 功能 | 推迟原因 | 扩展入口 |
|------|----------|----------|
| `SqlGraphStore` | 当前 demo 不需要数据库 | 实现 `GraphStore` 接口，`where` 翻译为 SQL |
| 属性索引 | 内存扫描对 demo 规模够用 | `InMemoryGraphStore` 内部建倒排索引 |
| EXPLAIN 模式 | 调试需求未到 | `GraphQueryEngine.explain()` 返回查询计划 |
| 查询结果缓存 | 同一轮推理内重复查询不多 | Engine 内部 LRU 缓存 |
| OR 条件 | 当前只有 AND | `PropertyFilter` 扩展 `logic: 'and' \| 'or'` |
| 子查询 / OPTIONAL | 图查询语言的高级特性 | TraverseStep 增加 `optional: true` |
