---
title: feat: RestQueryComputeStore REST 聚合 Provider
type: feat
status: completed
date: 2026-05-27
origin: docs/brainstorms/2026-05-27-rest-query-compute-store-requirements.md
---

# feat: RestQueryComputeStore REST 聚合 Provider

## Overview

为 V8 `ComputeStore` 新增 REST 后端实现 `RestQueryComputeStore`，将 `ComputeQuery` DSL 映射为 `api-search-params.md` §12 定义的聚合 query params，通过独立聚合端点执行 OLAP 查询，结果归一化为与 `InMemoryComputeStore` 一致的 `ComputeRow` 形状。

## Problem Frame

Payment domain REST demo 已验证 `RestQueryGraphStore`，但 OLAP 聚合仍依赖 `InMemoryComputeStore` seed 数据。Agent pipeline 的 `compute_query` 工具需要能对接同一 REST 后端，完成 `OrderDaily` / `ProfitDaily` 等扁平表的远程聚合。(see origin: `docs/brainstorms/2026-05-27-rest-query-compute-store-requirements.md`)

## Requirements Trace

- R1. 实现 `RestQueryComputeStore`（`aggregate` / `getSources` / `getSourceSchema`）
- R2. 新增 `apiAggregate` / `apiAggregateSafe`
- R3. `ComputeQuery` → REST aggregate params 映射 helper
- R4–R5. `source` 复用 `typeRegistry` prefix；未知 source 返回空结果
- R6–R7. Schema 从 ontology 推导；`getSources` 仅返回有 aggregatable 字段且在 registry 注册的实体
- R8–R9. 扁平行归一化为 `ComputeRow`；填充 `total` / `truncated` / `executionTimeMs`
- R10–R11. 导出 + 构造函数接受 `typeRegistry` + `ontology`

## Scope Boundaries

- 不修改 rest demo（`demo/case/rest/helper.ts`）
- 不实现 `having`、policy/redaction 层
- 不修改 `ComputeStore` 接口或 `ComputeQuery` DSL
- 不调用 REST schema/metadata 端点

## Context & Research

### Relevant Code and Patterns

| 文件 | 用途 |
| --- | --- |
| `src/v8/provider/in-memory/in-memory-compute.ts` | `ComputeStore` 行为基准（空 source、group 包装、metric alias） |
| `src/v8/provider/rest-query/react-query-store.ts` | Provider 结构：`typeRegistry`、prefix 解析、`apiSearchSafe` 模式 |
| `src/v8/provider/rest-query/api-search.ts` | HTTP 封装模板：`/admin{prefix}/search` → 聚合应为独立端点 |
| `src/v8/provider/rest-query/helpers.ts` | `filtersToSearchParams` + `GRAPH_FILTER_TO_API_OP` 映射 |
| `src/v8/provider/rest-query/api-search-params.md` §12 | 聚合协议：`metrics`、`group_by`、`where`、`order`、`page/pagesize` |
| `src/v8/provider/rest-query/http-client.ts` | `SearchParams` 类型（§10 已含 `metrics` / `group_by`） |
| `src/v8/engine/query/compute-query.ts` | `ComputeQuery` / `ComputeRow` / `ComputeQueryResult` 类型 |
| `src/v8/ontology/schema.ts` + `registry.ts` | `Ontology.types[].properties` 用于 schema 推导 |
| `src/v8/provider/in-memory/tests/compute-store.test.ts` | 测试场景参考（groupBy、orderBy、pagination、filters） |
| `src/v8/provider/rest-query/tests/helpers.test.ts` | helper 单测风格（vitest） |

### Institutional Learnings

- 无 `docs/solutions/` 相关条目
- V6 `api-search.ts` 与 V8 完全同构，无 aggregate 先例——本次为 net new

### External References

- `src/v8/provider/rest-query/api-search-params.md` §12（聚合协议唯一权威来源）

## Key Technical Decisions

