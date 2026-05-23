---
title: "feat: V8 Phase 1 Semantic Reasoning Runtime"
type: feat
status: active
date: 2026-05-23
origin: docs/brainstorms/2026-05-23-v8-phase1-semantic-runtime-requirements.md
deepened: 2026-05-23
---

# feat: V8 Phase 1 Semantic Reasoning Runtime

## Overview

在 src/v8/engine/ 下实现 Semantic Reasoning Runtime 的 Phase 1，核心变更：引入 RuntimeOrchestrator 作为 Tool 与 Store 之间的中间层，将 V6 GraphStore 的聚合职责拆分给新的 ComputeStore，实现 FactStore 自动注入机制。所有代码参考 V6 现有实现深度移植并剪裁。

## Problem Frame

V6 的 Agent 直接通过 Tool 访问 GraphStore，图遍历与聚合混在一起，缺乏执行策略管控和推理记忆自动追踪。V8 引入 Runtime Orchestrator 统一调度，分离 Traversal (GraphStore) 与 OLAP (ComputeStore)，并增加 FactStore 自动注入，使 Agent 推理更有序、更可追踪。(see origin: docs/brainstorms/2026-05-23-v8-phase1-semantic-runtime-requirements.md)

## Requirements Trace

- R1. RuntimeOrchestrator 实现 Backend Routing (GraphStore/ComputeStore/VectorStore)
- R2. RuntimeOrchestrator 执行 Policy Enforcement (traversal depth, timeout)
- R3. RuntimeOrchestrator 执行 FactStore 自动注入 (查询结果 → workspace.bindings)
- R4. RuntimeOrchestrator 支持 ComputeQuery 动态引用解析 ($workspace.candidates + parseGlobalId)
- R5. GraphStore 接口保持 V6 兼容 (getNode, findNodes, getNeighbors, getEdgeSummary, query)
- R6. GraphTraversalQuery 移除 aggregate
- R7. GraphQueryEngine 从 V6 深度移植并剪裁
- R8. ComputeStore 接口实现 aggregate/getSources/getSourceSchema
- R9. ComputeQuery DSL 支持 filters/metrics/groupBy/orderBy/分页
- R10. InMemoryComputeStore 实现，数据通过 SQL DDL 解析播种
- R11. 支持 ComputeFilter 动态引用代换
- R12. FactStore 保持 V6 不可变只读设计，增加 Orchestrator 自动注入
- R13. 低阶注入通过 workspace.bindings 追加，Agent 循环后重建 FactStore
- R14. graph_query 工具移除 aggregate，路由到 RuntimeOrchestrator
- R15. compute_query 工具新增
- R16. inspect_node/search_nodes/query_neighbors 路由到 RuntimeOrchestrator
- R17. bind_fact/lookup_fact 保留 V6 设计
- R18. Agent Executor 适配新 tools
- R19. VectorStore 接口定义 + stub (Phase 1 不做完整实现)

## Scope Boundaries

- 不实现 CacheStore (移出 Phase 1)
- 不实现 VectorStore 完整搜索 (仅接口 + stub)
- 不实现外部 Store 后端 (Neo4j/ClickHouse/DuckDB)
- 不实现 window/timeseries/ranking 聚合 (Phase 2)
- 不实现 RuleTools/MethodTools/CounterfactualTools (Phase 1 聚焦核心查询+推理)

## Context & Research

### Relevant Code and Patterns

