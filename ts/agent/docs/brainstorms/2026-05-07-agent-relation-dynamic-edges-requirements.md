---
date: 2026-05-07
topic: agent-relation-dynamic-edges
---

# @agentRelation 动态边设计

## Problem Frame

当前 V6 架构中，边存储在 `Graph.edges[]`，是静态数据事实。业务落地时，边数据实际来自数据库查询（如 `Reader.borrows Book` 的关系存储在 `borrows` 表）。

**问题**：
- 静态 edges 无法适配大规模业务数据库场景
- RelationSchema 手动定义，与实体类定义分离，维护成本高
- 缺少实体方法绑定数据库查询的机制

**目标**：引入 `@agentRelation` 装饰器，让实体类声明式定义 RelationSchema，并实现边查询逻辑（绑定数据库查询）。

---

## Requirements

**装饰器设计**

- R1. 引入 `@agentRelation` 装饰器，参数包括 `type`, `toType`, `description`，自动注册到 AgentRegistry
- R2. 装饰器标记的方法返回 `string[]`（目标节点 ID 列表），由业务实现数据库查询逻辑
- R3. `fromType` 自动推断为实体类名，不需要手动声明

**Graph 混合模式**

- R4. Graph 保留 `edges[]` 存储静态边（适用于配置数据、测试场景）
- R5. `getOutEdges(nodeId)` 合并静态 edges + 动态方法结果（去重）
- R6. 移除 `getInEdges`，反向查询由业务定义反向关系（如 `Book.borrowedBy`）

**RelationSchema 管理**

- R7. `buildOntology()` 从 AgentRegistry 自动派生 RelationSchema，不再需要手动定义 `relations[]`
- R8. AgentRegistry 提供 `getRelationsForClass(className)` 查询方法列表

**BaseNode 辅助函数**

- R9. BaseNode 提供 `getRelations()` 方法，返回该节点的 RelationSchema 列表（类似现有 `getCapabilities()`）

**Agent Tools 适配**

- R10. `inspect_node` 移除 `inEdges` 字段，只返回 `outEdges`
- R11. `query_neighbors` 移除 `direction: 'in' | 'both'`，只支持 `direction: 'out'`

---

## Success Criteria

- 实体类能够通过 `@agentRelation` 定义关系并绑定数据库查询
- `buildOntology()` 自动派生 RelationSchema，无需手动维护 `relations[]`
- Agent 通过 `inspect_node` 获取 `outEdges`，数据来自静态 edges + 动态方法合并
- 反向查询通过业务定义反向关系实现（如 `Book.borrowedBy`），而非 `getInEdges`

---

## Scope Boundaries

- **排除**：FactStore、PolicyContext（不在讨论范围）
- **排除**：Agent Loop 架构（不在讨论范围）
- **排除**：规则引擎 C（不在讨论范围）
- **排除**：性能优化（缓存、批量查询等）

---

## Key Decisions

- **边的本质**：动态计算（实体查询 DB），而非静态存储
- **方向性**：必要（外键方向），`borrows` 和 `borrowedBy` 是两个独立的关系
- **反向边**：由业务定义反向关系，而非 Graph.getInEdges
- **Graph.edges**：保留，混合模式（静态 + 动态）
- **getOutEdges**：合并静态 edges + 动态方法结果
- **RelationSchema**：自动从 Registry 派生

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Needs research] 合并逻辑中的去重策略：基于 nodeId 还是基于 edge hash？
- [Affects R2][Technical] 动态方法返回类型：`string[]` vs `Record<string, string[]>` vs `{ nodeId: string, metadata?: any }[]`
- [Affects R7][Technical] `buildOntology()` 如何处理静态边的 RelationSchema（未通过装饰器定义）
- [Affects R4][Technical] 静态边的 `addEdge()` 验证逻辑：是否仍需 RelationSchema 验证？

---

## Next Steps

→ `/ce:plan` for structured implementation planning