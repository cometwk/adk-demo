# GraphStore 使用手册

GraphStore 是 V8 图数据的存储抽象层，提供节点访问、邻居查询和图遍历能力。

## 接口定义

```typescript
interface GraphStore {
  // 单节点访问
  getNode(id: string): Promise<NodeData | undefined>

  // 节点搜索
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>

  // 邻居访问
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>

  // 边摘要
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // 图遍历查询
  query(query: GraphTraversalQuery, policy?: PolicyContext): Promise<ToolResult<GraphQueryResult>>
}
```

## 核心方法

### getNode

按 ID 获取单个节点详情。

```typescript
const node = await store.getNode('Merch:M001')
// { id: 'Merch:M001', type: 'Merch', properties: { name: '商品A', price: 100 } }
```

### findNodes

按类型和条件搜索节点，支持分页。

```typescript
const result = await store.findNodes({
  type: 'Reader',
  where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }],
  fields: ['name'],
  limit: 20,
  offset: 0
})
// { items: [...], page: { offset: 0, limit: 20, hasMore: false } }
```

### getNeighbors

从某节点沿关系边查询邻居。

```typescript
const neighbors = await store.getNeighbors('xiao_ming', {
  relation: 'borrows',
  direction: 'out',
  targetType: 'Book',
  fields: ['title'],
  limit: 50
})
```

### getEdgeSummary

获取节点的边统计（不含邻居 ID 列表，避免大图撑爆 context）。

```typescript
const summary = await store.getEdgeSummary('xiao_ming')
// [{ relation: 'borrows', direction: 'out', targetType: 'Book', count: 3 }]
```

### query

执行声明式图遍历查询（MATCH → TRAVERSE → RETURN）。

```typescript
const result = await store.query({
  match: { type: 'Reader', where: [{ property: 'name', op: 'eq', value: '小明' }], alias: 'reader' },
  traverse: [
    { relation: 'borrows', direction: 'out', alias: 'book' },
    { from: 'book', relation: 'written_by', direction: 'out', alias: 'author' }
  ],
  return: { alias: 'author', fields: ['name'] }
})
```

## 查询选项类型

### FindNodesOpts

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | 节点类型 |
| `where` | `PropertyFilter[]` | 否 | 属性过滤条件 |
| `fields` | `string[]` | 否 | 返回的属性字段 |
| `limit` | `number` | 否 | 分页上限（默认 20） |
| `offset` | `number` | 否 | 分页偏移 |

### GetNeighborsOpts

| 字段 | 类型 | 说明 |
|------|------|------|
| `relation` | `string` | 关系类型过滤 |
| `direction` | `'out' | 'in' | 'both'` | 边方向 |
| `targetType` | `string` | 目标节点类型 |
| `where` | `PropertyFilter[]` | 目标节点属性过滤 |
| `fields` | `string[]` | 返回属性 |
| `limit` / `offset` | `number` | 分页 |

## PropertyFilter

属性过滤条件，用于 `where` 参数。

```typescript
type PropertyFilter = {
  property: string
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'
  value: unknown  // op='in' 时为数组
}
```

示例：
```typescript
{ property: 'membershipLevel', op: 'eq', value: 'gold' }
{ property: 'price', op: 'gte', value: 100 }
{ property: 'status', op: 'in', value: ['active', 'pending'] }
{ property: 'name', op: 'contains', value: '小' }
```

## 返回数据类型

### NodeData

```typescript
type NodeData = {
  id: string
  type: string
  properties: Record<string, unknown>
}
```

### NeighborData

```typescript
type NeighborData = {
  nodeId: string
  type: string
  relation: string
  direction: 'out' | 'in'
  properties?: Record<string, unknown>
}
```

### Paginated

```typescript
type Paginated<T> = {
  items: T[]
  page: { offset: number, limit: number, hasMore: boolean, total?: number }
}
```

## 图遍历查询 DSL

### GraphTraversalQuery

```typescript
type GraphTraversalQuery = {
  match: MatchClause      // 起点
  traverse?: TraverseStep[]  // 遍历步骤
  return: ReturnClause    // 输出
}
```

### MatchClause

```typescript
type MatchClause = {
  type: string
  where?: PropertyFilter[]
  alias?: string  // 默认 '_start'
}
```

### TraverseStep

```typescript
type TraverseStep = {
  from?: string          // 从哪个 alias 出发
  relation: string       // 关系类型
  direction?: 'out' | 'in' | 'both'
  targetType?: string    // 目标类型过滤
  where?: PropertyFilter[]  // 目标属性过滤
  alias?: string         // 命名工作集
  require?: 'exists' | 'none'  // 存在性断言
}
```

