# Graph 三层模型与关系存储终态设计

> **状态**：设计草案（2026-05）  
> **背景**：GraphStore 抽象落地后，`@agentRelation` 方法体改为 `return []`、边仅由 `addEdge` 写入引发「表 + DDL」建模是否被削弱的讨论。本文给出终态 API 与迁移路径。  
> **关联**：[1-graph-design.md](./1-graph-design.md)、[1-graph-query.md](./1-graph-query.md)、[1-graph-agentRelation.md](./1-graph-agentRelation.md)

---

## 1. 核心结论（TL;DR）

| 层次 | 职责 | 类比 | 落点 |
|------|------|------|------|
| **Layer 1 — Ontology (T)** | 类型、属性、关系**类型**声明 | DDL | `@agentType` / `@agentProperty` / `@agentRelations` → Registry → `buildOntology()` |
| **Layer 2 — GraphStore (E,R)** | 节点/边的存储与查询 | DML + SELECT/JOIN | `GraphStore`：`getNode` / `findNodes` / `getNeighbors` / `getEdgeSummary` |
| **Layer 3 — Behavior** | 领域规则与方法执行 | 存储过程 / 领域服务 | `@agentMethod` on `BaseNode`；`call_method` → `getBaseNode(id)` |

**原则**：

1. **`@agentRelations` = 只声明关系 Schema（DDL）**，类级元数据，不在实例方法里查数据。
2. **邻居与边的事实只来自 `GraphStore`**（内存边表、SQL、REST 均可），废弃「双源合并」。
3. **`getNode` 返回 `NodeData`（DTO）** 用于 Agent 探索；**`getBaseNode` 返回实体实例** 仅用于 `call_method`。
4. 生产环境用 **`RelationBinding`** 把关系类型映射到物理表/FK/关联表，由 `SqlGraphStore` 生成查询。

---

## 2. 与「数据库表」的映射

### 2.1 实体类型 ↔ 表

| 图概念 | 关系型 DB |
|--------|-----------|
| `TypeSchema`（如 `Reader`） | 表 `reader` 或视图 |
| `NodeData`（`id` + `properties`） | `SELECT * FROM reader WHERE id = ?` 的一行 |
| `findNodes({ type: 'Book', where })` | `SELECT ... FROM book WHERE ...` |
| 全局 `id` | 主键；**约定全局唯一**（如 `reader:alice`、`book:1984`），写入时带类型前缀 |

`GraphStore.getNode(id)` **与表建模一致**，即按主键取单行。困难点不在 `getNode`，而在：

- 关系在 DB 中可能是 **边表**、**外键列** 或 **多态关联**；
- 查询路径不应强制返回 `BaseNode` 子类（那是 ORM 运行时，不是 Agent 事实通道）。

### 2.2 关系类型 ↔ 存储形态

| 关系示例 | 常见物理存储 | `RelationBinding.kind` |
|----------|--------------|------------------------|
| `Reader --borrows--> Book` | `borrow_record(reader_id, book_id, status)` | `junction` |
| `Reader --registered_at--> Branch` | `reader.branch_id` FK | `fk` |
| `Book --written_by--> Author` | `book.author_id` FK | `fk` |
| `Branch --partners_with--> Branch` | `branch_partner` 或 `edges` 表 | `junction` |
| Demo 全量 seed | `data.relations[]` → `addEdge()` | `memory`（测试替身） |

**本体层**只声明 `borrows: Reader → Book`；**存储层**用 `RelationBinding` 说明如何从 DB 查出邻居。

---

## 3. 架构图

