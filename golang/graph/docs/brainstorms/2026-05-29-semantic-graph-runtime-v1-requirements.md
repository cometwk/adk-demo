---
date: 2026-05-29
topic: semantic-graph-runtime-v1
---

# Semantic Graph Runtime V1 实现需求

## Problem Frame

Semantic Graph Runtime 已完成 Query DSL、Graph Traversal Planner、Projection/SQL Compiler 三份详细设计（`query-dsl.md`、`query-planner.md`、`query-compiler.md`），并通过文档评审（`review-report.md`）。当前 `graph` 包仅有设计文档，无 Go 实现。

目标是在 **内部服务场景**（Agent / 后端微服务）下，交付 V1 核心编译流水线，使 Agent 能通过 JSON DSL 表达图语义遍历（含 exists/none 反连接），编译为参数化 SQL 并执行 Query 投影。Traversal 与 Projection 解耦，支持 plan 缓存复用。

## Requirements

**核心编译流水线**
- R1. 实现 Graph Traversal Planner：接收 DSL 的 `match + traverse`，输出不可变 `TraversalPlan` IR（含 AliasBindings、ExistentialScopes、Cardinality 分析）
- R2. 实现 Projection Planner（Query 模式）：校验 select/order_by alias 合法性，决定分页策略，输出 `QueryProjection` IR
- R3. 实现 SQL Compiler：将 `(TraversalPlan, QueryProjection)` 编译为 `(sql string, args []any)`，支持 INNER/LEFT JOIN、EXISTS/NOT EXISTS、ORDER BY、LIMIT/OFFSET
- R4. 支持全部四种 `require` 语义：`always`（INNER JOIN）、`optional`（LEFT JOIN）、`exists`（SEMI JOIN）、`none`（ANTI JOIN）
- R5. 支持两种分页策略：`PaginateDirect`（无 fan-out）和 `PaginateRootFirst`（存在 1:N 物化路径）

**Plan 缓存与 API**
- R6. Plan ID 使用 `SHA256(canonical_json(match + traverse))` 确定性生成，天然去重
- R7. V1 使用进程内 `sync.Map` PlanCache；同一 match+traverse 不重复编译
- R8. 暴露两轮 HTTP API：`POST /graph/plan`（仅编译 traversal）和 `POST /graph/query`（通过 plan_token + return 编译并执行 Query）
- R9. HTTP 层为薄封装，核心逻辑在 Go library 中可独立调用和测试

**安全与资源边界**
- R10. V1 信任内部调用方提供的 DSL 字段名，不做 Table Schema 字段存在性校验；安全边界依赖网络隔离与内部服务信任模型
- R11. 所有用户值通过 `?` 占位符参数化，禁止值直接拼入 SQL
- R12. V1 加入硬资源限制：max traverse 步数、max IN 数组大小、max LIMIT、查询超时；超出限制返回明确错误

**校验**
- R13. Planner 阶段执行设计文档定义的全部 V1 校验规则（alias 唯一性、relation 存在性、existential alias 不可 select、require 值合法性、in/not_in 非空数组等）
- R14. `match.type` 强制 snake_case，与数据库物理表名精确匹配

## Success Criteria

- `query-dsl.md` §6 第一个完整示例（5 月无日交易商户 + agent_rel）能端到端编译为等价 SQL 并返回正确结果
- 四种 `require` 类型各自至少有一个测试用例验证 SQL 语义正确
- `PaginateRootFirst` 在 1:N fan-out 场景下保证根表分页数量正确（不多不少）
- 同一 match+traverse 两次 `/graph/plan` 返回相同 plan_token，第二次命中缓存
- 超出资源限制的 DSL 输入返回结构化错误，不执行 SQL
- Library 层可脱离 HTTP 独立调用：`CompilePlan(dsl) → CompileQuery(plan, return) → (sql, args)`

## Scope Boundaries

- **不含** Metric Planner / Aggregate 模式（`/graph/aggregate` 延后）
- **不含** COUNT 专用 API（`POST /graph/count`）
- **不含** 单次调用便捷端点（完整 DSL 一步执行）
- **不含** 认证/授权层（依赖内部网络边界；不面向公网）
- **不含** Table Schema Registry 字段校验
- **不含** Redis 分布式 Plan 缓存（V2）
- **不含** V2 特性：嵌套 existential scope、全称量 ALL、OR 谓词、many_to_many relation、HAVING、多 SQL 方言
- **不含** 分支遍历（从同一节点沿两条不同 relation 同时展开）

## Key Decisions

- **内部服务专用**：API 不对外暴露，简化认证模型，信任调用方 DSL 输入
- **Library-first**：V1 交付核心是 Go library（Planner + Compiler），HTTP 为薄封装
- **Query-only**：Aggregate 模式明确排除在 V1 之外，降低首版复杂度
- **Trust DSL 字段名**：接受评审识别的 SQL 注入风险，在内部信任模型下 V1 不引入 Schema Registry 校验；文档中诚实标注安全边界
- **两轮 API**：仅支持 plan → query 模式，不支持单次调用；Agent 通过 plan_token 复用 traversal
- **SHA256 确定性 plan_token**：利用内容寻址实现天然缓存去重；内部场景下可接受确定性 ID
- **硬资源限制**：V1 即加入 traverse 步数、IN 大小、LIMIT 上限、查询超时限制
- **完整分页策略**：Direct + RootFirst 均在 V1 范围内

## Dependencies / Assumptions

- 底层数据库为 MySQL，SQL 方言按设计文档 V1 范围
- Relation Schema Registry 和 TableSchemaRegistry（至少用于 RootPrimaryKey 解析）需在 V1 中可用
- 执行层使用 Xorm Engine（`QueryInterface()` 返回 `[]map[string]interface{}`）
- Web 框架使用 Echo（与现有代码库一致）
- 现有 `demo/pkg/query/` 包的 operator 映射可作为参考，但 Graph Runtime 是独立的新抽象层，不强制复用

## Alternatives Considered

| 方案 | 结论 |
|------|------|
| 完整 V1（含 Aggregate + HTTP + Cache） | 范围过大，首版交付周期长 |
| 纯 library 无 HTTP | 用户选择 library-first 但保留薄 HTTP 封装 |
| TableSchemaRegistry 字段校验 | 更安全但增加 V1 复杂度；内部场景下延后 |
| 随机 UUID plan_token | 更安全但失去内容寻址去重；内部场景下选择 SHA256 |
| 仅 PaginateDirect | 无法正确处理 fan-out 分页；用户选择完整支持 |

## Outstanding Questions

### Resolve Before Planning

（无阻塞项——以下决策已在 brainstorm 中确认）

### Deferred to Planning

- [Affects R12][Technical] 硬限制的具体数值：max traverse 步数、max IN 数组大小、max LIMIT、查询超时默认值
- [Affects R1][Technical] Relation Schema Registry 的配置方式（Go 代码注册 vs YAML/JSON 配置文件）
- [Affects R7][Technical] PlanCache 是否需要 V1 即加入 LRU 淘汰或最大条目数（评审 P2 建议）
- [Affects R1][Needs research] 与现有 `demo/pkg/query/` 的重叠部分是否抽取共享 operator 映射包
- [Affects R5][Technical] 复合主键（composite PK）在 PaginateRootFirst 下的处理方式（评审残余风险）
- [Affects R6][Technical] `WherePredicate.Value` 的 `any` 类型 JSON 序列化确定性对 Plan ID 缓存命中率的影响

## Next Steps

→ `/ce:plan` for structured implementation planning
