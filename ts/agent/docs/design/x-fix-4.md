# Fix-4：Graph Query Language — 声明式图查询

## 1. 问题诊断

### 1.1 现状

V6 的图工具是三个**命令式单跳 API**：

```text
inspect_node   → 看一个节点
query_neighbors → 看邻居（1 跳）
search_nodes   → 全局/锚点搜索
```

### 1.2 痛点

当 Agent 需要做多跳推理时，比如：

> "找出最近30天借过 AI 类书籍、且存在 overdue、且属于 VIP、且其 manager 也 overdue 的 Reader"

当前需要：

```text
1. search_nodes({ type: "Reader" })          → 拿到所有 Reader
2. 对每个 Reader:
   inspect_node(readerId, ["properties"])     → 检查 isVIP
3. 对每个 VIP Reader:
   query_neighbors(readerId, { relation: "borrows" })  → 拿到借的书
4. 对每本书:
   inspect_node(bookId, ["properties"])       → 检查 category == "AI"
5. 对符合条件的 Reader:
   query_neighbors(readerId, { relation: "overdue" })  → 检查有无 overdue
6. query_neighbors(readerId, { relation: "managed_by" })  → 拿 manager
7. inspect_node(managerId, ["properties"])     → 检查 manager.hasOverdue
```

**3 个 Reader × 5 本书 = 约 20~30 轮 tool call**，context 爆炸。

### 1.3 根本矛盾

```text
命令式 API          ← 适合 → 简单查询（1~2 跳）
声明式 Query Language ← 适合 → 复杂查询（3+ 跳、过滤、聚合）
```

V6 只有前者，缺后者。

---

## 2. 设计方案：JSON 声明式图查询

### 2.1 为什么选 JSON 而非字符串 DSL

| 方案 | 优点 | 缺点 |
|------|------|------|
| 自定义字符串 DSL（类 Cypher） | 表达力强、简洁 | 需要 parser，LLM 容易写错语法 |
| GraphQL | 业界标准 | 粒度太细，不适合图遍历 |
| **JSON 结构化查询** | **Zod 自动校验、LLM 擅长 JSON、零 parser** | 略冗长 |

JSON 查询最适合原型阶段：**Zod schema 即语法定义，tool inputSchema 即文档**。

### 2.2 查询模型：MATCH → TRAVERSE → RETURN 管线

```text
MATCH (起点选择)
  │
  ├── where: 属性过滤
  │
  ▼
TRAVERSE[] (多步遍历)
  │
  ├── relation + direction: 沿边行走
  ├── targetType: 目标类型过滤
  ├── where: 目标节点属性过滤
  ├── alias: 命名当前工作集
  └── require: exists / all (存在性断言)
  │
  ▼
RETURN (输出控制)
  │
  ├── alias: 返回哪个阶段的节点
  ├── fields: 投影哪些属性
  ├── limit/offset: 分页
  └── aggregate: 聚合（count/sum/avg/min/max）
```

### 2.3 类型定义

```typescript
// ── 属性过滤条件 ──

type CompareOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'

type PropertyFilter = {
  property: string
  op: CompareOp
  value: unknown
}

// ── MATCH: 起点选择 ──

type MatchClause = {
  type: string               // 实体类型名 (e.g. "Reader")
  where?: PropertyFilter[]   // 属性过滤
  alias?: string             // 命名此阶段（默认 "_start"）
}

// ── TRAVERSE: 边遍历步骤 ──

type TraverseStep = {
  from?: string              // 从哪个 alias 出发（默认前一步）
  relation: string           // 边类型
  direction?: 'out' | 'in' | 'both'  // 默认 'out'
  targetType?: string        // 目标节点类型过滤
  where?: PropertyFilter[]   // 目标节点属性过滤
  alias?: string             // 命名此阶段结果
  require?: 'exists' | 'none'  // 存在性断言：
                                // exists = 必须至少有一个目标（过滤源节点）
                                // none = 必须没有目标（反向过滤）
}

// ── 聚合规格 ──

type AggregateSpec = {
  groupBy?: string
  metrics: { field: string; fn: 'count' | 'sum' | 'avg' | 'min' | 'max' }[]
}

// ── RETURN: 输出控制 ──

type ReturnClause = {
  alias?: string             // 返回哪个阶段的节点（默认最后一步）
  fields?: string[]          // 投影属性（空 = 全部）
  limit?: number             // 分页
  offset?: number
  aggregate?: AggregateSpec  // 聚合模式
}

// ── 顶层查询 ──

type GraphQuery = {
  match: MatchClause
  traverse?: TraverseStep[]
  return?: ReturnClause
}
```

