---
date: 2026-05-23
topic: v8-phase1-semantic-runtime
---

# V8 Phase 1: Semantic Reasoning Runtime

## Problem Frame

V6 的 Agent 直接通过 Tool 访问 GraphStore，图遍历与聚合混在一起，缺乏执行策略管控和推理记忆。V8 引入 Runtime Orchestrator 作为中间层，分离 Traversal (GraphStore) 与 OLAP (ComputeStore)，并增加 FactStore 自动注入，使 Agent 推理更有序、更可追踪。

## Requirements

**Runtime Orchestrator**
- R1. RuntimeOrchestrator 实现 Backend Routing，将查询路由到 GraphStore / ComputeStore / VectorStore
- R2. RuntimeOrchestrator 执行 Policy Enforcement（traversal depth limit, timeout）
- R3. RuntimeOrchestrator 执行 FactStore 自动注入——查询结果自动提取低阶 FactBinding 并追加到 workspace.bindings
- R4. RuntimeOrchestrator 支持 ComputeQuery 的动态引用解析（$workspace.candidates 句柄代换，含 parseGlobalId 解码）

**GraphStore (Traversal Only)**
- R5. GraphStore 接口保持 V6 兼容（getNode, findNodes, getNeighbors, getEdgeSummary, query）
- R6. GraphTraversalQuery 移除 aggregate 支持，聚合由 ComputeStore 承担
- R7. GraphQueryEngine 从 V6 深度移植并剪裁（复制 query-engine.ts + graph-filters.ts，移除 ReturnClause.aggregate）

**ComputeStore (OLAP)**
- R8. ComputeStore 接口实现 aggregate / getSources / getSourceSchema
- R9. ComputeQuery DSL 支持 filters / metrics (count,sum,avg,min,max) / groupBy / orderBy / 分页
- R10. InMemoryComputeStore 实现，数据通过解析 V6 SQL DDL 文件播种
- R11. 支持 ComputeFilter 动态引用代换（与 R4 配合）

**FactStore (P1)**
- R12. FactStore 保持 V6 不可变只读设计，增加 Orchestrator 自动注入低阶快照
- R13. 低阶注入通过 workspace.bindings 追加，Agent 推理循环结束后重建 FactStore 实例

**Tools**
- R14. graph_query 工具移除 aggregate，路由到 RuntimeOrchestrator
- R15. compute_query 工具新增，路由到 RuntimeOrchestrator
- R16. inspect_node / search_nodes / query_neighbors 路由到 RuntimeOrchestrator
- R17. bind_fact / lookup_fact 保留 V6 设计

**Agent Executor**
- R18. Agent Executor 适配新 tools 集合，端到端运行

**VectorStore (P2 - 接口预留)**
- R19. VectorStore 接口定义 + 内存 stub，Phase 1 不做完整实现

## Success Criteria
- Agent 能完成"哪些代理商进件的商户本月无交易"的端到端推理
- graph_query 返回的候选集可通过 $workspace.candidates 在 compute_query 中引用
- Runtime 自动注入低阶快照到 workspace.bindings
- V6 的图过滤和遍历测试用例在 V8 下仍然通过

## Scope Boundaries
- 不实现 CacheStore（移出 Phase 1）
- 不实现 VectorStore 完整搜索（仅接口 + stub）
- 不实现外部 Store 后端（Neo4j/ClickHouse/DuckDB 等）
- 不实现 window/timeseries/ranking 聚合（Phase 2）

## Key Decisions
- GraphQueryEngine 采用深度移植 + 剪裁策略：复制 V6 代码到 V8，移除 aggregate，独立维护
- ComputeStore 数据播种采用 SQL DDL 解析：解析 V6 的 order_daily.sql / profit_daily.sql
- 实现范围为 P0 + P1：包含 FactStore 自动注入
- 所有 Tool 底层路由到 RuntimeOrchestrator，不直接访问 Store

## Dependencies / Assumptions
- 依赖 V6 的 query-engine.ts, graph-filters.ts, query-types.ts 作为移植源
- 依赖 V6 的 DDL 文件 (order_daily.sql, profit_daily.sql) 作为数据播种源
- 假设 Agent 框架使用 AI SDK (Vercel AI SDK) 的 generateText + tools 模式
- 假设 TypeScript + Zod 作为类型和验证基础设施

## Outstanding Questions

### Deferred to Planning
- [Affects R10][Needs research] SQL DDL 解析的具体实现方式——是否使用 SQL parser 库还是手写简易解析
- [Affects R7][Technical] V6 graph-filters.ts 中哪些 aggregate 相关代码需要移除
- [Affects R3][Technical] extractBindingsFromQuery 的具体实现——从查询结果提取哪些字段作为 FactBinding
- [Affects R13][Technical] Agent 推理循环中 FactStore 重建的具体时机和机制

## Next Steps
→ /ce:plan for structured implementation planning
