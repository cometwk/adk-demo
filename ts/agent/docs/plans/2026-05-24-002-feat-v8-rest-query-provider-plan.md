---
title: feat: V8 RestQueryProvider Migration
type: feat
status: active
date: 2026-05-24
origin: src/v8/docs/rest-query/design.md
---

# feat: V8 RestQueryProvider Migration

## Overview

将 V6 的 `src/v6/provider/rest` 重构到 V8 的 `src/v8/provider/rest-query`，实现两阶段设计：
- **Phase 1**：架构迁移（standalone），保持原有功能
- **Phase 2**：Runtime Orchestrator 集成（后续）

## Problem Frame

V6 的 `RestGraphStore` 提供远程 REST API 图查询能力，需要迁移到 V8 架构以：
- 复用 V8 engine 模块的 ID 编解码、ToolResult envelope、PolicyContext
- 遵循 V8 的 GraphStore 接口契约
- 为后续 Runtime Orchestrator 集成做准备

## Requirements Trace

- R1. 实现 V8 `GraphStore` 接口（getNode, findNodes, getNeighbors, getEdgeSummary, query）
- R2. 复用 engine 模块的 `parseGlobalId/toGlobalId`，不重新定义
- R3. 保持 RestAccessBinding 绑定机制，与 Ontology 独立并行
- R4. HTTP 客户端保持全局 axios 配置（Phase 1）
- R5. nodeCache 仅缓存 BaseNode 实例，不缓存原始数据（Phase 1 缓存协议）
- R6. query 方法实现 MATCH → TRAVERSE → RETURN 三阶段执行

## Scope Boundaries

- **不包含**：Ontology 模块集成（Ontology 仅用于 Prompt 生成）
- **不包含**：Runtime Orchestrator 集成（Phase 2）
- **不包含**：CacheStore 管理（Phase 2）
- **不包含**：FactStore 自动注入（Phase 2）

## Context & Research

### Relevant Code and Patterns

**V6 源文件**：
- `src/v6/provider/rest/RestGraphStore.ts` - 核心实现
- `src/v6/provider/rest/types.ts` - RestAccessBinding, AccessContext 类型
- `src/v6/provider/rest/helpers.ts` - 过滤转换、邻居构建
- `src/v6/provider/rest/api-search.ts` - API 搜索封装
- `src/v6/provider/rest/axios.ts` - HTTP 客户端配置

**V8 接口定义**：
- `src/v8/engine/stores/graph-store.ts` - GraphStore 接口
- `src/v8/engine/runtime/types.ts` - NodeData, NeighborData, ToolResult, parseGlobalId, toGlobalId
- `src/v8/engine/query/graph-query.ts` - GraphTraversalQuery schema
- `src/v8/engine/query/filters.ts` - matchesFilters, projectFields
- `src/v8/policy/context.ts` - PolicyContext, OPEN_POLICY
- `src/v8/policy/filters.ts` - checkEntityAccess, checkTypeAccess, redactProperties

**V8 参考实现**：
- `src/v8/engine/impl/in-memory-graph.ts` - query 方法实现模式

### Institutional Learnings

- **绑定 key 格式**：`${fromType}:${relation}:${direction}` 已验证
- **getBaseNode async 模式**：先获取数据再创建实例，消除"空壳+预水合"
- **过滤器映射**：`GRAPH_FILTER_TO_API_OP` 映射表已验证
- **HTTP 客户端隔离**：设计审查指出全局 axios 池染问题，但 Phase 1 保持不变
- **404 黑名单**：设计审查指出永久黑名单风险，Phase 1 保持不变但需记录

### External References

- V8 design document: `src/v8/docs/rest-query/design.md`
- V8 design review: `src/v8/docs/rest-query/design-review.md`

## Key Technical Decisions

- **命名空间**：`RestQueryProvider`（与 V8 其他命名风格一致）
- **types.ts 拆分**：拆分为 `bindings.ts` + `context.ts`
- **ID 函数复用**：导入 engine 模块的 `parseGlobalId/toGlobalId`，移除 helpers.ts 中的定义
- **query 实现**：参考 InMemoryGraphStore 的三阶段执行模式
- **缓存协议**：Phase 1 nodeCache 仅缓存 BaseNode 实例，Agent 运行周期结束清空

## Open Questions

### Resolved During Planning

- **query 方法契约**：已确认 V8 GraphStore 接口包含 `query` 方法，返回 `ToolResult<GraphQueryResult>`
- **ID 编解码来源**：已确认复用 engine 模块导出
- **缓存演进协议**：已定义 Phase 1/Phase 2 缓存策略差异

### Deferred to Implementation