```mermaid
flowchart TB
  subgraph L1["Layer 1 — Ontology / DDL"]
    AT["@agentType"]
    AP["@agentProperty"]
    AR["@agentRelations（仅 Schema）"]
    BO["buildOntology()"]
  end

  subgraph L2["Layer 2 — GraphStore (只读 DTO)"]
    GN["getNode / findNodes"]
    GB["getNeighbors / getEdgeSummary"]
    GQ["graph_query → GraphQueryEngine"]
    IM["InMemoryGraphStore (L2 部分)"]
    SQL["SqlGraphStore + RelationBinding"]
    REST["RestGraphStore"]
  end

  subgraph L3["Layer 3 — Behavior (方法执行)"]
    AM["@agentMethod"]
    CM["call_method"]
    NIC["NodeInstanceContainer (接口)"]
    MC["InMemoryGraphStore / SqlNodeContainer"]
  end

  AT --> BO
  AP --> BO
  AR --> BO
  BO --> Prompt["System Prompt: Schema only"]
  BO --> Validate["addEdge 类型校验"]

  IM --> GN
  SQL --> GN
  REST --> GN
  GN --> L2Tools["inspect_node / search_nodes / query_neighbors / graph_query"]
  GB --> L2Tools
  GQ --> L2Tools

  AM --> CM
  NIC --> CM
  MC -- "implements" --> NIC
```

---

## 4. `@agentRelations` 终态 API

### 4.1 现状问题

当前实现（过渡期）：

```typescript
@agentRelation({ type: 'borrows', toType: 'Book', description: '...' })
getBorrowedBooks(): NodeId[] {
  return []  // 仅占位；边由 seed addEdge 提供
}
```

问题：装饰器副作用依赖「假方法」；`methodName` 写入 Registry 但永不调用；与「方法 = DB 查询」的直觉冲突。

### 4.2 类级元数据装饰器（已定稿）

**不再要求实例 getter**，关系声明挂在类上：

```typescript
@agentType({ description: '图书馆读者...' })
@agentRelations([
  { type: 'borrows', toType: 'Book', description: '当前借阅（未归还）' },
  { type: 'overdue', toType: 'Book', description: '逾期未还' },
  { type: 'reserves', toType: 'Book', description: '预约中' },
  { type: 'registered_at', toType: 'Branch', description: '注册分馆' },
])
export class Reader extends BaseNode {
  // 仅 @agentProperty 与 @agentMethod
}
```

Registry 变更：

```typescript
// registry.ts — 概念草案
type RelationRegistryEntry = {
  type: string
  fromType: string
  toType: string
  description: string
  // 删除 methodName（或标记 optional deprecated）
}
```

`buildOntology()` 行为不变：仍产出 `RelationSchema[]`。

实现时移除方法级 `@agentRelation` 及空 getter；`BaseNode.resolveRelation` / `resolveAllRelations` **删除**（已 deprecated）。

### 4.3 与 `1-graph-agentRelation.md` 的差异

| 原设计 | 终态 |
|--------|------|
| resolver 方法体写 DB 查询 | 查询在 `GraphStore.getNeighbors`（Sql 实现） |
| 双源：静态边 + resolver | **单源**：仅 Store |
| `getOutEdges` 回退 resolver | `getNeighbors` 只读 Store |
| Q-B 推荐「静态边 + stub resolver」 | 改为「静态边（demo）或 SQL；无 stub resolver」 |

---

## 5. `RelationBinding` — 关系类型到物理存储

### 5.1 类型定义（草案）

```typescript
// src/v6/ontology/relation-binding.ts（拟新增）

export type RelationBinding =
  | JunctionBinding
  | ForeignKeyBinding
  | InverseForeignKeyBinding

/** 关联表：多对多或一对多事实表 */
export type JunctionBinding = {
  kind: 'junction'
  table: string
  fromColumn: string   // 指向源节点 id
  toColumn: string     // 指向目标节点 id
  /** 可选：限制边类型；同一表多关系时用 where 区分 */
  where?: string
}

/** 源表上的外键列 → 目标表一行 */
export type ForeignKeyBinding = {
  kind: 'fk'
  onType: string       // 持有 FK 的实体类型，如 Reader
  column: string       // 如 branch_id
  toType: string       // 如 Branch
}

/** 目标表上的外键指向源（入边懒查时用） */
export type InverseForeignKeyBinding = {
  kind: 'inverse_fk'
  onType: string       // 持有 FK 的类型，如 Book
  column: string       // 如 author_id
  fromType: string     // 如 Author
}

export type RelationBindingMap = Record<
  string,              // relation type，须与 RelationSchema.type 一致
  RelationBinding
>
```