- **聚合端点路径**：采用 `/admin{prefix}/searchAggregate`，与 Row Query 的 `/search`、`/searchWhere` 命名对称 (see origin §Dependencies)。实现首个 unit 时若 404，对照 Go 后端 `BindAggregateQueryStringWithTable` 路由确认并修正常量。(see origin: deferred Q1)
- **响应格式**：复用 `TableData<T>` 分页结构（`{ data, page, pagesize, total }`），与 `apiSearch` 一致，映射为 `Paginated<T>` 后再归一化 rows
- **Filter op 映射**：复用 `GRAPH_FILTER_TO_API_OP`（`ne→neq`）；`between` 展开为两个 where 条件 `gte` + `lte`（REST 协议未定义 `between` 操作符）
- **Metric 默认 alias**：与 InMemory 一致，`as ?? \`${fn}_${field}\``
- **Schema 推导**：ontology `TypeProperty.type` 映射：`number|integer|float` → `{ type:'number', aggregatable:true }`；`boolean` → boolean；`date|datetime|timestamp` → date；其余 → string
- **404 处理**：`apiAggregateSafe` 共享 `unavailablePrefixes` 黑名单，与 `apiSearchSafe` 行为一致
- **contains 不支持**：`ComputeFilter` 无 `contains`，无需处理

## Open Questions

### Resolved During Planning

- **聚合端点 URL**：`/admin{prefix}/searchAggregate`（对称命名，实现时验证）
- **响应 JSON**：复用 `TableData<T>`，total 来自响应 `total` 字段
- **between filter**：展开为 `where.{field}.gte` + `where.{field}.lte` 两个 param
- **ontology 类型映射**：见 Key Technical Decisions

### Deferred to Implementation

- Go 后端 `searchAggregate` 路由若与假设不符，仅需改 `api-search.ts` 中路径常量
- 聚合端点是否也支持 `searchWhere` 式无分页数组返回（当前按 TableData 分页处理）

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification.*

```text
ComputeQuery
    │
    ▼
computeQueryToAggregateParams()     ← filters/metrics/groupBy/orderBy/page
    │
    ▼
apiAggregateSafe(prefix, params)    ← GET /admin{prefix}/searchAggregate
    │
    ▼
TableData<flatRow> → Paginated
    │
    ▼
normalizeAggregateRows(flatRows, groupBy, metricAliases)
    │
    ▼
ComputeQueryResult { rows, total, truncated, executionTimeMs }
```

```text
getSourceSchema(source)
    ontology.types.find(source).properties
        → map TypeProperty.type → FieldSchema

getSources()
    ontology.types
        .filter(hasAggregatableField)
        .filter(typeRegistry.has(prefix))
        → ComputeSource[]
```

## Implementation Units

- [ ] **Unit 1: API 层 — apiAggregate + SearchParams 扩展**

**Goal:** 提供 REST 聚合 HTTP 封装，错误处理与 Row Query 一致。

**Requirements:** R2, R9

**Dependencies:** None

**Files:**
- Modify: `src/v8/provider/rest-query/api-search.ts`
- Modify: `src/v8/provider/rest-query/http-client.ts`（确认 `metrics` / `group_by` 已在 SearchParams 类型中）
- Test: `src/v8/provider/rest-query/tests/api-search.test.ts`（新建）

**Approach:**
- 新增 `AGGREGATE_PATH = '/searchAggregate'` 常量（或内联，便于一处修改）
- `apiAggregate<T>`: `axios.get(\`/admin${prefix}/searchAggregate\`, { params })` → 解析 `TableData<T>` → 返回 `Paginated<T>`
- `apiAggregateSafe`: 复用 `unavailablePrefixes` + `isNotFoundError` + `emptyPaginated` 模式
- `resetUnavailablePrefixes` 已存在，无需改动

**Patterns to follow:**
- `src/v8/provider/rest-query/api-search.ts` 中 `apiSearch` / `apiSearchSafe`

