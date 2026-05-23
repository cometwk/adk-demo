---
title: "feat: V8 Ontology Module — Schema/Registry/Decorator/BaseNode/Tools"
type: feat
status: completed
date: 2026-05-24
origin: src/v8/docs/ontology/phase1-design.md
---

# feat: V8 Ontology Module — Schema/Registry/Decorator/BaseNode/Tools

## Overview

实现 V8 Ontology 模块（Layer 1 — T），包含 Schema 体系、Registry、Decorator 声明、BaseNode、Ontology Builder、RelationBinding + Validation、Tools 和 System Prompt 集成。核心变更：BaseNode 通过 NodeInstanceContainer 接口解耦，移除 V6 的 WeakMap 模式；`agentVisible` 默认值改为 `true`；新增 `validateOntology()` 跨引用校验。

## Problem Frame

V6 的 Ontology/Runtime 三位一体（代码类结构 = Ontology Schema = Runtime Node Shape）导致生命周期耦合问题。V8 通过三层解耦设计解决：Ontology（DDL）独立定义类型和关系，GraphStore（DML）负责数据查询，BaseNode（行为层）承载业务方法。(see origin: src/v8/docs/ontology/phase1-design.md)

## Requirements Trace

- R1. TypeSchema/RelationSchema/Ontology 类型定义 + 辅助函数
- R2. AgentTypeRegistry/AgentPropertyRegistry/AgentMethodRegistry/AgentRelationRegistry 实现
- R3. AgentRegistry Facade 统一访问所有 Registry
- R4. @agentType/@agentProperty/@agentMethod/@agentRelations 装饰器实现
- R5. BaseNode 抽象类（移除 WeakMap，通过 NodeInstanceContainer 解耦）
- R6. NodeInstanceContainer 接口定义（异步 getBaseNode）
- R7. buildOntology() 构建 Ontology（含 validateOntology 跨引用校验）
- R8. RelationBinding 类型定义（junction/fk/inverse_fk）
- R9. validateRelationBindings() 校验 Schema 与 Binding 一致性
- R10. validateOntology() 跨引用校验（fromType/toType 必须存在于 types）
- R11. inspect_schema 工具查询本体 Schema
- R12. describe_method 工具获取方法 Schema
- R13. call_method 工具调用 BaseNode 方法（含前置条件校验、Policy 检查）
- R14. buildOntologyPrompt() 生成 Agent System Prompt 片段
- R15. agentVisible 默认值改为 true（V6 为 false）
- R16. agentTypeName 属性写入 prototype（防止 minification 失效）
- R17. Zod v4 兼容（schemaToJsonSchema 使用全局函数）

## Scope Boundaries

- 不实现 GraphStore 相关内容（已实现于 engine 模块）
- 不实现 Rule 规则相关内容（待后续 Phase 处理）
- 不实现 SqlGraphStore（ontology 模块仅定义 RelationBinding 类型）
- 不实现 CacheStore（移出 Phase 1）
- 不实现 VectorStore 完整搜索（仅接口 stub 于 engine）

## Context & Research

### Relevant Code and Patterns

- `src/v6/ontology/schema.ts` — TypeSchema/RelationSchema/Ontology 类型定义，直接移植
- `src/v6/runtime/registry.ts` — 四大 Registry + AgentRegistry Facade，直接移植
- `src/v6/runtime/decorator.ts` — Decorator 模式，需修改 agentVisible 默认值 + agentTypeName
- `src/v6/runtime/graph.ts` — BaseNode 类，移除 WeakMap 相关代码
- `src/v6/ontology/relation-binding.ts` — RelationBinding 类型，直接移植
- `src/v6/ontology/validate-bindings.ts` — validateRelationBindings()，直接移植
- `src/v6/runtime/ontology-builder.ts` — buildOntology()，需添加 validateOntology()
- `src/v6/agent/tools/method.ts` — describe_method/call_method，需改用 NodeInstanceContainer
- `src/v6/agent/tools/ontology.ts` — inspect_schema，适配 V8 tool 体系
- `src/v8/engine/runtime/types.ts` — ToolResult/toolOk/toolErr 类型（已实现）
- `src/v8/policy/filters.ts` — checkEntityAccess() Policy 检查（已实现）

### Institutional Learnings

