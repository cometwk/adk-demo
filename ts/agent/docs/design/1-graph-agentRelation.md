# graph.agentRelation 

> **⚠️ 部分过时**：本文中「resolver 方法体写 DB 查询」「双源合并」「静态边 + stub resolver」等描述已被 **[1-graph-layers.md](./1-graph-layers.md)** 取代。终态为：`@agentRelation` 仅声明 Schema；边/邻居只经 `GraphStore`；生产环境用 `RelationBinding` + `SqlGraphStore`。

## Problem Frame

当前 V6 架构中，边存储在 `Graph.edges[]`，是静态数据事实。业务落地时，边数据实际来自数据库查询（如 `Reader.borrows Book` 的关系存储在 `borrows` 表）。

**问题**：
- 静态 edges 无法适配大规模业务数据库场景
- RelationSchema 手动定义，与实体类定义分离，维护成本高
- 缺少实体方法绑定数据库查询的机制

**目标**：引入 `@agentRelation` 装饰器，让实体类声明式定义 RelationSchema，并实现边查询逻辑（绑定数据库查询）。

## 背景

该系统的设计与实现围绕着将 AI 从简单的"图搜索工具"进化为"工业级决策支持系统"这一核心目标， 
经历了从 V5 到 V6 的深度演进。其核心框架可以总结为：
**本体（Ontology）定义规范、图（Graph）提供事实、Agent（Agent）执行受控推理**。

本文的讨论范围:

1. 本体设计 (Ontology: G = {E, R, T, C})
  - T = TypeSchema + RelationSchema  
  - C = 不在讨论范围内 (C（准则/规则）的一等公民化)

2. 图数据与事实管理 (Graph & Facts)
  - graph: **渐进式实体披露 (Progressive Disclosure)**：System Prompt 仅提供入口实体和 Schema，
    Agent 必须通过 `inspect_node` 和 `query_neighbors` 按需探索图，以适配大规模数据和隐私权限场景。

  - facts (FactStore 与 FactBinding): 不在讨论范围内 
  - 权限与隐私 (PolicyContext)：不在讨论范围内

3. Agent 架构与推理逻辑 (Agent Loop): 不在讨论范围


---
参考目前的实现
- @src/v6/ontology/schema.ts 本体模型中的 T
- @src/v6/runtime/graph.ts 本体模型中的 E, R
- @src/v6/agent/tools/graph.ts 按需探索图
  - search_nodes
  - inspect_node
  - query_neighbors

demo
- @src/v6/demo/ex4/entities.ts 定义 T 中的 TypeSchema
- @src/v6/demo/ex4/ontology.ts 定义 T
- @src/v6/demo/ex4/seed.ts 初始化 E , R

---

## 方案评估

### 现状痛点

| 痛点 | 说明 |
|------|------|
| Schema-Data 分离 | `RelationSchema` 在 `ontology.ts` 中手动声明，与实体类完全割裂。业务实体（映射到 DB 表）天然知道自己的关系，却要在外部重复声明。 |
| 手动边管理 | 所有边必须通过 `g.addEdge()` 在 seed 文件中手动添加。生产环境中边应来自数据库查询。 |
| 无 Lazy Loading | 全部边必须预加载到 `Graph.edges`，大规模数据场景不适用。 |
| 声明不一致 | `@agentProperty` 和 `@agentMethod` 已通过装饰器声明在实体类上，但关系仍需外部手动声明。 |

### `@agentRelation` 方案优势

1. **单一事实来源 (Single Source of Truth)**: 关系的 Schema 声明与数据解析逻辑共存于实体类
2. **与现有装饰器一致**: `@agentRelation` 与 `@agentProperty`、`@agentMethod` 形成完整的三件套
3. **生产友好**: 方法体可直接写 DB 查询，方便与 DDL/表关系绑定
4. **渐进式采用**: 静态边（demo）与动态解析（生产）可共存，无须一步到位

---

## 设计决策

### Q1: Graph 中是否必须区分 getOutEdges 和 getInEdges？

**结论：保留区分，但 lazy resolution 仅在 out 方向自动生效。**

| 方向 | 行为 |
|------|------|
| `getOutEdges(nodeId)` | ① 查静态边 → ② 无静态边时回退到 `@agentRelation` resolver |
| `getInEdges(nodeId)` | 仅查静态边（暂不支持 lazy resolution） |
| `queryNeighbors(direction='out')` | 同 getOutEdges，支持 lazy resolution |
| `queryNeighbors(direction='in')` | 反向扫描其他节点的 `@agentRelation` resolver |
| `queryNeighbors(direction='both')` | 合并 out + in 两个方向 |

**理由**：
- `@agentRelation` 天然描述出边（"我借了哪些书"），这是声明的自然方向
- 入边（"哪些人借了这本书"）需要扫描所有可能的 source 节点 — 开销大，但对 prototype 可接受
- `inspect_node` 工具的 `outEdges` 字段直接受益于 lazy resolution

### Q2: BaseNode 是否提供 Graph.getOutEdges 到 agentRelation function 的辅助函数？