- `src/v6/runtime/query-engine.ts` — GraphQueryEngine: MATCH→TRAVERSE→RETURN 流程，需深度移植并移除 aggregate 分支
- `src/v6/runtime/graph-filters.ts` — evalFilter/matchesFilters/projectFields，直接复用
- `src/v6/runtime/query-types.ts` — Zod schemas + 类型定义，需剪裁 aggregate 相关
- `src/v6/runtime/eventStore.ts` — FactStore 不可变快照模式，直接移植
- `src/v6/runtime/types.ts` — ToolResult/Paginated/FactBinding 等核心类型，直接复用
- `src/v6/runtime/graph-store.ts` — GraphStore 接口定义，V8 保持兼容
- `src/v6/runtime/graph.ts` — BaseNode 类，V8 保留
- `src/v6/provider/in-memory.ts` — InMemoryGraphStore 实现，直接移植
- `src/v6/agent/tools/graph.ts` — graph tool 模式 (tool() + inputSchema + execute)
- `src/v6/agent/tools/facts.ts` — bind_fact/lookup_fact 模式
- `src/v6/agent/tools/candidates.ts` — propose_candidates/record_evidence/declare_uncertainty
- `src/v6/agent/executor.ts` — Agent 执行模式 (generateText + tools + stepCountIs)
- `src/v6/ontology/decision.ts` — DecisionWorkspace 模式
- `src/v6/policy/context.ts` — PolicyContext + OPEN_POLICY
- `src/v6/policy/filters.ts` — checkEntityAccess/checkTypeAccess/redactProperties
- `src/v6/tests/1-graph/restapi/ddl/order_daily.sql` — OrderDaily DDL
- `src/v6/tests/1-graph/restapi/ddl/profit_daily.sql` — ProfitDaily DDL
- `src/lib/model.ts` — AI SDK model 配置

### Institutional Learnings

- **FactStore 必须从空开始** (来源: docs/design/detail/v6-0-2-facts.md): 预填充图数据到 FactStore 违反 Progressive Disclosure 原则。FactStore 是"Agent 的工作笔记"，不是数据库副本。V8 的自动注入 (R3) 应仅注入当前推理周期发现的低阶快照，不应预填充图属性
- **Policy 应在数据层执行而非工具层** (来源: docs/design/x-drawback.md): V6 的策略仅在 Tool 层执行，任何绕过 Tool 的组件将丢失策略。V8 的 RuntimeOrchestrator 解决了这个问题——所有 Store 访问必须经过 Runtime，策略在数据层统一执行
- **图做深度（多跳遍历），OLAP 做广度（列式聚合）** (来源: docs/design/1-graph-and-aggregation.md): "在大规模聚合上用图是伪命题"。图的强项是指针遍历 O(1)，弱项是扫描 1 亿节点的 amount 属性求和。列式存储在此场景下快 100 倍
- **异步 GraphStore 重构仍在进行中** (来源: docs/plans/2026-05-21-002): V8 实现应考虑 getBaseNode 已合并入 GraphStore 接口的变更
- **V8 InMemoryGraphStore 不需要 BaseNode 装饰器体系**: V6 的 BaseNode 依赖装饰器和注册表模式，V8 可以简化为纯数据 NodeData 模式

### External References

- 不需要外部研究，代码库有充分的本地模式

## Key Technical Decisions

- **GraphQueryEngine 深度移植 + 剪裁**: 复制 V6 query-engine.ts 和 graph-filters.ts 到 V8 目录，移除 ReturnClause.aggregate 和 applyAggregate/computeMetric 函数，避免 V6/V8 代码耦合 (see origin: 用户选择"深度移植 + 剪裁")
- **ComputeStore 数据播种用 SQL DDL 解析**: 解析 V6 的 order_daily.sql / profit_daily.sql，提取列定义和测试数据，InMemoryComputeStore 启动时自动播种 (see origin: 用户选择"SQL DDL 解析")
- **FactStore 不可变快照机制保留**: 保持 V6 的 FactStore 只读设计，所有写入通过 workspace.bindings 追加，推理循环后重建 FactStore 实例。关键约束: FactStore 不预填充图数据，仅注入当前推理周期发现的低阶快照
- **Tool 统一路由到 RuntimeOrchestrator**: 所有 Tool 的 execute 回调不直接访问 Store，而是调用 Runtime 的对应方法。这解决了 V6 中 Policy 仅在 Tool 层执行的缺陷，使 Policy 在数据层统一执行
- **V8 InMemoryGraphStore 简化设计**: 不依赖 V6 的 BaseNode/装饰器/注册表体系，直接使用纯数据 NodeData 模式，降低复杂度
- **Zod v4 兼容**: package.json 显示 zod ^4.3.6，需确认 API 兼容性

