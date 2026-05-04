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

**核心功能**
- R1. `search_nodes` 必须支持 `relatedTo?: string` 参数，用于限定搜索范围到与指定节点有图连接关系的节点集合
- R2. `search_nodes` 必须支持 `relation?: string` 参数，用于进一步限定特定关系类型（如 `'borrows'`, `'managed_by'`）
- R3. 当 `relatedTo` 提供时，搜索范围应限定在该节点的邻居节点（直接连接的一跳范围）

**搜索行为**
- R4. `query` 参数语义应扩展：不仅匹配 nodeId 子字符串，还应支持匹配节点属性内容（如 title、name）
- R5. 参数组合逻辑：`relatedTo` + `query` + `type` + `relation` 应可叠加使用，逐步缩小结果集

**权限与安全**
- R6. 结果必须经过 `checkEntityAccess` 和 `checkTypeAccess` 过滤，确保不泄露无权限的节点

## Success Criteria

- `search_nodes({ relatedTo: 'xiao_ming', query: '三体' })` 应返回 `book_three_body`（小明借阅的书）
- `search_nodes({ relatedTo: 'xiao_ming', relation: 'borrows' })` 应只返回小明当前借阅的书，不包含 `overdue` 或 `requests` 关系的书
- `search_nodes({ relatedTo: 'xiao_ming', type: 'Book' })` 应返回所有与小明有关系的 Book 类型节点
- 不提供 `relatedTo` 时，行为应与当前实现一致（全局搜索）

## Scope Boundaries

- **不涉及**：多跳邻居搜索（如 2-hop、3-hop），当前需求仅覆盖直接邻居（1-hop）
- **不涉及**：属性搜索的复杂查询语法（如正则、模糊匹配），仅支持简单子字符串匹配
- **不涉及**：图遍历的性能优化（如 BFS/DFS 索引），当前图规模较小，遍历性能可接受

## Key Decisions

- **relatedTo 定义为 1-hop 邻居**：而非全图可达节点。理由：一跳范围足够支持"证据驱动"探索，多跳会扩大结果集、增加复杂度
- **relation 作为可选过滤**：而非必须与 relatedTo 配对。理由：允许用户先探索邻居，再按关系细化
- **query 扩展到属性搜索**：而非仅 nodeId。理由：用户更常搜索有意义的属性（如书名 "三体"），而非内部 ID

## Dependencies / Assumptions

- 底层 `Graph.searchNodes` 方法需要重构，支持 relatedTo 和 relation 参数
- 工具层 `graph.ts` 的 `search_nodes` schema 需要更新参数定义
- 属性搜索依赖 `BaseNode.getProperties()` 方法已正确实现

## Outstanding Questions

### Resolve Before Planning

- [Affects R4][User decision] 属性搜索的具体范围：搜索所有属性值，还是只搜索特定属性（如 `title`, `name`）？

### Deferred to Planning

- [Affects R3][Technical] `relatedTo` 节点不存在时的错误处理：返回空列表还是报错？
- [Affects R4][Technical] 属性值可能为非字符串类型（如 number、boolean），如何处理匹配？

## Next Steps

→ Resume `/ce:brainstorm` to resolve the `R4` question before planning