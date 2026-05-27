---
date: 2026-05-27
topic: graph-query-session-cache
---

# Graph Query 批量遍历 + Session 节点缓存

## Problem Frame

`RestQueryGraphStore.query()` 在大工作集场景（如 MATCH 500 条 `AgentRel` + 2 步 TRAVERSE）会产生 N+1 串行 HTTP 请求：TRAVERSE 逐步 `getNeighbors`、RETURN 逐步 `getNode`，单次查询可达 2000+ 请求。

`PipelineSession` 已持有跨轮次状态（`Workspace`、对话历史），但 `GraphStore` 仍为无状态共享实例，遍历过程中获取的节点数据无法复用，多轮 `chat()` 也会重复请求相同节点。

## Requirements

**批量邻居查询（方案 B）**
- R1. `GraphStore` 扩展 `getNeighborsBatch(nodeIds, opts)`，一次调用替代 TRAVERSE 阶段对同一 step 的 N 次 `getNeighbors`
- R2. `search` 类 binding 通过 `where.*.in` 批量查关联；`custom` 类 binding 支持可选 batch 路径（如 `AgentRel:for_agent` 批量收集 `agent_no` 后一次 `resolveAgentsByNos`）
- R3. binding 无 batch 实现时，fallback 为逐节点 `getNeighbors`（行为与现有一致，不报错）
- R4. `graph_query` 的 TRAVERSE 阶段优先走 `getNeighborsBatch`

**Session 节点缓存（方案 C）**
- R5. `PipelineSession` 持有 `nodeDataCache: Map<string, NodeData>`，生命周期与 Session 一致（`run()` 创建，`chat()` 复用，进程结束即释放）
- R6. 缓存仅对 **Session 路径**生效：`createSession → run/chat`；`PipelineContext.runTask()`、`debugBuildTools()` 及直接调用 `GraphStore` 的测试/demo **不使用** Session 缓存
- R7. 缓存覆盖 **`graph_query` + `query_neighbors`**：`inspect_node`、`search_nodes` 不走缓存
- R8. `graph_query` 在 MATCH / TRAVERSE / RETURN 各阶段写入已获取的 `NodeData`；RETURN 优先读缓存，缺失项批量 `fetchMany` 补全后写回缓存
- R9. `query_neighbors` 读取缓存命中源节点与邻居；fetch 到的节点写入缓存供后续 `graph_query` / `query_neighbors` 复用
- R10. Session 缓存与 `RestQueryGraphStore` 现有的 `nodeCache`（`BaseNode` 实例缓存）职责分离，互不替代

**行为与兼容性**
- R11. 查询语义、policy 过滤、`truncated` / `MAX_WORKING_SET` 等行为与优化前一致
- R12. `InMemoryGraphStore` 提供 `getNeighborsBatch` 实现（可基于现有 `getNeighbors` 组合），保证 engine 层测试不依赖 REST

## Success Criteria

- 上述 `AgentRel` 测试用例：TRAVERSE 每步 HTTP 请求从 O(N) 降至 O(1)～O(batch 分页数)；RETURN 在缓存命中时接近 0 次额外 `getNode`
- 同一 Session 内第二次 `query_neighbors` / `graph_query` 访问已见过的节点，不再发起重复 HTTP
- `runTask()` 行为与改动前一致；无 Session 的单元测试无需改动 Session 即可通过

## Scope Boundaries

- 不实现方案 D（服务端 compound query 下推）
- 不将方案 A（纯并发化）作为独立交付；可在 batch fallback 内部使用，但不单独验收
- 不实现 Session 缓存持久化、TTL、主动失效（假设 Session 内数据只读）
- 不扩展 `inspect_node` / `search_nodes` 的缓存
- 不改变 `GraphTraversalQuery` 对外 schema

## Key Decisions

- **B + C 组合**：batch 降 TRAVERSE 请求量；cache 消除 RETURN 冗余并跨 tool 复用
- **Session 持有缓存**：避免共享 `GraphStore` 实例跨 Session 泄漏；与 `Workspace` 模式对齐
- **缓存范围 = graph_query + query_neighbors**：在性能收益与缓存一致性复杂度间取平衡
- **runTask 无缓存**：保持无状态单次调用路径简单、可预测

## Dependencies / Assumptions

- REST 后端支持 `where.*.in` 批量过滤（`fetchManyImpl` 已使用）
- Session 推理周期内图数据不变（只读），无需 cache invalidation
- `custom` binding 的 batch 路径需逐 binding 实现或 store 层按类型分组优化

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Session 缓存注入方式：`Orchestrator` 传 `QueryContext` vs `SessionScopedGraphStore` 装饰器
- [Affects R2][Technical] `custom` binding batch 扩展形态：binding 级 `batchHandler` vs store 内按 `fromType+relation` 硬编码分组
- [Affects R2][Needs research] REST `where.*.in` 单次最大 ID 数量限制，batch 分页策略
- [Affects R8][Technical] TRAVERSE 是否默认传 `fields` 以在 neighbor 阶段预投影 RETURN 所需属性

## Next Steps

→ `/ce:plan` for structured implementation planning
