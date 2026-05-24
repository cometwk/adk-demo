---
title: feat: V8 rest-query demo case - payment domain
type: feat
status: active
date: 2026-05-24
origin: docs/brainstorms/2026-05-24-v8-rest-query-demo-case-requirements.md
---

# feat: V8 rest-query demo case - payment domain

## Overview

将 v6/tests/1-graph/restapi payment domain 场景移植到 v8/demo/case/rest，验证 V8 RestQueryProvider 和 ontology 模块的正确性。

## Problem Frame

V6 的 restapi 场景验证了 REST API GraphStore 实现。V8 引入了新的 RestQueryProvider 和 ontology 模块，需要将 payment domain 移植到新架构，验证实现完整性和正确性。(see origin: docs/brainstorms/2026-05-24-v8-rest-query-demo-case-requirements.md)

## Requirements Trace

- R1. 使用 v8 ontology registry/builder 模式定义 7 个实体类型
- R2. 定义实体属性和关系
- R3. 创建 ontology.ts 文件
- R4. 移植 access-bindings.ts 适配 v8 AccessContext
- R5. 保留所有关系绑定
- R6. 创建 bindings.ts 文件
- R7. 创建 typeRegistry 映射
- R8. 创建 context.ts 文件
- R9. 创建 demo.ts 演示 RestQueryProvider
- R10. 创建 demo.ts 文件
- R11. 创建 helpers.test.ts
- R12. 创建 RestQueryProvider.test.ts
- R13. 创建 tests 目录

## Scope Boundaries

- 不修改 v8 provider/rest-query 核心实现
- 不引入新的实体类型
- 不实现 ComputeStore/VectorStore（仅 GraphStore 验证）

## Context & Research

### Relevant Code and Patterns

- **v8 ontology 模块**: `src/v8/ontology/` - 使用 `@agentType`, `@agentProperty`, `@agentRelations` 装饰器定义实体
- **v8 RestQueryProvider**: `src/v8/provider/rest-query/RestQueryProvider.ts` - 实现 GraphStore 接口
- **v8 AccessContext**: `src/v8/provider/rest-query/context.ts` - 定义 RestAccessBindingMap, AccessContext 类型
- **v6 参考实现**: `src/v6/tests/1-graph/restapi/` - ontology.ts, access-bindings.ts, access-executor.ts

### Institutional Learnings

- RestQueryProvider 已有完整实现和测试，可直接复用
- v8 ontology 装饰器与 v6 类似，移植成本低

## Key Technical Decisions

- **Ontology 方式**: 使用 v8 `@agentType`, `@agentProperty`, `@agentRelations` 装饰器，复用 v6 的实体定义结构 (see origin)
- **Bindings 移植**: 保留 v6 的 search/custom 两种 binding kind，适配 v8 AccessContext 类型签名
- **Context 构建**: 使用 RestQueryProvider 的 buildAccessContext 机制，注入 typeRegistry

## Open Questions

### Resolved During Planning

- 无阻塞问题

### Deferred to Implementation

- 具体实体属性字段名称（从 v6 ontology.ts 复制）
- AccessContext 扩展方法的实现细节（agentsByIds, agentsByNos, merchsByIds）

## Implementation Units

- [ ] **Unit 1: Ontology 定义**

**Goal:** 使用 v8 ontology 模块定义 payment domain 实体

**Requirements:** R1, R2, R3

**Dependencies:** 无

**Files:**
- Create: `src/v8/demo/case/rest/ontology.ts`

**Approach:**
- 使用 `@agentType`, `@agentProperty`, `@agentRelations` 装饰器
- 定义 Agent, Merch, Apply, AgentRel, AgentClosure, OrderDaily, ProfitDaily
- 复用 v6 ontology.ts 的属性定义

**Patterns to follow:**
- `src/v6/tests/1-graph/restapi/ontology.ts` - 实体属性和关系定义
- `src/v8/ontology/decorator.ts` - 装饰器使用方式

**Test scenarios:**
- Integration: 运行 demo.ts 验证实体注册成功

**Verification:**
- 编译无错误，实体类可通过 AgentRegistry 查询

---

- [ ] **Unit 2: Access Bindings 移植**

**Goal:** 将 v6 access-bindings 移植为 v8 格式