### 5.2 图书馆示例映射

```typescript
export const libraryRelationBindings: RelationBindingMap = {
  borrows: {
    kind: 'junction',
    table: 'borrow_record',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
    where: "status = 'active'",
  },
  overdue: {
    kind: 'junction',
    table: 'borrow_record',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
    where: "status = 'overdue'",
  },
  reserves: {
    kind: 'junction',
    table: 'reservation',
    fromColumn: 'reader_id',
    toColumn: 'book_id',
  },
  registered_at: {
    kind: 'fk',
    onType: 'Reader',
    column: 'branch_id',
    toType: 'Branch',
  },
  written_by: {
    kind: 'fk',
    onType: 'Book',
    column: 'author_id',
    toType: 'Author',
  },
  belongs_to: {
    kind: 'fk',
    onType: 'Book',
    column: 'category_id',
    toType: 'Category',
  },
  partners_with: {
    kind: 'junction',
    table: 'branch_partner',
    fromColumn: 'branch_id',
    toColumn: 'partner_branch_id',
  },
  // available_at, part_of, specializes_in 等同理
}
```

### 5.3 `SqlGraphStore.getNeighbors` 伪代码

```typescript
async getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>> {
  const node = await this.getNode(nodeId)
  if (!node) return emptyPage()

  const rel = opts.relation
  if (!rel) throw new Error('relation is required')

  const binding = this.bindings[rel]
  const schema = this.relationIndex.get(rel)
  if (!binding || !schema) throw new Error(`unknown relation: ${rel}`)

  switch (binding.kind) {
    case 'junction':
      return this.queryJunction(node, binding, schema, opts)
    case 'fk':
      return this.queryFkOut(node, binding, opts)
    case 'inverse_fk':
      return this.queryInverseFkIn(node, binding, opts)
  }
}
```

**入边**：`direction: 'in'` 时对 `junction` 交换 from/to 列；对 `fk` 使用 `inverse_fk` 或反向索引。

### 5.4 `RestAccessBinding` — 关系类型到 REST 查询与编程式保底

为了支持 `RestCrudGraphStore` 等基于 HTTP REST 接口的存储驱动，我们引入了与物理 `RelationBinding` 相互独立但逻辑对齐的 **Access Binding**。此设计既能表达标准、高表现力的 REST 查询，又能通过 `kind: 'custom'` 提供编程式保底，完美应对不公开直接 search 端点的内部服务（如闭包计算、特定代理关系等）。

#### 5.4.1 类型定义

```typescript
export type RestAccessBinding =
  | {
      kind: 'search'
      relation: string
      fromType: GraphEntityType
      toType: GraphEntityType
      direction: 'out' | 'in'
      searchOn: GraphEntityType
      params: (source: NodeData, ctx: AccessContext) => SearchParams
      optional?: boolean
    }
  | {
      kind: 'custom' // 编程式保底
      relation: string
      fromType: GraphEntityType
      toType: GraphEntityType
      direction: 'out' | 'in'
      handler: CustomHandler
    }
```

#### 5.4.2 核心设计规范

1. **ID 统一剥离前缀**：为防止在编写 `RestAccessBinding` 规则或 custom handler 时混用 `Type:rawId` 全局唯一 ID 造成 REST 请求 404，执行上下文 `AccessContext` 强制提供 `ctx.rawId(source)` 助手函数统一获取纯净的数据库 raw ID。
2. **批量 Resolve 的上限控制**：当通过 junction 或多跳查询来批量 Resolve 目标节点时，执行器底层强制设定单批次绝对 resolve 上限（默认 `MAX_RESOLVE_LIMIT = 100`），超过上限的记录被截断，避免 N+1 爆炸。
3. **编程式 Fallback 鲁棒性**：当目标服务不支持通用 search 功能或未公开时，使用 `kind: 'custom'` 注册 `handler`，以特定的业务代码（NeighborHandler）实现编程式保底，且 `getEdgeSummary` 在探测由于 404 或未授权抛错时，执行器自动捕获异常并跳过，防止图概要探测导致崩溃。

