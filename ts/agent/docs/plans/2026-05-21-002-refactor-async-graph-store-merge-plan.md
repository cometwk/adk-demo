---
title: refactor: 合并 GraphStore 与 NodeInstanceContainer 接口，异步化规则引擎
type: refactor
status: active
date: 2026-05-21
origin: docs/brainstorms/2026-05-21-async-evaluator-architecture-refactor-requirements.md
---

# refactor: 合并 GraphStore 与 NodeInstanceContainer 接口，异步化规则引擎

## Overview

将 `NodeInstanceContainer` 合并入 `GraphStore` 接口，将规则引擎 evaluator 改为异步，消除 `type Graph = InMemoryGraphStore` 别名，实现统一的异步架构。

## Problem Frame

当前存在两个同步接口阻碍架构统一：
1. `type Graph = InMemoryGraphStore` 别名让规则引擎依赖具体实现类
2. `NodeInstanceContainer` 与 `GraphStore` 分离，需要两个参数，增加调用复杂度

用户已在 brainstorm 中决定合并接口，简化架构为单一 `GraphStore` 接口。

## Requirements Trace

- R1-R5: GraphStore 接口合并（Phase 1）
- R6-R10: 规则引擎异步化（Phase 2）
- R11-R13: 调用链改造（Phase 3）
- R14-R15: 工具层改造（Phase 4）
- R16-R17: 前端改造（Phase 5）
- R18-R20: 别名消除（Phase 6）

## Scope Boundaries

**不在范围内：**
- 性能优化（异步开销暂时接受）
- BaseNode 类本身的改造（仍保留方法执行能力）
- FactStore 的改造（已经是同步内存操作）
- src/ex/ 目录下的 demo 规则文件（需单独处理）

## Context & Research

### Relevant Code and Patterns

- **GraphStore 接口定义**: `src/v6/runtime/graph-store.ts`
- **NodeInstanceContainer 接口**: 同上文件，需合并
- **InMemoryGraphStore 实现**: `src/v6/provider/in-memory.ts`
- **RestGraphStore 实现**: `src/v6/provider/rest/RestGraphStore.ts`
- **规则引擎**: `src/v6/ontology/ruleDag.ts`, `rules.ts`
- **Critic**: `src/v6/agent/critic.ts`, `criticPredictive.ts`
- **工具**: `src/v6/agent/tools/method.ts`
- **前端**: `src/v6/frontend/entityLinker.ts`

### Institutional Learnings

- docs/design/TODO-1.md 详细分析了同步/异步架构差异
- docs/design/1-graph-layers.md 定义了三层模型（Ontology → GraphStore → Behavior）
- 用户决策：接受异步开销，简化为单一接口

## Key Technical Decisions

- **Decision: GraphStore 与 NodeInstanceContainer 合并**
  - 合并为单一接口，包含 `getBaseNode()` 异步方法
  - 简化调用，不再需要 `graph + container` 双参数

- **Decision: getBaseNode 改为异步**
  - 返回 `Promise<BaseNode | undefined>`
  - InMemoryGraphStore 内部同步实现，Promise 包装
  - RestGraphStore 异步获取完整实例，消除"空壳 + 预水合"

- **Decision: 规则 evaluator 改为异步**
  - 类型匹配改用 `NodeData.type`（异步获取）
  - 边遍历改用 `await graph.getNeighbors()`

- **Decision: 删除 getOutEdges/getInEdges**
  - 这些同步方法从 InMemoryGraphStore 删除
  - 边遍历统一用异步 `getNeighbors()`

- **Decision: 删除 Graph 别名**
  - 删除 `export type Graph = InMemoryGraphStore`
  - 所有导入改为 `GraphStore` 或具体类名

## Open Questions

### Resolved During Planning

- **是否合并接口？**: 用户已决定合并（见 origin 文档）
- **类型匹配方式？**: 改用 `NodeData.type` 字符串（见 origin 文档 R9）
- **是否保留 getOutEdges/getInEdges？**: 删除（见 origin 文档 R20）

### Deferred to Implementation

- **src/ex/rules.ts 中的 demo 规则具体改写方案**: 需查看每个规则的降级路径
- **RestGraphStore 异步 getBaseNode 的完整实现细节**: 可能需要新增 REST 端点

## Implementation Units

- [ ] **Unit 1: 合并 GraphStore 接口**

**Goal:** 将 NodeInstanceContainer.getBaseNode() 合并入 GraphStore 接口，改为异步

**Requirements:** R1, R2

**Dependencies:** 无