## Open Questions

### Resolved During Planning

- GraphQueryEngine 迁移策略: 深度移植 + 剪裁 (用户确认)
- ComputeStore 数据播种: SQL DDL 解析 (用户确认)
- 实现范围: P0 + P1 (用户确认)

### Deferred to Implementation

- SQL DDL 解析的具体实现: 可能使用简易正则解析或手写 seed data，实现时根据 DDL 文件复杂度决定
- extractBindingsFromQuery 具体提取逻辑: 哪些查询结果字段映射为 FactBinding，实现时确定
- Zod v4 API 变更: 是否需要适配 .optional().default() 等链式调用语法，实现时验证

## Implementation Units

- [ ] **Unit 1: 核心类型与基础设施**

**Goal:** 建立 V8 engine 的公共类型系统和工具函数，为后续单元提供基础

**Requirements:** R5, R6, R19

**Dependencies:** None

**Files:**
- Create: `src/v8/engine/runtime/types.ts` — 核心类型 (ToolResult, Paginated, FactBinding, NodeData, NeighborData, EdgeSummary, GlobalId)
- Create: `src/v8/engine/runtime/config.ts` — RuntimeConfig 定义与默认值
- Create: `src/v8/engine/stores/graph-store.ts` — GraphStore 接口
- Create: `src/v8/engine/stores/compute-store.ts` — ComputeStore 接口 + ComputeQuery/ComputeQueryResult 类型
- Create: `src/v8/engine/stores/vector-store.ts` — VectorStore 接口 + VectorQuery 类型
- Create: `src/v8/engine/stores/fact-store.ts` — FactStore 类 (从 V6 移植)
- Test: `src/v8/engine/tests/types.test.ts`

**Approach:**
- 从 V6 runtime/types.ts 移植 ToolResult/toolOk/toolErr, Paginated, FactBinding 等核心类型
- 新增 GlobalId 相关: `parseGlobalId(id)` 和 `toGlobalId(type, rawId)` 工具函数
- GraphStore 接口与 V6 保持一致但不含 getBaseNode（V8 不使用装饰器模式）
- ComputeStore 接口按 phase1-design.md 4.2 定义
- VectorStore 接口按 phase1-design.md 5.2 定义（stub 阶段）
- FactStore 从 V6 eventStore.ts 移植只读部分

**Patterns to follow:**
- `src/v6/runtime/types.ts` — ToolResult, Paginated, FactBinding
- `src/v6/runtime/graph-store.ts` — GraphStore 接口
- `src/v6/runtime/eventStore.ts` — FactStore 类

**Test scenarios:**
- Happy path: toolOk/toolErr 构造正确结果
- Happy path: parseGlobalId('Merch:M001') 返回 { type: 'Merch', rawId: 'M001' }
- Edge case: parseGlobalId 无冒号的 ID 返回原值
- Happy path: FactStore 构造、get、getValue、forEntity、snapshot

**Verification:**
- 类型文件编译无错误
- FactStore 基础操作测试通过

---

- [ ] **Unit 2: Query DSL 与 Zod Schema**

**Goal:** 定义 V8 的查询 DSL 类型与 Zod 验证 Schema