- **具体 query 实现细节**：需参考 InMemoryGraphStore，适配 REST API 获取模式
- **fetchMany 实现**：V6 代码中有测试 throw 语句阻塞执行，需移除恢复批量查询逻辑
- **404 黑名单 TTL**：Phase 2 可考虑 TTL-based 临时黑名单

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```text
┌─────────────────────────────────────────────────────┐
│                   RestQueryProvider                  │
│              (Standalone GraphStore Impl)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────┐     ┌─────────────────────┐   │
│  │ RestQueryProvider│────▶│ RestAccessBinding   │   │
│  │ (Core Store)    │     │ (Relation Config)   │   │
│  └────────┬────────┘     └─────────────────────┘   │
│           │                                         │
│           │ fetch nodes                             │
│           ▼                                         │
│  ┌─────────────────┐     ┌─────────────────────┐   │
│  │  ApiSearchLayer │────▶│  HttpClient         │   │
│  │ (Search/Query)  │     │  (axios + token)    │   │
│  └─────────────────┘     └─────────────────────┘   │
│                                                     │
│  Imports from engine:                               │
│  - parseGlobalId, toGlobalId                        │
│  - toolOk, toolErr                                  │
│  - OPEN_POLICY, PolicyContext                       │
│  - matchesFilters, projectFields                    │
└                                                     │
└─────────────────────────────────────────────────────┘
```

## Implementation Units

- [ ] **Unit 1: Create bindings.ts and context.ts**

**Goal:** 定义 RestAccessBinding 和 AccessContext 类型，从 V6 types.ts 拆分

**Requirements:** R3

**Dependencies:** None

**Files:**
- Create: `src/v8/provider/rest-query/bindings.ts`
- Create: `src/v8/provider/rest-query/context.ts`

**Approach:**
- bindings.ts: RestEntityType, RestAccessBinding, RestAccessBindingMap, CustomHandler, RestNodeClassRegistry
- context.ts: AccessContext 类型定义，导入 NodeData, NeighborData, Paginated 等类型

**Patterns to follow:**
- `src/v6/provider/rest/types.ts` 类型定义
- V8 类型命名约定：`*Opts`, `*Data`, `*Result`

**Test scenarios:**
- Happy path: 类型定义编译通过，导入无循环依赖

**Verification:**
- TypeScript 编译无错误，类型导入正确

---

- [ ] **Unit 2: Create helpers.ts**

**Goal:** 辅助函数迁移，移除 ID 编解码函数（复用 engine）