**Test scenarios:**
- Happy path: mock axios 返回 TableData，验证 Paginated 结构（items、page.total、page.hasMore）
- Error path: 404 响应 → 返回 emptyPaginated 且 prefix 加入 unavailablePrefixes
- Error path: 非 404 错误 → 向上抛出
- Edge case: prefix 已在 unavailablePrefixes → 直接返回 empty，不发请求

**Verification:**
- apiAggregate 单测通过，mock 不依赖真实后端

---

- [ ] **Unit 2: Helpers — DSL → params + 结果归一化 + schema 推导**

**Goal:** 将 ComputeQuery 映射为 REST params，将 REST 扁平行归一化为 ComputeRow，从 ontology 推导 FieldSchema。

**Requirements:** R3, R6, R8

**Dependencies:** None（纯函数，可先于 Unit 1 编写测试）

**Files:**
- Modify: `src/v8/provider/rest-query/helpers.ts`
- Test: `src/v8/provider/rest-query/tests/helpers.test.ts`（扩展现有文件）

**Approach:**
- **`computeFiltersToSearchParams(filters)`**: 复用 `GRAPH_FILTER_TO_API_OP`；`between` 展开为 gte+lte；`in` 数组 join 逗号；不支持 op 跳过
- **`metricsToParam(metrics)`**: `[{ field:'*', fn:'count', as:'total' }]` → `count(*).total`；多 metric 逗号 join
- **`computeQueryToAggregateParams(query)`**: 组合 filters + metrics + group_by + order + page/pagesize；不传 select
- **`normalizeAggregateRows(rows, groupBy, metricAliases)`**: groupBy 字段从扁平行提取到 `row.group`；metric 别名保留为 top-level key；无 groupBy 时仅 metric keys
- **`ontologyTypeToFieldSchema(typeProp)`** / **`ontologyToSourceSchema(ontology, source)`**: 类型映射见 Key Technical Decisions

**Execution note:** 先写 helper 单测（test-first），再实现函数。

**Patterns to follow:**
- `filtersToSearchParams` 的 op 映射和分页计算逻辑
- `InMemoryComputeStore.computeAggregation` 的 group 包装语义

**Test scenarios:**
- Happy path filters: eq/ne/gt/in → 正确 where params
- Edge case between: `{ op:'between', value:[100,500] }` → gte + lte 两个 param
- Happy path metrics: count(*)、sum(field)、多 metric 逗号分隔
- Happy path full query: filters + metrics + groupBy + orderBy + limit/offset → 完整 params
- Happy path normalize: 扁平行 `{ status:'active', total:10, amount:500 }` + groupBy `['status']` → `{ group:{status:'active'}, total:10, amount:500 }`
- Edge case normalize: 无 groupBy → 仅 metric keys，无 group 字段
- Happy path schema: ontology OrderDaily properties → FieldSchema[]（number 字段 aggregatable:true）
- Edge case schema: 未知 source → `{ fields: [] }`

**Verification:**
- helpers.test.ts 新增 describe 块全部通过

---

- [ ] **Unit 3: RestQueryComputeStore 核心类**

**Goal:** 实现 `ComputeStore` 接口，串联 helpers + apiAggregate。