### 2.4 查询示例

#### 示例 1：简单查询 — 找所有逾期读者

```json
{
  "match": {
    "type": "Reader",
    "where": [{ "property": "hasOverdueBook", "op": "eq", "value": true }]
  }
}
```

等价于现在的 `search_nodes({ type: "Reader" })` + 逐个 `inspect_node` 检查属性。**从 N+1 轮压缩到 1 轮。**

#### 示例 2：多跳查询 — x-drawback.md 中的例子

> "找出借过 AI 类书籍、且存在 overdue、且 manager 也 overdue 的 VIP Reader"

```json
{
  "match": {
    "type": "Reader",
    "where": [{ "property": "isVIP", "op": "eq", "value": true }],
    "alias": "reader"
  },
  "traverse": [
    {
      "relation": "borrows",
      "direction": "out",
      "targetType": "Book",
      "where": [{ "property": "category", "op": "contains", "value": "AI" }],
      "require": "exists"
    },
    {
      "from": "reader",
      "relation": "overdue",
      "direction": "out",
      "require": "exists"
    },
    {
      "from": "reader",
      "relation": "managed_by",
      "direction": "out",
      "where": [{ "property": "hasOverdueBook", "op": "eq", "value": true }],
      "require": "exists"
    }
  ],
  "return": {
    "alias": "reader",
    "fields": ["name", "currentBorrowCount"]
  }
}
```

**从 20~30 轮压缩到 1 轮。**

#### 示例 3：聚合查询 — 各图书馆的逾期读者数

```json
{
  "match": { "type": "Reader", "where": [{ "property": "hasOverdueBook", "op": "eq", "value": true }], "alias": "reader" },
  "traverse": [
    { "relation": "borrows", "direction": "out", "targetType": "Book", "alias": "book" },
    { "from": "book", "relation": "managed_by", "direction": "out", "targetType": "Library", "alias": "library" }
  ],
  "return": {
    "alias": "library",
    "aggregate": {
      "groupBy": "name",
      "metrics": [{ "field": "*", "fn": "count" }]
    }
  }
}
```

---

## 3. 实现方案

### 3.1 新增文件

```
src/v6/runtime/
├── query-engine.ts      — GraphQueryEngine: 编译 + 执行 JSON 查询
├── query-types.ts       — 查询类型定义（GraphQuery, MatchClause, etc.）

src/v6/agent/tools/
├── graph.ts             — 新增 graph_query 工具（与现有 3 个工具共存）
```

### 3.2 GraphQueryEngine 核心逻辑

```typescript
class GraphQueryEngine {
  constructor(
    private graph: Graph,
    private policy: PolicyContext,
    private facts?: FactStore
  ) {}

  execute(query: GraphQuery): ToolResult {
    // 1. MATCH: 扫描所有节点，按 type + where 过滤 → 初始工作集
    const workingSets = new Map<string, Set<string>>()
    const startAlias = query.match.alias ?? '_start'
    workingSets.set(startAlias, this.matchNodes(query.match))

    // 2. TRAVERSE: 逐步遍历
    let currentAlias = startAlias
    for (const step of query.traverse ?? []) {
      const fromAlias = step.from ?? currentAlias
      const fromSet = workingSets.get(fromAlias)
      if (!fromSet) return toolErr('INVALID_ARGS', `Unknown alias: ${fromAlias}`)

      const { survivors, targets } = this.traverseStep(fromSet, step)

      // require = 'exists': 从源集合中过滤掉没有匹配目标的节点
      if (step.require === 'exists') {
        workingSets.set(fromAlias, survivors)
      }
      // require = 'none': 从源集合中过滤掉有匹配目标的节点
      if (step.require === 'none') {
        const original = workingSets.get(fromAlias)!
        const filtered = new Set([...original].filter(id => !survivors.has(id)))
        workingSets.set(fromAlias, filtered)
      }

      if (step.alias) {
        workingSets.set(step.alias, targets)
        currentAlias = step.alias
      }
    }

    // 3. RETURN: 投影 + 分页 + 聚合
    return this.buildReturn(workingSets, query.return, currentAlias)
  }
}
```

### 3.3 属性过滤器实现