**Files:**
- Modify: `src/v6/runtime/graph-store.ts`
- Test: `src/v6/tests/1-graph/library/graph-query.test.ts`

**Approach:**
1. 在 GraphStore 接口中添加 `getBaseNode(id: string): Promise<BaseNode | undefined>`
2. 删除 NodeInstanceContainer 接口定义
3. 可选：添加 `export type NodeInstanceContainer = GraphStore` 向后兼容别名

**Patterns to follow:**
- 保持现有的 NodeData、NeighborData DTO 类型不变

**Test scenarios:**
- Happy path: `await graphStore.getBaseNode('Reader:001')` 返回 BaseNode 实例
- Edge case: 不存在的 ID 返回 undefined

**Verification:**
- 接口定义编译无错误
- InMemoryGraphStore 和 RestGraphStore 能实现新接口

---

- [ ] **Unit 2: InMemoryGraphStore 异步化**

**Goal:** InMemoryGraphStore.getBaseNode() 改为返回 Promise，删除 getOutEdges/getInEdges

**Requirements:** R3, R20

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/provider/in-memory.ts`
- Test: `src/v6/tests/1-graph/library/seed.ts`

**Approach:**
1. `getBaseNode()` 改为 async 方法，内部仍用 `this.nodes.get(id)` 同步实现
2. 删除 `getOutEdges()` 和 `getInEdges()` 方法
3. 删除 `export type Graph = InMemoryGraphStore` 别名

**Test scenarios:**
- Happy path: `await store.getBaseNode(id)` 返回正确实例
- Integration: 内部方法（getNode、getNeighbors）仍能正确工作

**Verification:**
- 编译无错误
- 删除的方法不再被调用

---

- [ ] **Unit 3: RestGraphStore 异步化**

**Goal:** RestGraphStore.getBaseNode() 异步获取完整实例，删除 populateNodeProperties

**Requirements:** R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/provider/rest/RestGraphStore.ts`
- Test: `src/v6/tests/1-graph/restapi/demo.ts`

**Approach:**
1. `getBaseNode()` 改为 async，先获取数据再创建实例
2. 删除 `populateNodeProperties()` 方法
3. 删除 `nodeCache` 中的"空壳"逻辑（或改为完整实例缓存）

**Test scenarios:**
- Happy path: `await store.getBaseNode('Reader:001')` 返回带属性的完整实例
- Error path: REST API 不可用时返回 undefined 或抛出错误
- Integration: 方法执行 `node.someMethod()` 能正确调用

**Verification:**
- 不需要预水合，实例直接可用

---

- [ ] **Unit 4: 规则引擎异步化**

**Goal:** RuleContext.graph 改为 GraphStore，evaluator 改为 async

**Requirements:** R6, R7, R8, R9

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/v6/ontology/rules.ts` (RuleContext 类型)
- Modify: `src/v6/ontology/ruleDag.ts` (evaluateRuleDag 函数)
- Test: `src/v6/tests/` （需确认测试文件）

**Approach:**
1. `RuleContext.graph` 类型从 `Graph` 改为 `GraphStore`
2. `Rule.evaluator` 改为 `(ctx: RuleContext) => Promise<RuleResult>`
3. `evaluateRuleDag` 改为 async 函数
4. 类型匹配改用 `const nodeData = await graph.getNode(eid); rule.appliesTo.includes(nodeData.type)`

**Test scenarios:**
- Happy path: 异步规则评测正确返回结果
- Integration: Critic 能正确调用异步的 evaluateRuleDag

**Verification:**
- 规则引擎只依赖 GraphStore 接口

---

- [ ] **Unit 5: 规则边遍历改写**

**Goal:** 规则 evaluator 中的 getOutEdges/getInEdges 改为 getNeighbors

**Requirements:** R10

**Dependencies:** Unit 4

**Files:**
- Modify: `src/ex/rules.ts` (demo 规则中的 C2, C7, S2)
- Note: 这是 demo 文件，需单独处理

**Approach:**
1. C2 规则：`ctx.graph.getOutEdges(entityId)['overdue']` 改为 `await ctx.graph.getNeighbors(entityId, { relation: 'overdue' })`
2. C7 规则：`ctx.graph.getInEdges(entityId)['reserves']` 改为 `await ctx.graph.getNeighbors(entityId, { relation: 'reserves', direction: 'in' })`
3. S2 规则：类似处理

**Test scenarios:**
- Happy path: 边遍历降级路径正确计算边数量

**Verification:**
- 规则不再调用 getOutEdges/getInEdges

---

- [ ] **Unit 6: Critic 异步化**

**Goal:** runPredictiveCritic 和 runCritic 改为 async

**Requirements:** R11, R12

**Dependencies:** Unit 4

**Files:**
- Modify: `src/v6/agent/critic.ts`
- Modify: `src/v6/agent/criticPredictive.ts`

**Approach:**
1. `runPredictiveCritic` 改为 async，内部 await evaluateRuleDag
2. `runCritic` 改为 async，返回 `Promise<CriticOutput>`

**Test scenarios:**
- Happy path: Critic 正确返回 SystemVerdict
- Integration: Executor 能正确调用异步的 runCritic

**Verification:**
- Critic 完全异步化

---

- [ ] **Unit 7: 工具层改造**

**Goal:** method.ts 参数简化为单一 GraphStore，使用 await getBaseNode

**Requirements:** R14, R15

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/v6/agent/tools/method.ts`