**Requirements:** R6, R9

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/engine/query/graph-query.ts` — GraphTraversalQuery Zod Schema + 类型 (移除 aggregate)
- Create: `src/v8/engine/query/compute-query.ts` — ComputeQuery Zod Schema + 类型
- Create: `src/v8/engine/query/vector-query.ts` — VectorQuery Zod Schema + 类型
- Create: `src/v8/engine/query/filters.ts` — PropertyFilter 评价 (从 V6 移植)
- Test: `src/v8/engine/tests/query-schemas.test.ts`

**Approach:**
- GraphTraversalQuery: 从 V6 query-types.ts 移植 MatchClause/TraverseStep/ReturnClause Schema，移除 AggregateSpecSchema 和 ReturnClause 中的 aggregate 字段
- ComputeQuery: 按 phase1-design.md 附录 B 定义完整 Schema (source, filters, metrics, groupBy, orderBy, limit, offset)
- VectorQuery: 按 phase1-design.md 5.2 定义
- filters.ts: 从 V6 graph-filters.ts 完整移植 evalFilter/matchesFilters/projectFields

**Patterns to follow:**
- `src/v6/runtime/query-types.ts` — Zod Schema 定义模式
- `src/v6/runtime/graph-filters.ts` — filter 评价函数

**Test scenarios:**
- Happy path: GraphTraversalQuery Schema 验证含 match+traverse+return 的查询
- Error path: GraphTraversalQuery Schema 拒绝含 aggregate 字段的查询
- Happy path: ComputeQuery Schema 验证含 source+metrics+groupBy 的查询
- Happy path: ComputeFilter 支持 in/between 操作符
- Happy path: evalFilter 各操作符 (eq, ne, gt, gte, lt, lte, contains, in) 正确求值
- Edge case: matchesFilters 空 filters 返回 true
- Happy path: projectFields 字段投影

**Verification:**
- Zod Schema 验证测试通过
- filter 评价函数测试通过

---

- [ ] **Unit 3: InMemoryGraphStore + GraphQueryEngine**

**Goal:** 实现 V8 的 GraphStore 内存实现和图查询引擎（Traversal Only）

**Requirements:** R5, R7

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/engine/impl/in-memory-graph.ts` — InMemoryGraphStore (从 V6 移植)
- Create: `src/v8/engine/impl/query-engine.ts` — GraphQueryEngine (从 V6 移植，移除 aggregate)
- Test: `src/v8/engine/tests/graph-store.test.ts`
- Test: `src/v8/engine/tests/query-engine.test.ts`

**Approach:**
- InMemoryGraphStore: 从 V6 provider/in-memory.ts 移植，简化（移除 BaseNode/装饰器依赖，改用纯数据 NodeData）
- GraphQueryEngine: 从 V6 runtime/query-engine.ts 深度移植，移除:
  - applyAggregate/computeMetric 函数
  - buildReturn 中的 `if (ret?.aggregate)` 分支
  - GraphQueryResult 的 `mode: 'aggregate'` 变体
- 保留完整的 MATCH→TRAVERSE→RETURN 执行流程和 Policy 校验
- V8 的 InMemoryGraphStore 直接存储 NodeData 和 Edge，不依赖 BaseNode 装饰器体系

**Patterns to follow:**
- `src/v6/provider/in-memory.ts` — InMemoryGraphStore
- `src/v6/runtime/query-engine.ts` — GraphQueryEngine

**Test scenarios:**
- Happy path: MATCH 单类型节点，TRAVERSE out 关系，RETURN 结果
- Happy path: MATCH + where 过滤 + 多步 TRAVERSE
- Happy path: TRAVERSE require='exists' 和 require='none'
- Edge case: TRAVERSE 不存在的 alias 报错
- Happy path: 分页 (limit/offset) 正确工作
- Edge case: 移除 aggregate 后，含 aggregate 字段的查询在 Schema 层被拒绝（Unit 2 已覆盖）
- Integration: Policy 校验拒绝未授权类型/实体

**Verification:**
- GraphStore CRUD 测试通过
- GraphQueryEngine traversal-only 测试通过

---

- [ ] **Unit 4: InMemoryComputeStore + DDL 解析播种**