- **Policy 应在数据层执行而非工具层** (来源: docs/design/x-drawback.md): V8 的 RuntimeOrchestrator 统一执行策略，ontology 的 method-tools 也需在 execute 中加入 Policy 检查
- **BaseNode 与 Store 解耦** (来源: docs/design/TODO-1.md): GraphStore = 纯数据 DTO，NodeInstanceContainer = 行为实例容器。V8 BaseNode 不感知 Store
- **@agentRelations 类级装饰器终态** (来源: docs/design/1-graph-layers.md): 使用类级装饰器而非方法级，移除 BaseNode.resolveRelation
- **Ontology 三位一体缺陷** (来源: docs/design/x-drawback.md): V8 通过三层解耦避免生命周期耦合
- **图做深度，OLAP 做广度** (来源: docs/design/1-graph-and-aggregation.md): GraphStore traversal，ComputeStore aggregation，两者职责清晰分离

### External References

- 不需要外部研究，代码库有充分的 V6 本地模式

## Key Technical Decisions

- **Registry 全局静态模式保留**: 装饰器副作用自动注册，提供 `AgentRegistry.clear()` 测试清理便捷入口 (see origin: Section 3.1)
- **agentVisible 默认值改为 true**: V8 Agent 主导设计，属性默认可见更合理 (see origin: Section 2.3)
- **BaseNode 移除 WeakMap**: V8 通过 NodeInstanceContainer 接口解耦，BaseNode 不再感知 GraphStore (see origin: Section 5.3)
- **类级 @agentRelations**: 替代已废弃的方法级 @agentRelation，Decorator 更简洁 (see origin: Section 4.5)
- **validateOntology 新增**: 跨引用校验防止 RelationSchema.fromType/toType typo 导致 runtime 崩溃 (see origin: Section 6.2)
- **NodeInstanceContainer 异步接口**: 返回 Promise<BaseNode>，适配未来 SQL/REST 远程恢复场景 (see origin: Section 5.4)
- **Zod v4 schemaToJsonSchema**: 使用全局函数 `z.toJSONSchema(schema)` 替代实例方法

## Open Questions

### Resolved During Planning

- Registry 生命周期: 保留全局静态 + AgentRegistry.clear() (设计文档已明确)
- Decorator 模式: 类级 @agentRelations (设计文档已明确)
- BaseNode 解耦: NodeInstanceContainer 接口 (设计文档已明确)

### Deferred to Implementation

- schemaToJsonSchema 具体实现: 需验证 Zod v4 API 兼容性
- MethodPrecondition 校验的具体实现: 'must_be_positive' | 'must_be_in_facts' | 'must_be_non_empty_string' 的校验逻辑
- assertPreconditions 中 0 默认值防护与 FactStore 交互细节

## Implementation Units

- [ ] **Unit 1: Schema 类型定义**

**Goal:** 建立 Ontology 核心类型系统，为 Registry/Builder/Tools 提供基础

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `src/v8/ontology/schema.ts` — TypeProperty/TypeMethod/TypeSchema/RelationSchema/Ontology + 辅助函数

**Approach:**
- 从 V6 `ontology/schema.ts` 直接移植类型定义
- 新增 `getRelationByType()` 辅助函数（V6 无此函数）
- 保持其他接口不变（稳定 API）

**Patterns to follow:**
- `src/v6/ontology/schema.ts`

**Test scenarios:**
- Happy path: TypeSchema 类型定义正确
- Happy path: RelationSchema 类型定义正确
- Happy path: Ontology 类型定义正确
- Happy path: getTypeSchema() 查找成功
- Happy path: getRelationsFor() 返回相关关系
- Happy path: getRelationByType() 查找成功（新增）
- Edge case: getTypeSchema() 查找不存在类型返回 undefined

**Verification:**
- Schema 类型文件编译无错误
- 辅助函数测试通过

---

- [ ] **Unit 2: Registry 实现**

**Goal:** 实现四大 Registry + AgentRegistry Facade，支持装饰器自动注册