**Requirements:** R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/demo/case/rest/bindings.ts`

**Approach:**
- 定义 PaymentAccessBindingMap 类型（扩展 RestAccessBindingMap）
- 移植所有 search/custom binding 定义
- 适配 AccessContext 类型签名（移除 PaymentAccessContext 扩展方法依赖）

**Patterns to follow:**
- `src/v6/tests/1-graph/restapi/access-bindings.ts` - binding 定义结构
- `src/v8/provider/rest-query/context.ts` - RestAccessBinding 类型

**Test scenarios:**
- Integration: 通过 RestQueryProvider.getNeighbors 验证 binding 执行

**Verification:**
- bindings 可被 RestQueryProvider 正确解析

---

- [ ] **Unit 3: Context 和 TypeRegistry**

**Goal:** 创建 typeRegistry 和 context 配置

**Requirements:** R7, R8

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/demo/case/rest/context.ts`

**Approach:**
- 创建 typeRegistry 映射实体类型到 API prefix 和 NodeClass
- 实现 agentsByIds, agentsByNos, merchsByIds 扩展方法（如需要）

**Patterns to follow:**
- `src/v6/tests/1-graph/restapi/access-executor.ts` - typeRegistry 定义
- `src/v8/provider/rest-query/RestQueryProvider.ts` - buildAccessContext

**Test scenarios:**
- Integration: RestQueryProvider 初始化成功

**Verification:**
- typeRegistry 包含所有 7 个实体类型

---

- [ ] **Unit 4: Demo 测试**

**Goal:** 创建演示文件验证 RestQueryProvider 功能

**Requirements:** R9, R10

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Create: `src/v8/demo/case/rest/demo.ts`

**Approach:**
- 创建 RestQueryProvider 实例
- 演示 findNodes, getNode, getNeighbors, getEdgeSummary
- 参考 v6 demo.ts 的测试流程

**Patterns to follow:**
- `src/v6/tests/1-graph/restapi/demo.ts` - 测试流程
- `src/v8/provider/rest-query/tests/RestQueryProvider.test.ts` - Provider 使用方式

**Test scenarios:**
- Integration: 查询 Agent 列表成功
- Integration: 查询单个 Agent 详情成功
- Integration: 遍历 Agent.children 关系成功
- Integration: 获取 Agent 边摘要成功

**Verification:**
- demo.ts 可运行并输出正确结果

---

- [ ] **Unit 5: 单元测试**

**Goal:** 创建单元测试验证移植正确性

**Requirements:** R11, R12, R13

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Create: `src/v8/demo/case/rest/tests/helpers.test.ts`
- Create: `src/v8/demo/case/rest/tests/RestQueryProvider.test.ts`

**Approach:**
- 复用 v8 provider/rest-query/tests 的测试模式
- 测试 filtersToSearchParams, neighborsFromNodes
- 测试 getNode, getBaseNode, getNeighbors, parseGlobalId

**Patterns to follow:**
- `src/v8/provider/rest-query/tests/helpers.test.ts` - 测试结构
- `src/v8/provider/rest-query/tests/RestQueryProvider.test.ts` - Provider 测试

**Test scenarios:**
- Happy path: filtersToSearchParams 正确转换参数
- Edge case: 空 filters 返回默认值
- Happy path: getNode 返回正确 NodeData
- Error path: 无效 ID 返回 undefined
- Happy path: getNeighbors 返回正确邻居列表

**Verification:**
- 所有测试通过，编译无错误

## System-Wide Impact

- **Interaction graph:** 新增 demo/case/rest 模块，不影响现有代码
- **Error propagation:** 使用 RestQueryProvider 内置错误处理
- **Unchanged invariants:** v8 provider/rest-query 核心实现不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| API 不可访问 | demo 依赖后端 API，需确保环境配置正确 |
| 实体定义遗漏 | 参考 v6 ontology.ts 完整复制属性 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-24-v8-rest-query-demo-case-requirements.md](docs/brainstorms/2026-05-24-v8-rest-query-demo-case-requirements.md)
- Related code: `src/v6/tests/1-graph/restapi/`
- Related code: `src/v8/provider/rest-query/`
- Related code: `src/v8/ontology/`