**Goal:** 实现 OLAP ComputeStore 内存版，支持 SQL DDL 解析播种

**Requirements:** R8, R9, R10

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/engine/impl/in-memory-compute.ts` — InMemoryComputeStore
- Create: `src/v8/engine/impl/seed-ddl.ts` — DDL 解析器 + 种子数据
- Test: `src/v8/engine/tests/compute-store.test.ts`

**Approach:**
- InMemoryComputeStore: 内存中存储扁平化 Record<string, unknown>[] 行数据，按 source 分组
- aggregate 实现: 遍历行数据，应用 filters，计算 metrics (count/sum/avg/min/max)，支持 groupBy/orderBy/分页
- DDL 解析: 简易正则解析 SQL CREATE TABLE 提取列名和类型，生成 FieldSchema
- 种子数据: 在 seed-ddl.ts 中手写 OrderDaily 和 ProfitDaily 的测试数据行（参考 DDL 定义的字段），避免引入 SQL parser 依赖
- getSources(): 返回已注册的数据源列表
- getSourceSchema(): 从 DDL 解析结果返回 FieldSchema[]

**Patterns to follow:**
- `src/v6/runtime/query-engine.ts` applyAggregate/computeMetric — 聚合计算逻辑
- `src/v6/tests/1-graph/restapi/ddl/order_daily.sql` — OrderDaily DDL
- `src/v6/tests/1-graph/restapi/ddl/profit_daily.sql` — ProfitDaily DDL

**Test scenarios:**
- Happy path: count/sum/avg/min/max 聚合计算
- Happy path: groupBy 分组聚合
- Happy path: orderBy 排序
- Happy path: filters 过滤 (eq, in, between, gt, lt)
- Edge case: 空结果集聚合返回 0
- Edge case: groupBy 不存在的字段返回空
- Happy path: getSources 返回已注册源
- Happy path: getSourceSchema 返回正确 FieldSchema
- Integration: OrderDaily 种子数据播种后可查询

**Verification:**
- ComputeStore 聚合测试通过
- DDL 解析和种子数据测试通过

---

- [ ] **Unit 5: VectorStore Stub**

**Goal:** 实现 VectorStore 接口的内存 stub，Phase 1 仅支持简单文本匹配

**Requirements:** R19

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/engine/impl/in-memory-vector.ts` — InMemoryVectorStore (文本匹配 stub)
- Test: `src/v8/engine/tests/vector-store.test.ts`

**Approach:**
- search: 简单文本包含匹配，返回匹配实体列表
- indexEntity/removeEntity: 内存 Map 存储
- Phase 1 不实现 embedding，仅用文本相似度

**Patterns to follow:**
- `src/v8/engine/stores/vector-store.ts` — VectorStore 接口

**Test scenarios:**
- Happy path: 文本匹配搜索返回结果
- Edge case: 无匹配返回空列表
- Happy path: indexEntity/removeEntity 正确操作

**Verification:**
- VectorStore stub 基础测试通过

---

- [ ] **Unit 6: RuntimeOrchestrator**

**Goal:** 实现核心 RuntimeOrchestrator，统一路由、策略执行、动态引用解析和 FactStore 自动注入

**Requirements:** R1, R2, R3, R4, R11, R12, R13

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4, Unit 5

**Files:**
- Create: `src/v8/engine/runtime/orchestrator.ts` — SemanticRuntimeOrchestrator
- Create: `src/v8/engine/runtime/workspace.ts` — Workspace (持有 bindings, candidates 等)
- Test: `src/v8/engine/tests/orchestrator.test.ts`