**Requirements:** R2, R3

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/ontology/registry.ts` — AgentTypeRegistry/AgentPropertyRegistry/AgentMethodRegistry/AgentRelationRegistry + AgentRegistry Facade

**Approach:**
- 从 V6 `runtime/registry.ts` 直接移植四大 Registry
- AgentPropertyRegistry 的 agentVisible 默认值改为 true
- AgentRegistry Facade 提供 getTypeSchema/getRegisteredClasses/getRelationSchemas/clear/all 统一入口
- AgentPropertyRegistry.getPropertiesForClass() 支持继承链递归查询

**Patterns to follow:**
- `src/v6/runtime/registry.ts`

**Test scenarios:**
- Happy path: AgentTypeRegistry.register/get/clear 正确工作
- Happy path: AgentPropertyRegistry.register/get 正确工作
- Happy path: AgentPropertyRegistry.getPropertiesForClass() 返回继承链属性
- Happy path: AgentMethodRegistry.register/get/getMethodsForClass 正确工作
- Happy path: AgentRelationRegistry.register/getRelationsForClass/getRelationsForToType 正确工作
- Happy path: AgentRegistry.getTypeSchema() 组装完整 TypeSchema
- Happy path: AgentRegistry.clear() 清空所有 Registry
- Edge case: AgentPropertyRegistry.get() 查找不存在属性返回 undefined

**Verification:**
- Registry 编译无错误
- 各 Registry 基础操作测试通过
- AgentRegistry Facade 测试通过

---

- [ ] **Unit 3: Decorator 实现**

**Goal:** 实现装饰器，副作用自动注册到 Registry

**Requirements:** R4, R15, R16

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/ontology/decorator.ts` — agentType/agentProperty/agentMethod/agentRelations

**Approach:**
- 从 V6 `runtime/decorator.ts` 移植装饰器模式
- agentProperty 的 agentVisible 默认值改为 true
- agentType 装饰器内部写入 `target.prototype.agentTypeName = config.name || target.name`（防止 minification 失效）
- agentRelations 作为类级装饰器（替代已废弃的方法级 @agentRelation）

**Patterns to follow:**
- `src/v6/runtime/decorator.ts`

**Test scenarios:**
- Happy path: @agentType 装饰器注册到 AgentTypeRegistry
- Happy path: @agentType 装饰器写入 agentTypeName 到 prototype
- Happy path: @agentProperty 装饰器注册到 AgentPropertyRegistry（agentVisible 默认 true）
- Happy path: @agentMethod 装饰器注册到 AgentMethodRegistry
- Happy path: @agentRelations 类级装饰器注册到 AgentRelationRegistry
- Integration: 装饰器组合使用（Reader 类示例）正确注册所有 Registry

**Verification:**
- Decorator 编译无错误
- 各装饰器自动注册测试通过
- agentTypeName 属性写入测试通过

---

- [ ] **Unit 4: BaseNode + NodeInstanceContainer**

**Goal:** 实现 BaseNode 抽象类和 NodeInstanceContainer 接口，Layer 3 行为载体

**Requirements:** R5, R6

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/ontology/base-node.ts` — BaseNode 抽象类 + NodeInstanceContainer 接口 + NodeId 类型

**Approach:**
- 从 V6 `runtime/graph.ts` 移植 BaseNode，移除 WeakMap/getGraphStore/setNodeGraphStore 相关代码
- 新增 NodeInstanceContainer 接口（异步 getBaseNode）
- BaseNode.getCapabilities() 从 AgentMethodRegistry 反射
- BaseNode.getProperties() 从 AgentPropertyRegistry 反射 + 实例取值
- BaseNode.getRelationSchemas() 从 AgentRelationRegistry 反射

**Patterns to follow:**
- `src/v6/runtime/graph.ts`（移除 WeakMap 部分）

**Test scenarios:**
- Happy path: BaseNode 构造函数接收 NodeId
- Happy path: BaseNode.getCapabilities() 返回方法列表
- Happy path: BaseNode.getProperties() 返回属性值
- Happy path: BaseNode.getRelationSchemas() 返回关系 Schema
- Happy path: NodeInstanceContainer 接口定义正确
- Edge case: BaseNode 子类实例化后 agentTypeName 正确读取

**Verification:**
- BaseNode 编译无错误
- BaseNode 反射方法测试通过
- NodeInstanceContainer 接口定义正确

---

- [ ] **Unit 5: RelationBinding + Validation**

**Goal:** 实现 RelationBinding 类型定义和校验逻辑

**Requirements:** R8, R9, R10

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/ontology/relation-binding.ts` — JunctionBinding/ForeignKeyBinding/InverseForeignKeyBinding/RelationBindingMap
- Create: `src/v8/ontology/validate-bindings.ts` — validateRelationBindings() + validateOntology()

**Approach:**
- relation-binding.ts 从 V6 直接移植
- validateRelationBindings() 从 V6 直接移植
- 新增 validateOntology() 跨引用校验（确保 fromType/toType 存在于 ontology.types）

**Patterns to follow:**
- `src/v6/ontology/relation-binding.ts`
- `src/v6/ontology/validate-bindings.ts`

