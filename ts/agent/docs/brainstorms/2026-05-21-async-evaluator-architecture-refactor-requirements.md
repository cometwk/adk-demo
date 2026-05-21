---
date: 2026-05-21
topic: async-evaluator-architecture-refactor
---

# 异步架构重构：消除 Graph 别名 + NodeInstanceContainer 异步化

## Problem Frame

当前存在两个同步接口阻碍架构统一：

1. **`type Graph = InMemoryGraphStore` 别名**
   - 规则引擎需要同步调用 `getBaseNode()` 和 `getOutEdges()/getInEdges()`
   - 这些方法只在 InMemoryGraphStore 上存在，不在 GraphStore 接口中

2. **`NodeInstanceContainer` 与 `GraphStore` 分离**
   - 需要两个参数（`graph: GraphStore, container: NodeInstanceContainer`）
   - 增加调用复杂度

**目标**：合并为单一异步接口 `GraphStore`，简化架构。

---

## Requirements

**Phase 1: GraphStore 接口合并**

- R1. `GraphStore` 接口合并，包含 `getBaseNode()`：
  ```typescript
  export interface GraphStore {
    // 数据方法
    getNode(id: string): Promise<NodeData | undefined>
    findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
    getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>
    getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>
    
    // 实例方法（合并进来）
    getBaseNode(id: string): Promise<BaseNode | undefined>
  }
  ```

- R2. 删除 `NodeInstanceContainer` 接口（或保留为 `type NodeInstanceContainer = GraphStore` 向后兼容别名）

- R3. `InMemoryGraphStore.getBaseNode()` 改为返回 `Promise<BaseNode>`（内部仍同步实现，用 Promise 包装）

- R4. `RestGraphStore.getBaseNode()` 改为异步获取完整实例（消除"空壳 + 预水合"模式）

- R5. 删除 `populateNodeProperties()` 方法（不再需要两阶段设计）

**Phase 2: 规则引擎异步化**

- R6. `RuleContext.graph` 类型从 `Graph` 改为 `GraphStore`

- R7. `Rule.evaluator` 改为异步：
  ```typescript
  evaluator: (ctx: RuleContext) => Promise<RuleResult>
  ```

- R8. `evaluateRuleDag` 改为 `async`，返回 `Promise<DagEvaluationOutput>`

- R9. 类型匹配改用 `NodeData.type`：
  ```typescript
  const nodeData = await graph.getNode(eid)
  rule.appliesTo.includes(nodeData.type)
  ```

- R10. 边遍历改用 `await graph.getNeighbors()`，替代 `getOutEdges()/getInEdges()`

**Phase 3: 调用链改造**

- R11. `runPredictiveCritic` 改为 `async`

- R12. `runCritic` 改为 `async`

- R13. 所有调用规则引擎的地方适配 async 调用

**Phase 4: 工具层改造**

- R14. `method.ts` 的 `createMethodTools` 参数简化为单一 `GraphStore`：
  ```typescript
  createMethodTools(graph: GraphStore, facts: FactStore, policy: PolicyContext)
  ```

- R15. `call_method` 和 `describe_method` 内部使用 `await graph.getBaseNode()`

**Phase 5: 前端改造**

- R16. `entityLinker.ts` 参数简化为单一 `GraphStore`（不再需要两个参数）

- R17. `link()` 函数改为 `async`，使用 `await graph.getBaseNode()`

**Phase 6: 别名消除**

- R18. 删除 `export type Graph = InMemoryGraphStore`

- R19. 更新所有 `import { Graph }` 改为 `GraphStore` 或具体类名

- R20. 删除 `getOutEdges()` 和 `getInEdges()` 方法（这些同步边遍历方法不再需要）

---

## Success Criteria

- 所有接口都是异步的（GraphStore、NodeInstanceContainer）
- 规则引擎只依赖 `GraphStore`，不依赖 `InMemoryGraphStore`
- `RestGraphStore` 可以直接传入规则引擎和 method.ts，无需"空壳 + 预水合"
- `Graph` 别名完全删除，代码编译无错误
- `getOutEdges()/getInEdges()` 同步方法删除

---

## Scope Boundaries

**不在本次范围内：**
- 性能优化（异步开销暂时接受）
- BaseNode 类本身的改造（仍保留方法执行能力）
- FactStore 的改造（已经是同步内存操作，保持不变）

---

## Key Decisions

- **Decision: 全部异步化**
  - 统一架构，消除同步/异步混合模式
  - RestGraphStore 不再需要"空壳实例 + 预水合"的两阶段设计
  - 性能代价可接受（Promise 调度开销约 10-50ms / 千次调用）

- **Decision: 类型匹配改用 NodeData.type**
  - 与 className 本质等价（都是类型名）
  - 不依赖实例反射，更符合 DTO 设计

- **Decision: 删除 getOutEdges/getInEdges**
  - 边遍历统一用 `graph.getNeighbors()` 异步方法
  - InMemoryGraphStore 仍可保留内部边数组，但对外只暴露异步接口

- **Decision: GraphStore 与 NodeInstanceContainer 合并**
  - 合并为单一 `GraphStore` 接口，包含 `getNode()` + `getBaseNode()`
  - 简化调用，不再需要两个参数（`graph` + `container`）
  - 删除 `NodeInstanceContainer` 接口（或保留为向后兼容别名）

---

## Dependencies / Assumptions

- 规则数量和实体数量在可接受范围内
- AI SDK tool 的 execute 函数本身就是 async，可适配 NodeInstanceContainer 异步
- BaseNode 实例的方法执行仍是同步的（实例就绪后直接调用）

---

## Architecture After Refactor

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 2: 存储层（单一异步接口）                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  GraphStore (async)                                                 │
│  - getNode()         → NodeData (纯数据)                             │
│  - findNodes()                                                      │
│  - getNeighbors()                                                   │
│  - getBaseNode()     → BaseNode (有行为的实例)                        │
│                                                                     │
│  ┌───────────────────┐     ┌───────────────────┐                   │
│  │ InMemoryGraphStore│     │ RestGraphStore    │                   │
│  │ (内部同步，        │     │ (异步获取完整实例) │                   │
│  │  Promise 包装)    │     │                   │                   │
│  └───────────────────┘     └───────────────────┘                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                              ↓ await (单一 graph 参数)
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 3: 行为层（使用单一接口）                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  规则引擎: RuleContext.graph = GraphStore                           │
│  方法工具: await graph.getBaseNode() → node[method]()               │
│  实体链接: await graph.getBaseNode()                                │
│                                                                     │
│  BaseNode 实例（仍保留方法执行能力，但获取方式变成异步）                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**简化后的接口**：
- 单一 `GraphStore` 接口，包含数据 + 实例方法
- 所有组件只需传入一个 `graph: GraphStore` 参数
- 不再需要 `graph + container` 双参数模式

---

## Outstanding Questions

### Deferred to Planning

- [Affects R18-R19] 批量替换 `Graph` 类型导入的具体文件列表和改动策略
- [Affects R10] 每个规则的具体边遍历改写方案
- [Affects R20] 是否保留 `getOutEdges/getInEdges` 作为 InMemoryGraphStore 的私有内部方法（非接口）

---

## Next Steps

→ `/ce:plan` 进行实施规划