**Requirements:** R2

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/provider/rest-query/helpers.ts`

**Approach:**
- 迁移 `filtersToSearchParams`（添加防御性默认值 `_limit`, `_offset`）
- 迁移 `rawIdOf`, `matchesNeighborFilters`, `neighborsFromNodes`
- **不包含** `parseGlobalId`, `toGlobalId`（从 engine 导入）

**Patterns to follow:**
- `src/v6/provider/rest/helpers.ts` 实现模式
- 设计文档中的 NaN 修复方案

**Test scenarios:**
- Happy path: `filtersToSearchParams(undefined, undefined, undefined, undefined)` 返回有效默认值
- Edge case: `filtersToSearchParams(filters, fields, 20, 100)` 正确计算 page=5
- Edge case: `filtersToSearchParams(filters, fields, undefined, undefined)` 不产生 NaN

**Verification:**
- 函数签名与 V6 一致，添加默认值处理

---

- [ ] **Unit 3: Create api-search.ts**

**Goal:** API 搜索层迁移，保持 404 错误处理逻辑

**Requirements:** R1

**Dependencies:** Unit 2 (helpers.ts 需要 api-search 导入 SearchParams 类型)

**Files:**
- Create: `src/v8/provider/rest-query/api-search.ts`

**Approach:**
- 迁移 `apiSearch`, `apiSearchSafe`, `apiSearchArraySafe`, `emptyPaginated`, `isNotFoundError`, `resetUnavailablePrefixes`
- 保持 `unavailablePrefixes` Set 逻辑（Phase 1）

**Patterns to follow:**
- `src/v6/provider/rest/api-search.ts` 实现

**Test scenarios:**
- Happy path: `apiSearchSafe('/merch', { pagesize: 20 })` 返回 Paginated 结果
- Error path: 404 错误触发 prefix 黑名单，后续请求返回空结果
- Edge case: `resetUnavailablePrefixes()` 清空黑名单

**Verification:**
- API 搜索函数正常工作，404 处理正确

---

- [ ] **Unit 4: Create http-client.ts**

**Goal:** HTTP 客户端迁移，保持全局 axios 配置

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `src/v8/provider/rest-query/http-client.ts`

**Approach:**
- 迁移 axios 全局配置、拦截器、token 管理
- 导出 `SearchParams`, `SearchParamsSchema`, `TableData` 类型

**Patterns to follow:**
- `src/v6/provider/rest/axios.ts` 实现

**Test scenarios:**
- Happy path: axios.defaults.baseURL 正确设置
- Integration: 请求拦截器自动注入 token
- Error path: 401/403 响应抛出特定错误消息

**Verification:**
- HTTP 客户端配置正确，token 管理正常

---

- [ ] **Unit 5: Create RestQueryProvider.ts**

**Goal:** 核心类实现，完整实现 GraphStore 接口

**Requirements:** R1, R2, R5, R6

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4

**Files:**
- Create: `src/v8/provider/rest-query/RestQueryProvider.ts`
- Test: `src/v8/provider/rest-query/tests/RestQueryProvider.test.ts`

**Approach:**
- 导入 `parseGlobalId, toGlobalId, toolOk, toolErr, OPEN_POLICY` from `../../engine`
- 实现 `getNode`, `getBaseNode`, `findNodes`, `getNeighbors`, `getEdgeSummary`
- 实现 `query` 方法（MATCH → TRAVERSE → RETURN 三阶段）
- nodeCache 仅缓存 BaseNode 实例

**Execution note:** 参考 InMemoryGraphStore 的 query 实现，适配 REST API 获取

**Patterns to follow:**
- `src/v6/provider/rest/RestGraphStore.ts` 核心实现
- `src/v8/engine/impl/in-memory-graph.ts` query 执行模式
- 设计文档中的 getBaseNode 修复（parseGlobalId + NodeClass 校验）

**Test scenarios:**
- Happy path: `getNode('Merch:M001')` 返回 NodeData
- Happy path: `getBaseNode('Merch:M001')` 返回填充属性的 BaseNode 实例
- Happy path: `findNodes({ type: 'Merch' })` 返回 Paginated<NodeData>
- Happy path: `getNeighbors('Merch:M001', { relation: 'for_agent' })` 返回邻居
- Happy path: `query({ match: { type: 'Merch' }, return: {} })` 执行三阶段查询
- Error path: 无效 ID 返回 undefined
- Error path: 不支持的关系抛出错误
- Edge case: nodeCache 缓存 BaseNode 实例，多次调用返回缓存

**Verification:**
- 所有 GraphStore 方法正常工作，query 执行正确

---

- [ ] **Unit 6: Create index.ts and finalize exports**

**Goal:** 公共导出，完成模块结构

**Requirements:** R1

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4, Unit 5

**Files:**
- Create: `src/v8/provider/rest-query/index.ts`

**Approach:**
- 导出 RestQueryProvider 类
- 导出类型：RestAccessBinding, RestAccessBindingMap, AccessContext, RestNodeClassRegistry
- 导出辅助函数：filtersToSearchParams, rawIdOf, neighborsFromNodes
- 导出 API 搜索：apiSearch, apiSearchSafe

**Patterns to follow:**
- `src/v6/provider/rest/index.ts` 导出模式
- V8 engine index.ts 导出风格

**Test scenarios:**
- Happy path: `import { RestQueryProvider } from './rest-query'` 编译通过

**Verification:**
- 模块导入导出正确，无循环依赖

---

- [ ] **Unit 7: Unit tests**

**Goal:** 复用 V6 测试模式，验证核心功能

**Requirements:** R1, R6

**Dependencies:** Unit 5

**Files:**
- Create: `src/v8/provider/rest-query/tests/RestQueryProvider.test.ts`
- Create: `src/v8/provider/rest-query/tests/helpers.test.ts`

**Approach:**
- 测试 RestQueryProvider 核心方法
- 测试 helpers.ts 辅助函数（特别是 NaN 防护）
- 测试 query 执行流程

**Patterns to follow:**
- V8 engine tests 目录结构
- InMemoryGraphStore 测试模式

**Test scenarios:**
- 见 Unit 5 和 Unit 2 测试场景

**Verification:**
- 所有测试通过

## System-Wide Impact

- **Interaction graph**: 无回调、middleware、observer 影响（standalone 模块）
- **Error propagation**: ToolResult envelope 模式，错误通过 `toolErr` 返回
- **State lifecycle risks**: nodeCache 需在 Agent 运行周期结束时清空（Phase 1 约束）
- **API surface parity**: 保持 V6 RestGraphStore 方法签名，新增 query 方法
- **Integration coverage**: Phase 2 Runtime 集成测试（不在本计划范围）
- **Unchanged invariants**: HTTP 客户端全局配置、RestAccessBinding 绑定机制不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 全局 axios 池染（P1-3） | 仅记录，Phase 1 不处理 |
| 硬编码凭证（P1-4） | 仅记录，Phase 1 不处理 |
| 永久 404 黑名单（P1-5） | 仅记录，Phase 1 不处理 |
| fetchMany 测试错误代码阻塞 | 移除 V6 中的测试 throw 语句，恢复批量查询实现逻辑 |
| query 执行复杂度 | 参考 InMemoryGraphStore，适配 REST API |

## Documentation / Operational Notes

- 设计文档：`src/v8/docs/rest-query/design.md`
- Phase 2 缓存协议：见设计文档第 8 节
- 安全问题待处理：见 `design-review.md`

## Sources & References

- **Origin document:** [src/v8/docs/rest-query/design.md](src/v8/docs/rest-query/design.md)
- V6 implementation: `src/v6/provider/rest/`
- V8 interfaces: `src/v8/engine/stores/graph-store.ts`, `src/v8/engine/runtime/types.ts`
- V8 query pattern: `src/v8/engine/impl/in-memory-graph.ts`
- V8 policy: `src/v8/policy/context.ts`, `src/v8/policy/filters.ts`