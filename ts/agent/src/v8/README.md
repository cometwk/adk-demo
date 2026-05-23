V8 Phase 1 Semantic Reasoning Runtime 实现完成

实现概要



已完整实现 V8 engine 模块，包含以下组件：

Runtime 层

- SemanticRuntimeOrchestrator - 统一路由、Policy 执行、动态引用解析、FactStore 自动注入
- Workspace - 持有 bindings 和 candidates 的运行状态
- FactStore - 不可变只读快照

Stores 层

- InMemoryGraphStore - Traversal-only 图查询（移除 aggregate）
- InMemoryComputeStore - OLAP 聚合
- InMemoryVectorStore - 语义搜索 stub

Query DSL

- GraphTraversalQuery - MATCH→TRAVERSE→RETURN（Zod strict schema）
- ComputeQuery - filters/metrics/groupBy/orderBy
- VectorQuery - query/topK/minScore

Tools 层

- graph-tools: inspect_node, search_nodes, query_neighbors, graph_query
- compute-tools: compute_query
- vector-tools: vector_query
- fact-tools: bind_fact, lookup_fact
- candidate-tools: propose_candidates, record_evidence, declare_uncertainty, list_workspace

Agent 层

- runSemanticReasoningAgent - generateText + tools 执行器
- buildSemanticReasoningPrompt - System Prompt 构建器
- parseVerdict - JSON verdict 解析

测试覆盖

- 117 个测试全部通过
- 8 个测试文件覆盖所有单元和端到端场景
- 两阶段推理流程验证：graph_query → compute_query ($workspace.candidates)

关键特性

1. 查询分工：graph_query 做 traversal，compute_query 做 OLAP 聚合
2. 动态引用：compute_query 支持 $workspace.candidates 引用
3. Global ID 解析：parseGlobalId('Merch:M001') → {type:'Merch', rawId:'M001'}
4. FactStore 自动注入：Runtime 自动注入低阶快照，Agent 通过 bind_fact 绑定高阶语义断言