`require` 语义：
- `exists`：源节点至少有一个满足条件的目标，否则从源集合剔除
- `none`：源节点没有满足条件的目标，否则剔除

### ReturnClause

```typescript
type ReturnClause = {
  alias?: string        // 返回哪个 alias
  fields?: string[]     // 属性投影
  limit?: number        // 上限（默认 50，最大 200）
  offset?: number
}
```

## query 接口场景示例

以下示例覆盖 `query()` 接口的各种使用场景，数据模型基于图书馆借阅场景。

### 场景 1：简单匹配（无遍历）

仅用 MATCH 查找节点，等价于 `findNodes`。

```typescript
// 查找所有 gold 卡读者
await store.query({
  match: {
    type: 'Reader',
    where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }]
  },
  return: { fields: ['name', 'membershipLevel'] }
})

// 查找上架天数少于 7 天的新书
await store.query({
  match: {
    type: 'Book',
    where: [{ property: 'daysOnShelf', op: 'lt', value: 7 }]
  },
  return: { fields: ['title', 'daysOnShelf'] }
})
```

### 场景 2：单跳遍历

从起点沿一条关系边遍历到邻居。

```typescript
// 查找小明借阅的所有书
await store.query({
  match: {
    type: 'Reader',
    where: [{ property: 'name', op: 'eq', value: '小明' }],
    alias: 'reader'
  },
  traverse: [
    { relation: 'borrows', direction: 'out', alias: 'book' }
  ],
  return: { alias: 'book', fields: ['title'] }
})

// 反向遍历：查找某书被谁借阅
await store.query({
  match: {
    type: 'Book',
    where: [{ property: 'title', op: 'contains', value: '三体' }],
    alias: 'book'
  },
  traverse: [
    { relation: 'borrows', direction: 'in', alias: 'reader' }
  ],
  return: { alias: 'reader', fields: ['name'] }
})

// 双向遍历：查找某节点的所有邻居
await store.query({
  match: { type: 'Book', alias: 'book' },
  traverse: [
    { relation: 'available_at', direction: 'both', alias: 'related' }
  ],
  return: { alias: 'related' }
})
```

### 场景 3：多跳遍历

沿多条关系边连续遍历。

```typescript
// 读者 → 借阅书 → 作者（两跳）
await store.query({
  match: {
    type: 'Reader',
    where: [{ property: 'name', op: 'eq', value: '小明' }],
    alias: 'reader'
  },
  traverse: [
    { relation: 'borrows', direction: 'out', alias: 'book' },
    { relation: 'written_by', direction: 'out', alias: 'author' }
  ],
  return: { alias: 'author', fields: ['name'] }
})

// 读者 → 借阅书 → 分馆（两跳）
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    { relation: 'borrows', direction: 'out', alias: 'book' },
    { relation: 'available_at', direction: 'out', alias: 'branch' }
  ],
  return: { alias: 'branch', fields: ['name', 'maxBorrowPerReader'] }
})
```

### 场景 4：from 跨步骤引用

使用 `from` 从中间 alias 出发，而非默认的上一阶段。

```typescript
// 从 book 分别遍历到 author 和 branch
await store.query({
  match: { type: 'Book', alias: 'book' },
  traverse: [
    { relation: 'written_by', direction: 'out', alias: 'author' },
    { from: 'book', relation: 'available_at', direction: 'out', alias: 'branch' }
  ],
  return: { alias: 'author' }  // 或 { alias: 'branch' }
})
```

### 场景 5：存在性断言（require: exists）

筛选「至少有一条满足条件的邻居」的源节点。

```typescript
// 找出有逾期书的读者
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    { relation: 'overdue', direction: 'out', require: 'exists' }
  ],
  return: { alias: 'reader', fields: ['name'] }
})

// 找出借了三体系列书的读者（带 targetType 过滤）
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    {
      relation: 'borrows',
      direction: 'out',
      targetType: 'Book',
      where: [{ property: 'title', op: 'contains', value: '三体' }],
      require: 'exists'
    }
  ],
  return: { alias: 'reader' }
})
```

### 场景 6：反向断言（require: none）

筛选「没有满足条件的邻居」的源节点。

