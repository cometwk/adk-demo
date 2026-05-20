---
title: refactor: RestGraphStore abstraction
type: refactor
status: completed
date: 2026-05-20
origin: docs/brainstorms/2026-05-20-rest-graph-store-abstraction-requirements.md
---

# refactor: RestGraphStore abstraction

## Overview

将 `RestCrudGraph.ts` 中的声明式 bindings 驱动逻辑抽象为通用基类 `RestGraphStore`，使业务代码只需定义 bindings 并传入构造函数。

## Problem Frame

当前 `RestCrudGraph.ts` 与 `paymentAccessBindings` 紧密耦合。需要分离：
- **通用逻辑** → `provider/rest/` 作为可复用基类
- **业务绑定** → 保留在 `tests/1-graph/restapi/`

## Requirements Trace

- R1. 创建 `src/v6/provider/rest/rest.ts`，定义 `RestGraphStore` 类实现 `GraphStore` 接口
- R2. 构造函数接受 `bindings: RestAccessBindingMap` 和 `typeToPrefix: Record<string, string>`
- R3. 构造函数可选接受 `accessContext?: Partial<AccessContext>` 用于扩展
- R4. 提供 `getNode`, `findNodes`, `getNeighbors`, `getEdgeSummary` 方法实现
- R5-R7. 类型定义迁移到 `provider/rest/rest.ts`，AccessContext 可扩展
- R8. `axios.ts` 移动到 `provider/rest/axios.ts`
- R9-R10. `RestCrudGraph` 继承 `RestGraphStore`，传入业务配置
- R11-R12. `executeAccessBinding` 保留在 `access-executor.ts`，引用 provider 类型
- R13-R17. 业务文件保留：bindings、DDL、types 等

## Scope Boundaries

- 不涉及 `paymentRelationBindings` 的 SqlGraphStore 逻辑
- 不修改 `ontology.ts` 实体定义
- 不修改 DDL 文件
- `bindings.ts` 中的 `paymentRelationBindings` 待删除（不在本次范围）

## Context & Research

### Relevant Code and Patterns

- `src/v6/provider/in-memory.ts` - 参考实现模式（GraphStore + NodeInstanceContainer）
- `src/v6/runtime/graph-store.ts` - 接口定义
- `docs/design/1-graph-layers.md` - 三层架构：Ontology → GraphStore → Behavior

### Key Architectural Constraints

- **三层模型**: GraphStore 是 Layer 2，不直接调用 BaseNode 方法
- **relation 必选**: `getNeighbors` 必须有 `relation` 参数
- **声明式 bindings**: `${type}:${relation}:${direction}` 索引模式

## Key Technical Decisions

- **继承模式**: `RestCrudGraph extends RestGraphStore`（非组合注入）- 简化子类实现
- **axios 位置**: 移动到 `provider/rest/axios.ts` 作为默认实现
- **TYPE_API_PREFIX 抽象**: 作为构造参数 `typeToPrefix` 传入
- **AccessContext 扩展**: 基础方法 + `partialAccessContext` 合成模式
- **executor 保留**: `executeAccessBinding` 不移入 provider，保留业务定制能力

### Resolved During Planning

- **AccessContext 基础方法范围**: `rawId`, `toGlobalId`, `apiSearch`, `apiSearchSafe`, `fetchOne`, `neighborsFromNodes`, `emptyNeighbors` - 足够通用
- **Import 路径设计**: `access-executor.ts` 从 `../../provider/rest/rest.ts` 导入类型

## Implementation Units

- [ ] **Unit 1: 创建 provider/rest 目录结构**

**Goal:** 建立目标目录，创建 axios.ts 和类型定义

**Requirements:** R5-R8

**Dependencies:** None

**Files:**
- Create: `src/v6/provider/rest/axios.ts` (移动自 `tests/1-graph/restapi/axios.ts`)
- Create: `src/v6/provider/rest/rest.ts` (类型定义 + RestGraphStore 类)

**Approach:**
- 创建 `src/v6/provider/rest/` 目录
- 移动 `axios.ts` 到新位置，保持内容不变
- 定义基础类型：`RestAccessBinding`, `RestAccessBindingMap`, `AccessContext`, `CustomHandler`
- 定义 `RestGraphStore` 类骨架

**Patterns to follow:**
- 参考 `in-memory.ts` 的构造函数模式

**Test scenarios:**
- (本单元主要是文件创建，测试在后续单元)

**Verification:**
- `src/v6/provider/rest/axios.ts` 存在且内容正确
- `src/v6/provider/rest/rest.ts` 存在且导出类型定义

---

- [ ] **Unit 2: 实现 RestGraphStore 基类**

**Goal:** 完成基类核心方法实现