**Requirements:** R1, R4, R5, R7, R8, R9, R11

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/provider/rest-query/react-query-compute.ts`
- Test: `src/v8/provider/rest-query/tests/react-query-compute.test.ts`（新建）

**Approach:**
- 构造函数: `(typeRegistry: RestNodeClassRegistry, ontology: Ontology)`
- **`aggregate(query)`**:
  1. 解析 `typeRegistry[query.source]?.prefix`；无则返回 `{ rows:[], total:0, truncated:false, executionTimeMs }`
  2. `computeQueryToAggregateParams(query)` → params
  3. `apiAggregateSafe(prefix, params)` → paginated
  4. 收集 metric aliases（`as ?? fn_field`）
  5. `normalizeAggregateRows(paginated.items, query.groupBy, aliases)`
  6. 返回 `{ rows, total: paginated.page.total, truncated: paginated.page.hasMore, executionTimeMs }`
- **`getSources()`**: 遍历 ontology.types，filter aggregatable + typeRegistry 有 prefix
- **`getSourceSchema(source)`**: `ontologyToSourceSchema(ontology, source)`

**Patterns to follow:**
- `InMemoryComputeStore` 三个 public 方法签名与空 source 行为
- `RestQueryGraphStore` 构造函数 + typeRegistry 用法

**Test scenarios:**
- Happy path aggregate: mock apiAggregateSafe 返回扁平行 → 验证 ComputeRow group 包装
- Edge case: 未知 source → 空结果，不调用 API
- Happy path getSources: mock ontology + registry → 仅 OrderDaily/ProfitDaily 等有 number 字段的实体
- Happy path getSourceSchema: OrderDaily → 含 total_amount aggregatable:true
- Edge case getSourceSchema: 未知 source → `{ fields: [] }`
- Integration (mock): 完整 ComputeQuery 端到端 params 传递验证（spy on apiAggregateSafe）

**Verification:**
- react-query-compute.test.ts 全部通过
- 接口与 `InMemoryComputeStore` 签名一致

---

- [ ] **Unit 4: 导出与文档注释**

**Goal:** 对外暴露新 Provider 和 helpers。

**Requirements:** R10

**Dependencies:** Unit 3

**Files:**
- Modify: `src/v8/provider/rest-query/index.ts`

**Approach:**
- 导出 `RestQueryComputeStore`
- 导出 `computeQueryToAggregateParams`、`normalizeAggregateRows`（供测试和 demo 复用）
- 导出 `apiAggregate`、`apiAggregateSafe`

**Test scenarios:**
- 无新增测试；编译通过即可（`tsc` 或 vitest import smoke）

**Verification:**
- 从 `../../../provider/rest-query` 可 import `RestQueryComputeStore`

## System-Wide Impact

- **Interaction graph:** `engine/runtime/orchestrator.ts` 的 `computeStore.aggregate()` 无需修改；pipeline session 注入时可选替换为 `RestQueryComputeStore`
- **Error propagation:** HTTP 404 → 空结果（safe 模式）；其他错误向上抛至 orchestrator
- **State lifecycle risks:** `unavailablePrefixes` 与 GraphStore 共享全局 Set——prefix 404 后 Graph 和 Compute 均跳过该 prefix（与现有行为一致）
- **API surface parity:** 新增 export，不破坏现有 GraphStore API
- **Integration coverage:** 本次仅 mock 单测；真实后端集成留待 demo 接线阶段
- **Unchanged invariants:** `ComputeStore` 接口、`ComputeQuery` DSL、`InMemoryComputeStore` 行为不变

## Risks & Dependencies

| Risk | Mitigation |
| --- | --- |
| 聚合端点路径假设错误 | 路径抽为常量；Unit 1 实现时对照 Go 后端验证 |
| REST 扁平行字段名与 alias 不一致 | normalize 时使用 query.metrics 的 alias 列表作为 metric key 白名单 |
| ontology 属性 type 字符串不规范 | 映射表设 default fallback → string, aggregatable:false |
| between 展开语义与后端 AND 行为 | 与 Row Query where 多条件 AND 一致，符合协议 |
| 共享 unavailablePrefixes 副作用 | 接受（与 GraphStore 现有设计一致）；文档注释说明 |

## Documentation / Operational Notes

- 无需更新 demo 文档（demo 未接线）
- 可在 `src/v8/guide/engine/compute-store.md` 追加 RestQueryComputeStore 用法段落（可选，非本次必须）

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-27-rest-query-compute-store-requirements.md](../brainstorms/2026-05-27-rest-query-compute-store-requirements.md)
- Aggregate protocol: `src/v8/provider/rest-query/api-search-params.md` §12
- Reference impl: `src/v8/provider/in-memory/in-memory-compute.ts`
- Provider pattern: `src/v8/provider/rest-query/react-query-store.ts`
- Prior provider plan: `docs/plans/2026-05-24-002-feat-v8-rest-query-provider-plan.md`