**Approach:**
- SemanticRuntimeOrchestrator 构造: 接收 GraphStore, ComputeStore, VectorStore, Workspace, RuntimeConfig
- executeGraphQuery: Policy 验证 → GraphQueryEngine.execute → injectFacts → 返回结果
- executeComputeQuery: resolveDynamicReferences → ComputeStore.aggregate → injectFacts → 返回结果
- executeVectorQuery: VectorStore.search → injectFacts → 返回结果
- inspectNode/searchNodes/queryNeighbors: 委托给 GraphStore + Policy 校验 + injectFacts
- validateTraversalPolicy: 检查 traverse depth ≤ maxTraversalDepth
- resolveDynamicReferences: 解析 $workspace.candidates，执行 parseGlobalId 解码
- injectFacts: 从查询结果提取 FactBinding，追加到 workspace.bindings
- extractBindingsFromQuery: GraphQueryResult 提取节点 ID 列表和关键属性；ComputeQueryResult 提取 group 值和 metric 值
- 重要约束: injectFacts 仅注入当前推理周期发现的低阶快照事实（如候选节点 ID 列表），不预填充图属性数据。高阶语义断言仍由 Agent 通过 bind_fact 显式绑定
- Workspace: 简化版 DecisionWorkspace，持有 bindings 数组和 candidates 引用。同时维护 workspace.candidates 供动态引用使用

**Patterns to follow:**
- `src/v6/runtime/query-engine.ts` — Policy 校验模式
- `src/v6/ontology/decision.ts` — DecisionWorkspace (bindings 管理)
- `src/v8/engine/docs/phase1-design.md` Section 2.3 — 骨架代码

**Test scenarios:**
- Happy path: executeGraphQuery 正确路由到 GraphStore
- Happy path: executeComputeQuery 正确路由到 ComputeStore
- Happy path: executeVectorQuery 正确路由到 VectorStore
- Happy path: inspectNode/searchNodes/queryNeighbors 正确委托
- Error path: traversal depth 超限返回 POLICY_DENIED
- Happy path: resolveDynamicReferences 解析 $workspace.candidates (含 parseGlobalId 解码)
- Happy path: injectFacts 追加 FactBinding 到 workspace.bindings
- Edge case: 缓存命中时也触发 injectFacts (为 Phase 2 预留)
- Integration: 完整 graph_query → compute_query 两阶段查询，动态引用正确解析

**Verification:**
- RuntimeOrchestrator 路由和策略测试通过
- 动态引用解析测试通过
- FactStore 自动注入测试通过

---

- [ ] **Unit 7: Tools 定义**

**Goal:** 定义 V8 的全部 Tool，所有 Tool 的 execute 路由到 RuntimeOrchestrator

**Requirements:** R14, R15, R16, R17

**Dependencies:** Unit 2, Unit 6

**Files:**
- Create: `src/v8/engine/tools/graph-tools.ts` — inspect_node, search_nodes, query_neighbors, graph_query
- Create: `src/v8/engine/tools/compute-tools.ts` — compute_query
- Create: `src/v8/engine/tools/vector-tools.ts` — vector_query
- Create: `src/v8/engine/tools/fact-tools.ts` — bind_fact, lookup_fact
- Create: `src/v8/engine/tools/candidate-tools.ts` — propose_candidates, record_evidence, declare_uncertainty
- Test: `src/v8/engine/tests/tools.test.ts`

**Approach:**
- 所有 graph tool 的 execute 回调调用 runtime 的对应方法 (inspectNode/searchNodes/queryNeighbors/executeGraphQuery)
- compute_query 和 vector_query 的 execute 调用 runtime.executeComputeQuery / executeVectorQuery
- graph_query 使用 V8 的 GraphTraversalQuerySchema (无 aggregate)
- bind_fact/lookup_fact 保留 V6 模式，直接操作 workspace.bindings
- candidate tools 保留 V6 模式

**Patterns to follow:**
- `src/v6/agent/tools/graph.ts` — tool 定义模式
- `src/v6/agent/tools/facts.ts` — bind_fact/lookup_fact
- `src/v6/agent/tools/candidates.ts` — propose_candidates 等