**Test scenarios:**
- Happy path: JunctionBinding 类型定义正确
- Happy path: ForeignKeyBinding 类型定义正确
- Happy path: InverseForeignKeyBinding 类型定义正确
- Happy path: validateRelationBindings() 校验 Schema 与 Binding 一致
- Error path: validateRelationBindings() 缺失 binding 抛出 Error
- Error path: validateRelationBindings() 孤立 binding 抛出 Error
- Happy path: validateOntology() 校验 fromType/toType 存在于 types
- Error path: validateOntology() 发现不存在类型抛出 Error（列出问题 type）

**Verification:**
- RelationBinding 类型定义编译无错误
- validateRelationBindings() 测试通过
- validateOntology() 测试通过

---

- [ ] **Unit 6: Ontology Builder**

**Goal:** 实现 buildOntology() 构建完整 Ontology

**Requirements:** R7, R10

**Dependencies:** Unit 1, Unit 2, Unit 5

**Files:**
- Create: `src/v8/ontology/builder.ts` — buildOntology() + OntologyBuildOpts

**Approach:**
- 从 V6 `runtime/ontology-builder.ts` 移植核心逻辑
- 自动收集 AgentRegistry.getRelationSchemas()
- 手动补充 opts.relations 去重（key = `${fromType}:${type}:${toType}`）
- 组装每个类的完整 TypeSchema
- 调用 validateOntology() 跨引用校验

**Patterns to follow:**
- `src/v6/runtime/ontology-builder.ts`

**Test scenarios:**
- Happy path: buildOntology() 返回完整 Ontology
- Happy path: 自动收集 @agentRelations 声明的关系
- Happy path: 手动补充 opts.relations 去重
- Happy path: validateOntology() 被调用并校验通过
- Error path: validateOntology() 发现不存在类型抛出 Error
- Integration: 装饰器声明 → buildOntology() → 返回 Ontology

**Verification:**
- buildOntology() 编译无错误
- Ontology 构建测试通过
- validateOntology() 校验测试通过

---

- [ ] **Unit 7: Ontology Tools (inspect_schema)**

**Goal:** 实现 inspect_schema 工具查询本体 Schema

**Requirements:** R11

**Dependencies:** Unit 1, Unit 6

**Files:**
- Create: `src/v8/ontology/tools.ts` — createOntologyTools() (inspect_schema)

**Approach:**
- 从 V6 `agent/tools/ontology.ts` 适配为 V8 tool 体系
- 使用 V8 的 toolOk/toolErr（从 engine/runtime/types.ts 导入）
- 支持 Policy 过滤（设计文档提到，可选）
- typeName 参数可选，不指定返回全部类型概览

**Patterns to follow:**
- `src/v6/agent/tools/ontology.ts`
- `src/v8/engine/tools/graph-tools.ts` — V8 tool 定义模式

**Test scenarios:**
- Happy path: inspect_schema 无参数返回全部类型概览
- Happy path: inspect_schema 指定 typeName 返回完整 TypeSchema + relations
- Error path: inspect_schema 指定不存在 typeName 返回 NOT_FOUND
- Happy path: 返回结果包含 propertyCount/methodCount

**Verification:**
- inspect_schema 工具编译无错误
- inspect_schema 测试通过

---

- [ ] **Unit 8: Method Tools (describe_method/call_method)**

**Goal:** 实现 describe_method/call_method 工具

**Requirements:** R12, R13, R17

**Dependencies:** Unit 1, Unit 2, Unit 4

**Files:**
- Create: `src/v8/ontology/method-tools.ts` — createMethodTools() (describe_method/call_method)

**Approach:**
- 从 V6 `agent/tools/method.ts` 移植，改用 NodeInstanceContainer 接口
- 使用 V8 的 checkEntityAccess() Policy 检查
- schemaToJsonSchema 使用 Zod v4 全局函数 `z.toJSONSchema(schema)`
- assertPreconditions 实现 0 默认值防护 + MethodPrecondition 校验

**Patterns to follow:**
- `src/v6/agent/tools/method.ts`
- `src/v8/policy/filters.ts` — checkEntityAccess()

**Technical design:**

```typescript
// Zod v4 兼容
function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>
}
```