**Approach:**
1. `createMethodTools(container, facts, policy)` 改为 `createMethodTools(graph, facts, policy)`
2. 内部 `container.getBaseNode()` 改为 `await graph.getBaseNode()`
3. tool.execute 本身是 async，可直接 await

**Test scenarios:**
- Happy path: call_method 正确执行 BaseNode 方法
- Error path: 节点不存在返回 NOT_FOUND

**Verification:**
- method.ts 只依赖 GraphStore

---

- [ ] **Unit 8: 前端 entityLinker 异步化**

**Goal:** entityLinker 参数简化，link() 改为 async

**Requirements:** R16, R17

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/frontend/entityLinker.ts`

**Approach:**
1. `createEntityLinker(graph: InMemoryGraphStore)` 改为 `createEntityLinker(graph: GraphStore)`
2. `link()` 改为 async，使用 `await graph.getBaseNode()`
3. 注意：linkEntities 本身已经是 async

**Test scenarios:**
- Happy path: 实体链接正确返回 EntityLinkResult

**Verification:**
- entityLinker 只依赖 GraphStore

---

- [ ] **Unit 9: Executor 和其他调用点改造**

**Goal:** Executor 和其他调用 Graph/GraphStore 的地方适配新接口

**Requirements:** R13, R19

**Dependencies:** Unit 4, Unit 6, Unit 7

**Files:**
- Modify: `src/v6/agent/executor.ts`
- Modify: `src/v6/helper.ts`
- Modify: `src/v6/api.ts`
- Modify: `src/v6/frontend/index.ts`
- Modify: `src/v6/index.ts`

**Approach:**
1. 所有 `import { Graph }` 改为 `import { GraphStore }` 或具体类名
2. 所有 `graph: Graph` 参数改为 `graph: GraphStore`
3. executor.ts 中 await 规则引擎调用

**Test scenarios:**
- Integration: 整个调用链正确工作

**Verification:**
- 编译无错误
- Graph 别名完全删除

---

- [ ] **Unit 10: 清理和验证**

**Goal:** 确保所有改动正确，删除废弃代码

**Requirements:** R18, R20

**Dependencies:** Unit 1-9

**Files:**
- Verify all modified files

**Approach:**
1. 确认 Graph 别名已删除
2. 确认 getOutEdges/getInEdges 已删除
3. 确认 NodeInstanceContainer 接口已删除（或变为别名）
4. 确认 populateNodeProperties 已删除

**Test scenarios:**
- 全量测试通过

**Verification:**
- 编译无错误
- 测试通过

## System-Wide Impact

- **Interaction graph:** 所有使用 Graph/NodeInstanceContainer 的组件改为使用 GraphStore
- **Error propagation:** 异步错误通过 Promise 传播，调用方需要 await
- **API surface parity:** method.ts 和 entityLinker.ts 统一使用 GraphStore 参数
- **Integration coverage:** Executor → Critic → ruleDag → evaluator 全链路异步

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 异步开销影响性能 | 用户已接受（见 origin 文档） |
| src/ex/rules.ts demo 规则需单独处理 | 作为独立单元处理，不影响核心架构 |
| RestGraphStore 可能需要新的 REST 端点 | 异步获取完整实例，利用现有 fetchOne |
| 批量文件改动可能遗漏 | Unit 9 明确列出所有需改动的文件 |

## Sources & References

- **Origin document:** docs/brainstorms/2026-05-21-async-evaluator-architecture-refactor-requirements.md
- **Design analysis:** docs/design/TODO-1.md
- **Layer model:** docs/design/1-graph-layers.md
- **Existing interface:** src/v6/runtime/graph-store.ts