```typescript
function evaluateFilter(value: unknown, filter: PropertyFilter): boolean {
  switch (filter.op) {
    case 'eq':       return value === filter.value
    case 'ne':       return value !== filter.value
    case 'gt':       return (value as number) > (filter.value as number)
    case 'gte':      return (value as number) >= (filter.value as number)
    case 'lt':       return (value as number) < (filter.value as number)
    case 'lte':      return (value as number) <= (filter.value as number)
    case 'contains': return String(value).includes(String(filter.value))
    case 'in':       return Array.isArray(filter.value) && filter.value.includes(value)
  }
}
```

### 3.4 新工具注册

在 `createGraphTools` 中新增第 4 个工具：

```typescript
const graph_query = tool({
  description:
    '声明式图查询。用 JSON 表达多跳遍历 + 属性过滤 + 聚合，一次 tool call 完成复杂查询。' +
    '适用于涉及 2+ 跳关系遍历或批量属性过滤的场景。简单查询仍建议用 inspect_node / query_neighbors。',
  inputSchema: graphQuerySchema,  // Zod schema
  execute: async (query): Promise<ToolResult> => {
    const engine = new GraphQueryEngine(graph, policy, facts)
    return engine.execute(query)
  },
})
```

### 3.5 与现有工具的关系

```text
简单查询（1 跳）   → inspect_node / query_neighbors / search_nodes  ← 保留不变
复杂查询（2+ 跳）  → graph_query                                   ← 新增
```

Agent 在 System Prompt 中会被告知：
- 简单探索用原有三工具（低开销）
- 多跳/过滤/聚合用 `graph_query`（一次到位）

---

## 4. 与现有架构的集成

### 4.1 Policy 集成

`GraphQueryEngine` 在每一步都执行策略检查：

```text
MATCH  → checkTypeAccess(match.type)
         每个候选节点 → checkEntityAccess(nodeId)
         属性返回前 → redactProperties(props)

TRAVERSE → 遍历目标节点同样走 checkEntityAccess + checkTypeAccess

RETURN → 最终结果的属性经过 redactProperties
```

### 4.2 FactStore 集成

查询属性值时，优先使用 FactStore 中的绑定值（与 `inspect_node` 行为一致）：

```typescript
private getNodeProperties(nodeId: string): Record<string, unknown> {
  const node = this.graph.getNode(nodeId)!
  let props = node.getProperties()
  if (this.facts) {
    for (const bf of this.facts.forEntity(nodeId)) {
      props = { ...props, [bf.property]: bf.value }
    }
  }
  return props
}
```

### 4.3 双源关系解析

`traverseStep` 中遍历邻居时复用 `graph.queryNeighbors`，自动走双源合并（静态边 + @agentRelation 动态解析），无需额外处理。

### 4.4 分页防爆

查询结果默认 `limit = 50`，最大 `limit = 200`。中间遍历步骤的工作集上限 `1000` 个节点，超过则截断并在 `meta` 中标注 `truncated: true`。

---

## 5. 渐进实施路径

### Phase 1：基础查询引擎（当前目标）

- [ ] 实现 `query-types.ts` — 类型定义 + Zod schema
- [ ] 实现 `query-engine.ts` — MATCH + TRAVERSE + RETURN
- [ ] 在 `createGraphTools` 中注册 `graph_query` 工具
- [ ] 用图书馆场景编写测试

### Phase 2：高级特性

- [ ] `aggregate` 支持 groupBy + metrics
- [ ] `require: 'none'` 反向过滤（"找出没有逾期的读者"）
- [ ] 查询结果缓存（同一轮推理内去重查询）

### Phase 3：优化

- [ ] 属性索引（对 `agentVisible = true` 的属性建倒排索引）
- [ ] 查询计划优化（先过滤再遍历 vs 先遍历再过滤，选基数更小的路径）
- [ ] EXPLAIN 模式（返回查询计划而非执行结果，帮助 Agent 调试）

---

## 6. 效果对比

| 场景 | 现有 API（tool calls 数） | graph_query（tool calls 数） | 节省 |
|------|---------------------------|------------------------------|------|
| 找所有逾期读者 | N+1（search + N×inspect） | 1 | ~90% |
| 多跳条件查询（3 跳） | 20~30 | 1 | ~97% |
| 聚合统计 | N+1 + 手动计算 | 1 | ~95% |
| 简单看一个节点 | 1 | 1（不推荐用 graph_query） | 0 |

**核心收益：将复杂查询的 context 消耗从 O(N×hops) 降到 O(1)。**