**Requirements:** R1-R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/provider/rest/rest.ts`

**Approach:**
- 实现 `getNode`：解析 globalId → 使用 `fetchOne` helper
- 实现 `findNodes`：使用 `typeToPrefix` 映射 → `apiSearchSafe`
- 实现 `getNeighbors`：查找 binding → `executeAccessBinding`
- 实现 `getEdgeSummary`：遍历 bindings → 探测性调用
- 构造函数合成完整 `AccessContext`：基础 + `partialAccessContext`

**Patterns to follow:**
- 参考 `RestCrudGraph.ts` 现有实现逻辑
- 使用 `${type}:${relation}:${direction}` 键查找 binding

**Test scenarios:**
- Happy path: `getNode` 返回正确 NodeData
- Happy path: `findNodes` 分页正确
- Happy path: `getNeighbors` 通过 binding 返回邻居
- Edge case: unknown type 抛出错误
- Edge case: missing relation 抛出错误
- Error path: 404 endpoint 返回空分页（不崩溃）

**Verification:**
- 类型定义完整
- 所有方法实现
- 编译无错误

---

- [ ] **Unit 3: 重构 access-executor.ts**

**Goal:** 更新 executor 使用 provider 类型

**Requirements:** R11-R12

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/v6/tests/1-graph/restapi/access-executor.ts`

**Approach:**
- 更新 import：从 `../../provider/rest/rest.ts` 导入类型
- 保持 `executeAccessBinding` 逻辑不变
- 保持 `sharedAccessContext` 不变（业务专用 helper）
- 业务专用 helper (`agentsByIds`, `agentsByNos`, `merchsByIds`) 保留

**Patterns to follow:**
- 保持现有 executor 逻辑结构

**Test scenarios:**
- Integration: `executeAccessBinding` 正常执行 search binding
- Integration: `executeAccessBinding` 正常执行 custom binding
- Edge case: unknown binding kind 抛出错误

**Verification:**
- import 路径正确
- 编译无错误
- 现有测试 `bindings.test.ts` 通过

---

- [ ] **Unit 4: 重构 RestCrudGraph.ts**

**Goal:** 简化为继承 + 配置注入

**Requirements:** R9-R10, R14

**Dependencies:** Unit 2, Unit 3

**Files:**
- Modify: `src/v6/tests/1-graph/restapi/RestCrudGraph.ts`
- Modify: `src/v6/tests/1-graph/restapi/access-bindings.ts`

**Approach:**
- `RestCrudGraph` 继承 `RestGraphStore`
- 构造函数传入 `paymentAccessBindings`, `TYPE_API_PREFIX`
- 创建扩展 `AccessContext`（含业务专用方法）
- `TYPE_API_PREFIX` 移出 `search-helpers.ts` 到 `access-bindings.ts` 或新位置
- 简化导出

**Patterns to follow:**
- 继承模式，使用 `super()` 调用父类构造

**Test scenarios:**
- Integration: RestCrudGraph 实例正常创建
- Integration: getNode/getNeighbors/getEdgeSummary 正常工作
- Regression: 现有测试通过

**Verification:**
- `RestCrudGraph.ts` 代码量减少
- 功能与之前等效
- `search-helpers.test.ts` 通过

---

- [ ] **Unit 5: 清理和测试验证**

**Goal:** 删除冗余代码，确保测试通过

**Requirements:** R16, Success Criteria

**Dependencies:** Unit 4

**Files:**
- Modify: `src/v6/tests/1-graph/restapi/bindings.ts` (删除 `paymentRelationBindings`)
- Run: `search-helpers.test.ts`, `bindings.test.ts`

**Approach:**
- 删除 `bindings.ts` 中 `paymentRelationBindings` 定义和导出
- 运行所有相关测试
- 检查 import 路径一致性

**Test scenarios:**
- Regression: 所有现有测试通过
- Clean build: 无 TypeScript 错误

**Verification:**
- `paymentRelationBindings` 已删除
- 测试全部通过
- 无编译错误

## System-Wide Impact

- **Import 路径变化**: 多个文件需更新 import 路径
- **API 兼容**: RestCrudGraph 导出不变，保持向后兼容
- **Unchanged invariants**: GraphStore 接口不变，ontology.ts 不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| import 路径错误导致编译失败 | 逐文件检查，使用 TypeScript 编译验证 |
| 测试依赖旧路径 | 更新测试文件 import |
| AccessContext 合成逻辑复杂 | 使用 spread 合成，保持简单 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-20-rest-graph-store-abstraction-requirements.md](docs/brainstorms/2026-05-20-rest-graph-store-abstraction-requirements.md)
- Architecture: `docs/design/1-graph-layers.md`
- Interface: `src/v6/runtime/graph-store.ts`
- Reference impl: `src/v6/provider/in-memory.ts`