**Test scenarios:**
- Happy path: describe_method 返回方法 Schema
- Happy path: describe_method 返回 params JSON Schema + preconditions
- Error path: describe_method Policy denied 返回 POLICY_DENIED
- Error path: describe_method 不存在 node 返回 NOT_FOUND
- Error path: describe_method 不存在 method 返回 METHOD_NOT_FOUND
- Happy path: call_method 正确调用 BaseNode 方法
- Happy path: call_method 前置条件校验通过
- Error path: call_method Policy denied 返回 POLICY_DENIED
- Error path: call_method Zod 校验失败返回 INVALID_ARGS
- Error path: call_method 前置条件失败返回 PRECONDITION_FAILED
- Integration: describe_method → call_method 完整流程

**Verification:**
- describe_method/call_method 编译无错误
- Method tools 测试通过
- Zod v4 兼容性验证通过

---

- [ ] **Unit 9: System Prompt Builder**

**Goal:** 实现 buildOntologyPrompt() 生成 Agent System Prompt 片段

**Requirements:** R14

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/ontology/prompt.ts` — buildOntologyPrompt()

**Approach:**
- 按 Section 9.1 设计实现
- 过滤 agentVisible !== false && sensitive !== true 的属性
- 输出 Markdown 格式的 Schema 描述

**Patterns to follow:**
- 设计文档 Section 9.1 示例代码

**Test scenarios:**
- Happy path: buildOntologyPrompt() 返回 Markdown 字符串
- Happy path: 过滤敏感属性（sensitive: true）
- Happy path: 过滤不可见属性（agentVisible: false）
- Happy path: 输出包含实体类型 + 关系类型

**Verification:**
- buildOntologyPrompt() 编译无错误
- Prompt 生成测试通过

---

- [ ] **Unit 10: 模块导出 + 端到端验证**

**Goal:** 整合所有模块，验证装饰器 → Registry → Builder → Tools 完整流程

**Requirements:** All

**Dependencies:** Unit 1-9

**Files:**
- Modify: `src/v8/ontology/index.ts` — 模块导出
- Create: `src/v8/ontology/tests/ontology.test.ts` — 端到端测试

**Approach:**
- index.ts 导出所有类型和函数（按附录 A 清单）
- 端到端测试：定义 Reader/Book/Branch 实体 → buildOntology() → inspect_schema → call_method

**Patterns to follow:**
- 设计文档附录 A 导出清单
- `src/v8/engine/tests/e2e.test.ts` — V8 端到端测试模式

**Test scenarios:**
- Integration: 装饰器声明 → Registry 自动注册
- Integration: buildOntology() → 返回完整 Ontology
- Integration: inspect_schema 工具查询 Ontology
- Integration: call_method 工具调用 BaseNode 方法
- Integration: validateOntology() 捕获跨引用 typo
- Integration: buildOntologyPrompt() 生成 Prompt 片段

**Verification:**
- 模块导出完整
- 端到端测试通过

## System-Wide Impact

- **Interaction graph:** ontology 模块与 engine 模块的依赖关系清晰：ontology 导出 BaseNode 和 NodeInstanceContainer，engine 导出 ToolResult 类型
- **Error propagation:** Tools → Registry → BaseNode 的错误链路，统一包装为 ToolResult
- **State lifecycle risks:** Registry 全局静态，测试需手动 clear；装饰器副作用在类定义时立即执行
- **API surface parity:** V8 ontology 接口与 V6 保持一致，但底层解耦
- **Integration coverage:** 端到端测试覆盖 装饰器 → Registry → Builder → Tools 完整流程
- **Unchanged invariants:** V6 代码完全不变，V8 ontology 是独立模块

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Zod v4 API 变更导致 schemaToJsonSchema 不兼容 | 使用全局函数 `z.toJSONSchema(schema)` |
| 装饰器 minification 后 constructor.name 失效 | agentTypeName 属性写入 prototype |
| Registry 全局状态导致测试隔离问题 | AgentRegistry.clear() 在 before/after 调用 |
| NodeInstanceContainer 异步接口与现有同步代码冲突 | 仅用于 method-tools，GraphStore 保持同步 |

## Sources & References

- **Origin document:** [src/v8/docs/ontology/phase1-design.md](src/v8/docs/ontology/phase1-design.md)
- Related code: `src/v6/runtime/registry.ts`, `src/v6/runtime/decorator.ts`, `src/v6/runtime/graph.ts`
- V8 Engine plan: [docs/plans/2026-05-23-003-feat-v8-phase1-semantic-runtime-plan.md](docs/plans/2026-05-23-003-feat-v8-phase1-semantic-runtime-plan.md)