---

## 6. `GraphStore` 与 `NodeInstanceContainer` 接口

为了实现「面向未来的优雅解耦方案 (The Elegant Path Forward)」，我们将 Layer 2（只读 DTO 存储层）与 Layer 3（有状态的方法执行层）进行完全解耦：
1. **`GraphStore` 接口**：定义纯 DTO 查询，面向只读的图探索、搜索与邻居查询，对底层存储介质（SQL, REST, 内存）完全透明。
2. **`NodeInstanceContainer` 接口**：属于 Layer 3 运行时容器，用于在执行 `call_method`（或行为层方法）时，在内存中动态恢复/查找具有业务能力的 `BaseNode` 类实例。

### 6.1 `GraphStore` 接口

```typescript
export interface GraphStore {
  getNode(id: string): Promise<NodeData | undefined>
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
  /** opts.relation 必填，见 §10 Q2 */
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>
}

export type GetNeighborsOpts = {
  relation: string   // 必填：关系类型，对应 RelationSchema.type
  direction?: 'out' | 'in'
  limit?: number
  offset?: number
}
```

| 方法 | 表建模语义 | 实现要点 |
|------|------------|----------|
| `getNode` | PK 查一行 | 返回 DTO，不构造 `BaseNode`；`id` 全局唯一（见 §10 Q1） |
| `findNodes` | 按表 + WHERE | `where` 尽量下推 SQL |
| `getNeighbors` | JOIN / 子查询 | **`relation` 必填**；依赖 `RelationBinding` |
| `getEdgeSummary` | `GROUP BY relation` COUNT | 大图上避免拉全量邻居 |

### 6.2 `NodeInstanceContainer` 接口（行为实例容器）

```typescript
export interface NodeInstanceContainer {
  /** 同步获取内存中的 BaseNode 实例（用于方法执行、动态反射等） */
  getBaseNode(id: string): BaseNode | undefined
}
```

### 6.3 `InMemoryGraphStore` 的多重实现

`InMemoryGraphStore` 作为默认的 Layer 2 内存存储提供者，它同时实现 `GraphStore` 与 `NodeInstanceContainer` 两个接口。在物理架构上，为了保持 `runtime` 的核心纯粹，建议将其实现移动到 `src/v6/provider/in-memory.ts` 目录下。

```typescript
export class InMemoryGraphStore implements GraphStore, NodeInstanceContainer {
  // 同时提供 GraphStore 接口与 NodeInstanceContainer 接口的实现
}
```

### 6.4 `createMethodTools` 的解耦

`createMethodTools`（即 `call_method`）属于行为工具层，其参数中不再传入具体的 `InMemoryGraphStore`，而是声明依赖 `NodeInstanceContainer`。这样在未来切换为 `SqlGraphStore` 等外部数据库时，只需提供实现了该接口的 `SqlNodeContainer`（在内存中根据数据库数据动态实例化/反序列化 `BaseNode` 类），即可做到对工具层和执行层无缝兼容：

```typescript
export function createMethodTools(
  container: NodeInstanceContainer, // 解耦：依赖抽象容器，而非具体内存 Store
  facts: FactStore,
  policy: PolicyContext
) {
  // ...
}
```

---

## 7. Demo / 测试数据约定

### 7.1 单一事实源

```typescript
// seed.ts — 保持不变的心智模型
const data = { readers: [...], books: [...], relations: [...] }

export function seedGraph(): InMemoryGraphStore {
  const g = new InMemoryGraphStore({ relations: ontology.relations })
  for (const r of data.readers) g.addNode(new Reader(r))
  // ...
  for (const rel of data.relations) g.addEdge(rel)  // = INSERT INTO 关联表
  return g
}
```

`data.relations` **即** demo 环境下的「关联表行集合」；**禁止**在 `ontology.ts` 中再次 `filter(data.relations)`。

### 7.2 待修复不一致

