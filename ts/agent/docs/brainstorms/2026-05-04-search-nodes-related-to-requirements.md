---
date: 2026-05-04
topic: search-nodes-related-to
---

# search_nodes relatedTo 参数需求

## Problem Frame

当前 `search_nodes` 只能进行全局搜索，在大型图中会产生大量无关结果：
- 全局搜索 `query: "风险"` 可能返回 500+ 节点，浪费 Token
- 模型难以判断哪些结果真正与当前任务上下文相关
- 无法支持"证据驱动"的定向探索模式

Agent 需要一种能力：**在特定节点的关系域内定向搜索**，而非全图中漫无目的地检索。

## Requirements

**Phase 1: relatedTo 参数（当前目标）**
- R1. `search_nodes` 必须支持 `relatedTo?: string` 参数，用于限定搜索范围到与指定节点有图连接关系的节点集合（1-hop 邻居）
- R2. 当 `relatedTo` 提供时，返回双向邻居结果，每条结果标注 `direction: 'out' | 'in'` 供调用方过滤
- R3. 参数组合逻辑：`relatedTo` + `type` 应可叠加使用，逐步缩小结果集
- R4. 结果必须经过 `checkEntityAccess` 和 `checkTypeAccess` 过滤，确保不泄露无权限的节点
- R5. 不提供 `relatedTo` 时，行为应与当前实现一致（全局搜索）

**Phase 2: 属性搜索扩展（后续迭代）**
- R6. `query` 参数语义应扩展：不仅匹配 nodeId 子字符串，还应支持匹配 `agentVisible: true` 的节点属性内容（如 title、name）
- *依赖：需先解决 Ontology 与 Registry 的架构分离问题，使运行时可获取 agentVisible 信息*

## Success Criteria

**Phase 1（当前目标）**
- `search_nodes({ relatedTo: 'xiao_ming' })` 应返回所有与 `xiao_ming` 有边关系的节点，每条结果包含 `relation` 和 `direction` 字段
- `search_nodes({ relatedTo: 'xiao_ming', type: 'Book' })` 应返回所有与小明有关系的 Book 类型节点
- `search_nodes({ relatedTo: 'city_library' })` 应返回所有与 city_library 有关系的节点（通过 `managed_by` 边连接的书），结果标注 `direction: 'in'`
- 不提供 `relatedTo` 时，行为应与当前实现一致（全局搜索，结果不含 relation/direction 字段）

**Phase 2（后续迭代）**
- `search_nodes({ relatedTo: 'xiao_ming', query: '三体' })` 应返回 `book_three_body`（匹配 title 属性）
- 需先完成架构统一，使 Registry 可获取 agentVisible 信息

## Scope Boundaries

**Phase 1**
- **不涉及**：多跳邻居搜索（如 2-hop、3-hop），当前仅覆盖直接邻居（1-hop）
- **不涉及**：属性内容搜索（query 仅匹配 nodeId，Phase 2 扩展）
- **不涉及**：图遍历的性能优化（如 BFS/DFS 索引），当前图规模较小

**Phase 2**
- **依赖**：Ontology 与 Registry 的架构统一（PropertySchema 增加 agentVisible 或 Ontology 成为单一数据源）
- **不涉及**：复杂查询语法（正则、模糊匹配），仅支持简单子字符串匹配

## Key Decisions

- **分步实现策略**：先实现 relatedTo（Phase 1），后扩展属性搜索（Phase 2）。理由：属性搜索依赖架构统一，避免阻塞核心功能
- **relatedTo 定义为 1-hop 邻居**：而非全图可达节点。理由：一跳范围足够支持"证据驱动"探索，多跳会扩大结果集、增加复杂度
- **返回双向结果**：不提供 relation 参数，返回所有邻居，结果中标注 `relation` 和 `direction` 让调用方自行过滤。理由：简化 API，让 Agent 在结果层面做过滤决策

## Dependencies / Assumptions

- 底层 `Graph.searchNodes` 方法需要重构，支持 relatedTo 参数
- 工具层 `graph.ts` 的 `search_nodes` schema 需要更新参数定义

## Outstanding Questions

### Resolve Before Planning

None — all blocking questions resolved.

### Deferred to Planning

- [Affects R3][Technical] `relatedTo` 节点不存在时的错误处理：返回空列表还是报错 `NOT_FOUND`？
- [Affects Phase 2][Architecture] Ontology 与 Registry 统一的方案：PropertySchema 增加 agentVisible，还是 Ontology 成为单一数据源？

## Next Steps

→ `/ce:plan` for structured implementation planning