**结论：是。BaseNode 提供两个辅助方法。**

```ts
abstract class BaseNode {
  // 解析单个关系类型的出边目标 ID 列表
  resolveRelation(relationType: string): NodeId[]
  // 解析所有出边（聚合所有 @agentRelation 方法的结果）
  resolveAllRelations(): Record<string, NodeId[]>
}
```

`Graph.getOutEdges(nodeId)` 在无静态边时调用 `node.resolveAllRelations()` 作为回退。

---

## 详细设计

### 1. AgentRelationRegistry

新增全局注册表，与 `AgentPropertyRegistry` / `AgentMethodRegistry` 平行：

```ts
// registry.ts

export type RelationRegistryEntry = {
  type: string        // 边类型名，如 'borrows'
  fromType: string    // 来源实体类型（自动填充为装饰器所在 class 名）
  toType: string      // 目标实体类型，如 'Book'
  description: string // 人类可读描述
  methodName: string  // 解析方法名（@agentRelation 装饰的方法）
}

class AgentRelationRegistry {
  register(className, entry)
  getRelationsForClass(className): RelationRegistryEntry[]
  getRelationsForToType(toType): RelationRegistryEntry[]  // 反向查询
  getAllRelationSchemas(): RelationSchema[]                 // → buildOntology 自动收集
  clear()
}
```

### 2. @agentRelation 装饰器

```ts
// decorator.ts

type RelationSchemaConfig = {
  type: string        // 边类型
  toType: string      // 目标实体类型
  description: string // 描述
}

function agentRelation(config: RelationSchemaConfig)
// 装饰方法，签名: () => NodeId[]
// 返回该关系类型的所有目标节点 ID
```

### 3. BaseNode 扩展

```ts
// graph.ts — BaseNode 新增方法

abstract class BaseNode {
  // ...existing: id, getCapabilities(), getProperties()

  getRelationSchemas(): RelationRegistryEntry[]     // 返回本类型声明的所有关系
  resolveRelation(type: string): NodeId[]           // 解析单个关系
  resolveAllRelations(): Record<string, NodeId[]>   // 解析所有关系
}
```

### 4. Graph lazy resolution

```ts
// graph.ts — Graph 方法更新

getOutEdges(nodeId) {
  result = {} // 从 this.edges 中收集静态边（现有逻辑不变）
  node = this.nodes.get(nodeId)
  if (node) {
    resolved = node.resolveAllRelations()
    for ([type, ids] of resolved) {
      if (type 在 result 中无静态边) {
        result[type] = ids  // lazy 回退
      }
    }
  }
  return result
}
```

**优先级规则**: 同一 (nodeId, relationType) 下，静态边优先。无静态边时才调用 resolver。  
**理由**: demo 继续用静态边，生产环境不加载静态边、仅用 resolver。

### 5. buildOntology 自动收集

```ts
// ontology-builder.ts

function buildOntology(opts) {
  return {
    version: opts.version,
    types: ...,
    relations: [
      ...AgentRelationRegistry.getAllRelationSchemas(), // 自动收集
      ...(opts.relations ?? []),                        // 手动补充（向后兼容）
    ]
  }
}
```

### 6. Demo 迁移

entities.ts 添加 `@agentRelation` 装饰器 + stub 方法：

```ts
class Reader extends BaseNode {
  @agentRelation({ type: 'borrows', toType: 'Book', description: '读者当前借阅' })
  getBorrowedBooks(): NodeId[] { return [] } // stub，Graph 使用静态边
  
  @agentRelation({ type: 'overdue', toType: 'Book', description: '逾期未还书籍' })
  getOverdueBooks(): NodeId[] { return [] }
  
  @agentRelation({ type: 'requests', toType: 'Book', description: '正在申请借阅' })
  getRequestedBooks(): NodeId[] { return [] }
}

class Book extends BaseNode {
  @agentRelation({ type: 'managed_by', toType: 'Library', description: '归属图书馆' })
  getManagedByLibrary(): NodeId[] { return [] }
}
```

ontology.ts 简化为：
```ts
export const libraryOntology = buildOntology({ version: '1.0.0' })
// relations 从 @agentRelation 装饰器自动收集，不再需要手动声明
```

---

## 待确认问题

### Q-A: Resolver 同步 vs 异步

| 选项 | 描述 |
|------|------|
| **A: 同步 (推荐)** | resolver 返回 `NodeId[]`。demo 友好，API 简单。后续可扩展为异步。 |
| B: 异步 | resolver 返回 `Promise<NodeId[]>`。生产就绪（DB 查询天然异步），但 Graph 全链路需改为 async。 |

### Q-B: Demo 迁移策略

| 选项 | 描述 |
|------|------|
| **A: 保留静态边 + stub resolver (推荐)** | 向后兼容，seed.ts 不变。`@agentRelation` 方法为空实现，Graph 回退到静态边。 |
| B: 完全迁移 | 删除 seed.ts 中的 `addEdge()`，resolver 返回硬编码数据。展示新模式，但改动范围大。 |