`Branch.findPartnerBranches` 仍直接读 `data.relations`，应改为：

```typescript
// 注入 GraphStore 或构造时传入 store
const partners = await store.getNeighbors(this.id, { relation: 'partners_with' })
```

---

## 8. Agent 工具与三层的关系

| 工具 | 依赖接口 / 实现 | 职责与行为 |
|------|-----------------|------------|
| `inspect_node` | L2 `GraphStore.getNode` + `getEdgeSummary` | 探查节点基础属性与出入度 |
| `search_nodes` | L2 `GraphStore.findNodes` | 支持多条件、下推式检索 DTO 数据 |
| `query_neighbors`| L2 `GraphStore.getNeighbors` | 根据 Binding 获取邻居 DTO 数据 |
| `graph_query` | L2 `GraphStore` (通过 `GraphQueryEngine`) | 声明式图路径深度查询 |
| `call_method` | L3 `NodeInstanceContainer.getBaseNode` | 动态反射执行节点上的充血业务方法 |

System Prompt 仅注入 L1（`Ontology` 的 types + relations），不注入具体边。

---

## 9. 废弃与迁移

### 9.1 废弃项

| 项 | 说明 |
|----|------|
| **双源关系解析** | `edges[]` + `resolveAllRelations()` 合并 |
| **`BaseNode.resolveRelation`** | 已空实现，删除 |
| **ontology 内 `import { data } from './seed'`** | 用于 resolver 或 `findPartnerBranches` |
| **方法级 `@agentRelation` 与空 getter** | 迁至类级 `@agentRelations` |
| **关系 resolver 中的 DB/seed 查询** | 迁至 Store 或 Binding |

### 9.2 迁移阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| **P0** | `GraphStore` + `InMemoryGraphStore`；边仅 `addEdge`；四工具 + `graph_query` | ✅ 已完成 |
| **P1** | 文档：三层模型 + 废弃双源（本文 + 更新 `1-graph-design.md` §6.3） | 本文 |
| **P2** | `@agentRelations` 类级装饰器；移除方法级 `@agentRelation` 与空 getter | ✅ 已完成 |
| **P3** | `RelationBinding` 类型 + `library/bindings.ts` 示例 | ✅ 已完成 |
| **P4** | `SqlGraphStore` 骨架 + 单关系集成测试 | 待实现 |
| **P5** | 修 `Branch.findPartnerBranches`；清理 `ontology` → `seed` 依赖 | ✅ 已完成 |

---

## 10. 设计决策（已定稿）

### Q1: 全局 `id`

**决策**：采用**全局 `id`**，约定写入时全局唯一（如 `reader:alice`、`book:1984`）。

- `getNode(id)` 保持单参数主键查询，与表建模一致。
- Demo 与 SQL 实现均遵循此前缀约定；类型信息仍由 `NodeData.type` 携带，不引入 `(type, id)` 复合键 API。

### Q2: `getNeighbors` 是否允许省略 `relation`

**决策**：**不允许**。`GetNeighborsOpts.relation` 为必填字段。

- 所有 `GraphStore` 实现（含 `InMemoryGraphStore`）在缺少 `relation` 时抛出错误。
- `graph_query` 的 TRAVERSE 始终带 `relation`；`query_neighbors` 工具层同步校验。

### Q3: `RelationBinding` 放在哪

**决策**：**独立 `bindings.ts` per 领域**（如 `library/bindings.ts`），与 `ontology.ts` 并列。

- Sql 模式启动时校验：每个 `RelationSchema.type` 在 `RelationBindingMap` 中均有对应 binding。
- 实体类不耦合物理表名；Schema（DDL）与 Binding（物理映射）职责分离。

---

## 11. 相关文档

- [1-graph-design.md](./1-graph-design.md) — Graph 模块总体设计（§6.3 双源已标记废弃）
- [1-graph-query.md](./1-graph-query.md) — 声明式查询与 GraphStore
- [1-graph-agentRelation.md](./1-graph-agentRelation.md) — 历史方案；resolver 部分已被本文取代
