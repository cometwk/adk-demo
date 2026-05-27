---
date: 2026-05-27
topic: rest-query-compute-store
---

# RestQueryComputeStore：REST 聚合查询 Provider

## Problem Frame

V8 的 `ComputeStore` 目前仅有 `InMemoryComputeStore` 内存实现。Payment domain 的 REST demo 已验证 `RestQueryGraphStore` 图查询，但 OLAP 聚合仍依赖内存 seed 数据，无法对接后端 REST 聚合 API。

后端已提供独立的 Aggregate Query 协议（`api-search-params.md` §12），与 Row Query 分离，支持 `metrics`、`group_by`、`where`、`order`、`page/pagesize`。需要按 `RestQueryGraphStore` 的模式实现 `RestQueryComputeStore`，使 Agent pipeline 可通过同一 REST 后端执行 `compute_query`。

## Requirements

**核心 Provider**
- R1. 创建 `src/v8/provider/rest-query/react-query-compute.ts`，实现 `ComputeStore` 接口（`aggregate`、`getSources`、`getSourceSchema`）
- R2. 创建 `apiAggregate` / `apiAggregateSafe` 函数（`api-search.ts`），调用 REST 聚合端点，错误处理模式与 `apiSearchSafe` 一致
- R3. 创建 `computeQueryToAggregateParams` helper，将 `ComputeQuery` DSL 映射为 REST 聚合 query params：
  - `filters` → `where.{field}.{op}`
  - `metrics` → `metrics={fn}({field}).{alias}`（逗号分隔）
  - `groupBy` → `group_by={field1},{field2}`
  - `orderBy` → `order={field}.{asc|desc}`
  - `limit/offset` → `pagesize/page`

**数据源映射**
- R4. `ComputeQuery.source` 复用 GraphStore 的 `typeRegistry`：`source` 名 = 实体类型名，通过 `typeRegistry[source].prefix` 定位 REST prefix
- R5. 未知 source 或无 prefix 时，`aggregate` 返回空结果（与 `InMemoryComputeStore` 行为一致），不抛异常

**Schema 与 Sources 元数据**
- R6. `getSourceSchema(source)` 从 ontology 实体属性推导 `FieldSchema[]`：
  - `type: 'number'` → `{ type: 'number', aggregatable: true }`
  - 其他类型 → `{ aggregatable: false }`，类型映射：`string`/`date`/`boolean`
- R7. `getSources()` 仅返回 ontology 中存在且至少有一个 `aggregatable: true` 字段的实体类型；同时必须在 `typeRegistry` 中有 prefix 注册

**结果归一化**
- R8. REST 聚合 API 返回扁平行（group_by 列与 metric 别名同级），`aggregate` 必须归一化为 `ComputeRow`：
  - 有 `groupBy` 时：将 group_by 字段值收集到 `row.group` 对象，metric 别名作为同级属性
  - 无 `groupBy` 时：仅返回 metric 别名属性（单行全局聚合）
- R9. `ComputeQueryResult.total` 取 REST 响应的 total；`truncated` 按分页是否还有更多数据推断；`executionTimeMs` 记录客户端耗时

**导出与结构**
- R10. 在 `src/v8/provider/rest-query/index.ts` 导出 `RestQueryComputeStore` 及相关 helpers
- R11. 构造函数接受 `typeRegistry: RestNodeClassRegistry` 和 `ontology: Ontology`（与 GraphStore demo 的 context 组合方式一致）

## Success Criteria

- `RestQueryComputeStore` 完整实现 `ComputeStore` 三个方法，接口签名与 `InMemoryComputeStore` 一致
- `ComputeQuery` → REST params → `ComputeQueryResult` 全链路可工作（可用 mock 或集成测试验证）
- 聚合结果形状与 `InMemoryComputeStore` 一致（含 `group` 包装），现有 engine/orchestrator 无需修改
- Filter / metric / groupBy / orderBy / pagination 映射符合 `api-search-params.md` §12 协议

## Scope Boundaries

- 不修改 rest demo（`demo/case/rest/helper.ts` 仍用 `InMemoryComputeStore`）
- 不实现 `having`（协议标注为 future）
- 不修改 `ComputeStore` 接口或 `ComputeQuery` DSL
- 不实现 REST schema/metadata 端点调用（schema 仅从 ontology 推导）
- 不在本次实现 ComputeStore 的 policy/redaction 层（与 InMemory 一致，orchestrator 层处理）

## Key Decisions

- **Source 映射**：复用 `typeRegistry`，不引入独立 compute registry
- **Schema 来源**：从 ontology 属性类型推导，number 字段可聚合
- **结果形状**：归一化为 `{ group?, ...metrics }`，保持与 InMemory 一致
- **交付范围**：仅 provider 层，demo 集成后续单独进行
- **getSources 过滤**：仅返回有 aggregatable 字段且在 typeRegistry 注册的实体

## Dependencies / Assumptions

- 后端 REST 聚合端点可用，query param 格式遵循 `api-search-params.md` §12
- `typeRegistry` 与 ontology 实体名一致（如 `OrderDaily`、`ProfitDaily`）
- Filter op 映射复用现有 `GRAPH_FILTER_TO_API_OP` 规则（`ne` → `neq` 等）
- `count(*)` 映射为 `metrics=count(*).{alias}`，`count(field)` 映射为 `metrics=count({field}).{alias}`

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Needs research] REST 聚合端点确切 URL 路径（推测 `/admin{prefix}/searchAggregate` 或与 Row Query 共用 `/search` 加 aggregate params，需对照 Go 后端确认）
- [Affects R6][Technical] ontology 属性类型到 `FieldSchema.type` 的完整映射表（如 `number` vs `integer`、`datetime` vs `date`）
- [Affects R9][Technical] REST 聚合响应 JSON 结构（是否复用 `TableData<T>` 分页格式）
- [Affects R3][Technical] `between` filter 在 REST where 语法中的表达方式（Row Query 文档中需确认）

## Next Steps

→ `/ce:plan` for structured implementation planning