```typescript
// 找出没有逾期书的读者
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    { relation: 'overdue', direction: 'out', require: 'none' }
  ],
  return: { alias: 'reader' }
})

// 找出从未被借阅的书
await store.query({
  match: { type: 'Book', alias: 'book' },
  traverse: [
    { relation: 'borrows', direction: 'in', require: 'none' }
  ],
  return: { alias: 'book', fields: ['title'] }
})
```

### 场景 7：目标类型过滤（targetType）

限制遍历目标的节点类型。

```typescript
// 只查找 Reader 借阅的 Book（而非其他类型）
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    { relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' }
  ],
  return: { alias: 'book' }
})
```

### 场景 8：目标属性过滤（where in traverse）

在遍历步骤中过滤目标节点属性。

```typescript
// 查找读者借阅的、上架天数超过 30 天的书
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    {
      relation: 'borrows',
      direction: 'out',
      where: [{ property: 'daysOnShelf', op: 'gt', value: 30 }],
      alias: 'oldBook'
    }
  ],
  return: { alias: 'oldBook', fields: ['title', 'daysOnShelf'] }
})

// 查找上架天数在 50-100 之间的书
await store.query({
  match: { type: 'Book', alias: 'book' },
  traverse: [],
  return: {
    alias: 'book',
    fields: ['title', 'daysOnShelf']
  }
})
// 实际应用中用 findNodes 的多条件 AND：
// where: [{ property: 'daysOnShelf', op: 'gte', value: 50 }, { property: 'daysOnShelf', op: 'lte', value: 100 }]
```

### 场景 9：属性投影（fields）

只返回需要的属性字段，减少 context 消耗。

```typescript
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [{ relation: 'borrows', direction: 'out', alias: 'book' }],
  return: {
    alias: 'book',
    fields: ['title']  // 只返回标题，不返回其他属性
  }
})
```

### 场景 10：分页（limit / offset）

控制返回行数，处理大结果集。

```typescript
// 第一页
await store.query({
  match: { type: 'Book' },
  return: { fields: ['title'], limit: 20, offset: 0 }
})

// 第二页
await store.query({
  match: { type: 'Book' },
  return: { fields: ['title'], limit: 20, offset: 20 }
})
```

### 场景 11：组合场景（多条件 + 多跳 + 存在性）

综合运用多种特性。

```typescript
// 找出 gold 卡、有逾期书、且逾期书上架少于 7 天的读者
await store.query({
  match: {
    type: 'Reader',
    where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }],
    alias: 'reader'
  },
  traverse: [
    {
      relation: 'overdue',
      direction: 'out',
      targetType: 'Book',
      where: [{ property: 'daysOnShelf', op: 'lt', value: 7 }],
      require: 'exists',
      alias: 'newOverdueBook'
    }
  ],
  return: { alias: 'reader', fields: ['name'] }
})
```

### 场景 12：返回起点（遍历后仍返回源节点）

遍历用于存在性断言，但返回的是起点而非终点。

```typescript
// 遍历到 overdue 书用于筛选，但返回的是 reader
await store.query({
  match: { type: 'Reader', alias: 'reader' },
  traverse: [
    { relation: 'overdue', direction: 'out', require: 'exists', alias: '_ignored' }
  ],
  return: { alias: 'reader' }  // 返回 reader，不是 _ignored
})
```

### 场景 13：多值过滤（op: 'in'）

匹配多个候选值。

```typescript
// 查找 gold 或 silver 卡读者
await store.query({
  match: {
    type: 'Reader',
    where: [
      { property: 'membershipLevel', op: 'in', value: ['gold', 'silver'] }
    ]
  },
  return: { fields: ['name', 'membershipLevel'] }
})
```

### 场景 14：字符串包含匹配（op: 'contains'）

模糊匹配字符串属性。

```typescript
// 查找书名包含「三体」的书
await store.query({
  match: {
    type: 'Book',
    where: [{ property: 'title', op: 'contains', value: '三体' }]
  },
  return: { fields: ['title', 'isbn'] }
})
```

### 场景 15：返回所有属性（不指定 fields）

省略 `fields` 时返回完整属性对象。

```typescript
await store.query({
  match: { type: 'Branch', alias: 'lib' },
  return: { alias: 'lib' }  // 返回 id, type, properties（全部属性）
})
```

## 相关文件

- 接口定义：`src/v8/engine/stores/graph-store.ts`
- 查询 DSL：`src/v8/engine/query/graph-query.ts`
- 过滤器：`src/v8/engine/query/filters.ts`
- 设计文档：`docs/design/1-graph-query.md`