**Test scenarios:**
- Happy path: graph_query 工具调用 runtime.executeGraphQuery
- Happy path: compute_query 工具调用 runtime.executeComputeQuery
- Happy path: inspect_node 工具调用 runtime.inspectNode
- Happy path: bind_fact 写入 workspace.bindings
- Happy path: lookup_fact 从 FactStore 读取
- Error path: graph_query 含 aggregate 字段被 Schema 拒绝

**Verification:**
- 全部 Tool 定义编译无错误
- Tool 路由测试通过

---

- [ ] **Unit 8: Agent Executor + System Prompt + 端到端验证**

**Goal:** 实现 Agent Executor，构建完整端到端推理链路

**Requirements:** R18

**Dependencies:** Unit 6, Unit 7

**Files:**
- Create: `src/v8/engine/agent/executor.ts` — runSemanticReasoningAgent
- Create: `src/v8/engine/agent/prompt.ts` — System Prompt 构建器
- Create: `src/v8/engine/agent/verdict.ts` — 结果解析
- Create: `src/v8/engine/index.ts` — 模块导出
- Test: `src/v8/engine/tests/e2e.test.ts`

**Approach:**
- runSemanticReasoningAgent: 初始化 Workspace → 构建 tools → generateText → 解析 verdict
- System Prompt: 按 phase1-design.md Section 7.2 规则构建，包含查询分工规则和事实收集规则
- verdict 解析: 简化版，解析 Agent 输出中的 JSON verdict
- 端到端验证: 构建 InMemoryGraphStore (含商户/代理商/OrderDaily 数据) + InMemoryComputeStore + InMemoryVectorStore + RuntimeOrchestrator → Agent 执行"哪些代理商进件的商户本月没有交易"

**Patterns to follow:**
- `src/v6/agent/executor.ts` — 执行模式
- `src/v6/agent/prompt.ts` — Prompt 构建模式
- `src/lib/model.ts` — AI SDK model 配置

**Test scenarios:**
- Integration: 端到端推理 — graph_query 收缩候选 → compute_query 聚合 → bind_fact → verdict
- Integration: 动态引用 $workspace.candidates 在 compute_query 中正确解析
- Integration: Runtime 自动注入低阶 FactBinding
- Edge case: Agent 超过 stepCount 限制后优雅退出
- Happy path: verdict 正确解析 JSON 格式

**Verification:**
- 端到端推理测试通过
- "商户无交易"场景完整跑通

## System-Wide Impact

- **Interaction graph:** V8 是全新模块，不影响 V6 代码。package.json 的 exports 可能需要增加 V8 入口
- **Error propagation:** Tool → RuntimeOrchestrator → Store 的错误链路，Runtime 统一包装为 ToolResult
- **State lifecycle risks:** workspace.bindings 的追加写入需注意不可变审计链路
- **API surface parity:** V8 Tool 接口与 V6 保持一致 (tool() + inputSchema + execute)，但底层路由不同
- **Integration coverage:** 端到端测试覆盖 graph_query → compute_query 两阶段查询
- **Unchanged invariants:** V6 代码完全不变，V8 是独立模块

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Zod v4 API 变更可能导致 Schema 定义不兼容 | 实现时验证 Zod v4 语法，必要时适配 |
| DDL 解析过于复杂 | 使用手写种子数据而非完整 SQL parser |
| AI SDK generateText + tools 模式与 V6 版本差异 | 复用 V6 已验证的 model 配置 |
| 端到端测试依赖 LLM API | e2e 测试使用 mock 或标记为 integration test |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-23-v8-phase1-semantic-runtime-requirements.md](docs/brainstorms/2026-05-23-v8-phase1-semantic-runtime-requirements.md)
- **Design doc:** [src/v8/engine/docs/phase1-design.md](src/v8/engine/docs/phase1-design.md)
- Related code: `src/v6/runtime/query-engine.ts`, `src/v6/runtime/eventStore.ts`, `src/v6/agent/executor.ts`
