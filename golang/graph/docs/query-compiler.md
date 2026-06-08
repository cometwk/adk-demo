# Projection Planner / Metric Planner + SQL Compiler 详细设计

## 1. 概述

本文档覆盖 Semantic Graph Runtime 的**第二阶段编译**：将 TraversalPlan IR 与投影定义（Query 或 Aggregate）合并，编译为可执行的 SQL。

架构位置：

```text
TraversalPlan (IR)
        │
    ┌───┴───┐
    ▼       ▼
Projection  Metric
Planner     Planner
    │          │
    ▼          ▼
SQL Compiler (SQL Compiler)
    │          │
    ▼          ▼
(sql string, args []any)
    │          │
    ▼          ▼
Xorm Engine.Execute
```

核心原则：

- **TraversalPlan 只读**：Planner 只读取 IR，绝不修改
- **单次 Plan，多次 Projection**：同一个 TraversalPlan 可驱动多次不同投影
- **SQL Compiler 是纯函数**：输入 (TraversalPlan, Projection)，输出 (sql, args)，无副作用
- **参数化查询**：所有用户值通过 `?` 占位符传入 args，防止 SQL 注入

---

## 2. 职责边界

### 2.1 Projection Planner（Query 模式）

| 职责 | 说明 |
|------|------|
| 校验 select alias 合法性 | alias 必须在 AliasBindings 中存在，且 ScopeType 为 Materialize |
| 校验 existential alias 不可引用 | `require: exists/none` 的 alias 不可出现在 select 中 |
| 校验 order_by alias/field 合法性 | 同上 |
| 决定分页策略 | 根据 HasFanOut 选择直接分页或 Root Pagination First |
| 构建 QueryProjection IR | 输出结构化的投影描述，交由 SQL Compiler 消费 |

### 2.2 Metric Planner（Aggregate 模式）

| 职责 | 说明 |
|------|------|
| 校验 metrics alias 合法性 | alias 必须存在且为 Materialize |
| 校验 group_by alias 合法性 | 同上 |
| 校验聚合函数合法性 | func 必须为 sum/count/avg/min/max |
| 聚合安全校验 | one_to_many 路径上的字段聚合语义是否正确 |
| 构建 MetricProjection IR | 输出结构化的聚合描述，交由 SQL Compiler 消费 |

### 2.3 SQL Compiler

| 职责 | 说明 |
|------|------|
| 生成 SELECT 子句 | 从 Projection/Metric IR 推导 |
| 生成 FROM + JOIN 子句 | 从 TraversalPlan.Steps 推导 |
| 生成 WHERE 子句 | RootPredicates + 各 step 的 non-existential predicates |
| 生成 EXISTS / NOT EXISTS 子查询 | 从 TraversalPlan.ExistentialScopes 推导 |
| 生成 ORDER BY 子句 | 仅 Query 模式 |
| 生成 LIMIT / OFFSET 子句 | 仅 Query 模式，含 Root Pagination First 策略 |
| 生成 GROUP BY 子句 | 仅 Aggregate 模式 |
| 参数绑定 | 收集所有谓词值，按出现顺序填充 args |

---

## 3. 投影 IR 数据结构

### 3.1 QueryProjection

```go
// QueryProjection 是 Projection Planner 的输出，描述 Query 模式的投影。
type QueryProjection struct {
    // SelectItems 是字段选择列表。
    SelectItems []*SelectItem `json:"select_items"`

    // OrderByItems 是排序规则列表。
    OrderByItems []*OrderByItem `json:"order_by_items"`

    // Limit 是分页大小。
    Limit int `json:"limit"`

    // Offset 是分页偏移。
    Offset int `json:"offset"`

    // PaginationStrategy 标注分页策略。
    PaginationStrategy PaginationStrategy `json:"pagination_strategy"`
}
```

### 3.2 SelectItem

```go
// SelectItem 描述一个字段选择项。
type SelectItem struct {
    // Alias 是字段所属的别名。
    Alias string `json:"alias"`

    // Fields 是要输出的字段列表。
    Fields []string `json:"fields"`

    // As 是字段重命名前缀（仅单字段时生效）。
    As string `json:"as"`
}
```

### 3.3 OrderByItem

```go
// OrderByItem 描述一个排序项。
type OrderByItem struct {
    Alias     string `json:"alias"`
    Field     string `json:"field"`
    Direction string `json:"direction"` // "asc" | "desc"
}
```

### 3.4 PaginationStrategy

```go
// PaginationStrategy 标注 Query 模式的分页策略。
type PaginationStrategy int

const (
    // PaginateDirect 表示直接在主查询上 LIMIT/OFFSET。
    // 适用于无 fan-out 或仅 N:1/1:1 物化路径的场景。
    PaginateDirect PaginationStrategy = iota

    // PaginateRootFirst 表示先对根表分页，再 JOIN 展开子表。
    // 适用于存在物化 1:N 路径的场景。
    PaginateRootFirst
)
```

### 3.5 MetricProjection

```go
// MetricProjection 是 Metric Planner 的输出，描述 Aggregate 模式的投影。
type MetricProjection struct {
    // Metrics 是聚合指标列表。
    Metrics []*MetricItem `json:"metrics"`

    // GroupByItems 是分组字段列表。
    GroupByItems []*GroupByItem `json:"group_by_items"`
}
```

### 3.6 MetricItem

```go
// MetricItem 描述一个聚合指标。
type MetricItem struct {
    Alias string `json:"alias"`
    Field string `json:"field"`
    Func  string `json:"func"` // "sum" | "count" | "avg" | "min" | "max"
    As    string `json:"as"`
}
```

### 3.7 GroupByItem

```go
// GroupByItem 描述一个分组字段。
type GroupByItem struct {
    Alias string `json:"alias"`
    Field string `json:"field"`
}
```

---

## 4. Projection Planner 编译流程

### 4.1 入口函数

```go
// PlanQuery 将 Query 模式的 return 定义编译为 QueryProjection IR。
func PlanQuery(
    plan *TraversalPlan,
    returnDef *QueryReturnDef,
) (*QueryProjection, error)
```

`QueryReturnDef` 对应 DSL 中 `return` 的 Query 模式部分：

```go
type QueryReturnDef struct {
    Select  []*SelectItem   `json:"select"`
    OrderBy []*OrderByItem  `json:"order_by"`
    Limit   int             `json:"limit"`
    Offset  int             `json:"offset"`
}
```

### 4.2 编译步骤

```text
┌──────────────────────────────────────┐
│  Step 1: 校验 Select Items           │
│  校验 alias 存在性 + scope 合法性     │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Step 2: 校验 OrderBy Items          │
│  校验 alias 存在性 + scope 合法性     │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Step 3: 确定分页策略                 │
│  HasFanOut → PaginateRootFirst       │
│  否则    → PaginateDirect            │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Step 4: 应用默认值                   │
│  Limit 默认 200，Offset 默认 0        │
│  Direction 默认 "asc"                 │
└──────────────┬───────────────────────┘
               │
               ▼
         QueryProjection IR
```

### 4.3 Step 1: 校验 Select Items

```text
FOR each item in returnDef.Select:
  1. 校验 item.Alias 在 plan.AliasBindings 中存在
     不存在 → ErrUndefinedAlias

  2. 获取 binding = plan.AliasBindings[item.Alias]
     如果 binding.ScopeType != ScopeMaterialize:
       → ErrSelectFromExistential
       （require: exists/none 的 alias 不可出现在 select 中）

  3. 校验 item.Fields 非空
     为空 → ErrEmptyFields
```

### 4.4 Step 2: 校验 OrderBy Items

```text
FOR each item in returnDef.OrderBy:
  1. 校验 item.Alias 在 plan.AliasBindings 中存在
     不存在 → ErrUndefinedAlias

  2. 获取 binding = plan.AliasBindings[item.Alias]
     如果 binding.ScopeType != ScopeMaterialize:
       → ErrOrderByExistential

  3. 校验 item.Direction 为 "asc" 或 "desc"
     非法 → ErrInvalidDirection
```

### 4.5 Step 3: 确定分页策略

```text
IF plan.HasFanOut == true:
    strategy = PaginateRootFirst
ELSE:
    strategy = PaginateDirect
```

### 4.6 Step 4: 应用默认值

```text
IF returnDef.Limit <= 0:
    returnDef.Limit = 200
IF returnDef.Offset < 0:
    returnDef.Offset = 0
FOR each item in returnDef.OrderBy:
    IF item.Direction == "":
        item.Direction = "asc"
```

---

## 5. Metric Planner 编译流程

### 5.1 入口函数

```go
// PlanAggregate 将 Aggregate 模式的 return 定义编译为 MetricProjection IR。
func PlanAggregate(
    plan *TraversalPlan,
    returnDef *AggregateReturnDef,
) (*MetricProjection, error)
```

`AggregateReturnDef` 对应 DSL 中 `return` 的 Aggregate 模式部分：

```go
type AggregateReturnDef struct {
    Metrics  []*MetricItem  `json:"metrics"`
    GroupBy  []*GroupByItem `json:"group_by"`
}
```

### 5.2 编译步骤

```text
┌──────────────────────────────────────┐
│  Step 1: 校验 Metrics                │
│  校验 alias + scope + func 合法性     │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Step 2: 校验 GroupBy Items          │
│  校验 alias + scope 合法性            │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Step 3: 聚合安全校验                 │
│  检测 one_to_many 路径上的聚合语义    │
└──────────────┬───────────────────────┘
               │
               ▼
         MetricProjection IR
```

### 5.3 Step 1: 校验 Metrics

```text
FOR each item in returnDef.Metrics:
  1. 校验 item.Alias 在 plan.AliasBindings 中存在
     不存在 → ErrUndefinedAlias

  2. 获取 binding = plan.AliasBindings[item.Alias]
     如果 binding.ScopeType != ScopeMaterialize:
       → ErrMetricFromExistential

  3. 校验 item.Func 为合法聚合函数
     合法值：sum, count, avg, min, max
     非法 → ErrInvalidAggFunc

  4. 校验 item.Field 非空
     为空 → ErrEmptyAggField
```

### 5.4 Step 2: 校验 GroupBy Items

```text
FOR each item in returnDef.GroupBy:
  1. 校验 item.Alias 在 plan.AliasBindings 中存在
     不存在 → ErrUndefinedAlias

  2. 获取 binding = plan.AliasBindings[item.Alias]
     如果 binding.ScopeType != ScopeMaterialize:
       → ErrGroupByExistential
```

### 5.5 Step 3: 聚合安全校验

此步骤检测 1:N 路径上可能产生的**聚合语义错误**。

核心问题：当 Traversal 中存在物化的 1:N 路径时，1 端的字段聚合可能因 N 端行展开而重复计算。

```text
规则：如果 plan.HasFanOut == true，按聚合函数类型分级校验。

示例：
  rel (1) --for_merch--> m (N:1) --has_order_daily--> od (1:N, materialized)

  此时 od 是 fan-out 展开端。

  GROUP BY rel.agent_no + COUNT(od.id)  → 安全（按父端分组，计数 fan-out 行）
  SUM(od.amount)                        → 安全（对 fan-out 端行聚合）
  SUM(m.deposit)                        → 危险！m 的行因 od 的 1:N 展开而重复

V1 策略（基于函数类型的准入制）：
  - GROUP BY：允许引用任意物化 alias（含 fan-out 父端）
  - COUNT / MIN / MAX：允许在 fan-out 端 alias 上执行
  - SUM / AVG：禁止在 fan-out 父端 alias 上执行（非 fan-out 端 alias + sum/avg → 报错）
V2 策略：自动注入 DISTINCT 或子查询去重，放宽父端 SUM/AVG 限制。
```

V1 校验逻辑：

```text
IF plan.HasFanOut == true:
    找到最后一个 IsFanOut=true 的 step，记其 ToAlias 为 fanOutAlias
    FOR each metric in metrics:
        IF metric.Alias != fanOutAlias AND metric.Func IN ("sum", "avg"):
            → ErrAggOnFanOutParent
            （V1 禁止对 fan-out 父端字段做 SUM/AVG，因行重复导致数值膨胀）
        // COUNT/MIN/MAX 在 fan-out 端执行，或 GROUP BY 在父端 + COUNT 在 fan-out 端，均允许
```

---

## 6. SQL Compiler

SQL Compiler 是纯函数，负责将 TraversalPlan + Projection IR 编译为参数化 SQL。

### 6.1 入口函数

```go
// CompileQuery 将 TraversalPlan + QueryProjection 编译为 SQL。
func CompileQuery(
    plan *TraversalPlan,
    projection *QueryProjection,
) (string, []any, error)

// CompileAggregate 将 TraversalPlan + MetricProjection 编译为 SQL。
func CompileAggregate(
    plan *TraversalPlan,
    metric *MetricProjection,
) (string, []any, error)
```

### 6.2 SQL 生成架构

```text
┌──────────────────────────────────────────────────┐
│                   SQL Template                    │
│                                                   │
│  SELECT <select_clause>                           │
│  FROM <from_clause>                               │
│    [INNER JOIN | LEFT JOIN <join_clause>]*        │
│  WHERE <where_clause>                             │
│    [AND [NOT] EXISTS (<exists_clause>)]*          │
│  [GROUP BY <group_by_clause>]                     │
│  [ORDER BY <order_by_clause>]                     │
│  [LIMIT ? OFFSET ?]                               │
└──────────────────────────────────────────────────┘
```

各子句由 TraversalPlan + Projection IR 中的信息推导而来：

| 子句 | 来源 | 模式 |
|------|------|------|
| SELECT | QueryProjection.SelectItems / MetricProjection.Metrics | Query / Aggregate |
| FROM | TraversalPlan.RootTable + RootAlias | 共用 |
| JOIN | TraversalPlan.Steps (ScopeIndex == -1 的步骤) | 共用 |
| WHERE | TraversalPlan.RootPredicates + 物化步骤的 Predicates | 共用 |
| EXISTS / NOT EXISTS | TraversalPlan.ExistentialScopes | 共用 |
| GROUP BY | MetricProjection.GroupByItems | Aggregate |
| ORDER BY | QueryProjection.OrderByItems | Query |
| LIMIT / OFFSET | QueryProjection.Limit / Offset + TraversalPlan.RootPrimaryKey | Query |

### 6.3 SQL Builder 内部结构

```go
// SQLBuilder 是 SQL Compiler 的内部状态，不导出。
type sqlBuilder struct {
    plan       *TraversalPlan
    buf        strings.Builder  // SQL 字符串缓冲
    args       []any            // 参数值列表
    argIndex   int              // 当前参数占位符计数
}
```

### 6.4 核心编译方法

```go
// 以下方法均操作 sqlBuilder 内部状态，按顺序调用。

// buildSelectClause 生成 SELECT 子句。
func (b *sqlBuilder) buildSelectClause(projection *QueryProjection)

// buildSelectClauseAggregate 生成聚合 SELECT 子句。
func (b *sqlBuilder) buildSelectClauseAggregate(metric *MetricProjection)

// buildFromClause 生成 FROM 子句。
func (b *sqlBuilder) buildFromClause()

// buildJoinClauses 生成所有 JOIN 子句（仅物化步骤）。
func (b *sqlBuilder) buildJoinClauses()

// buildWhereClause 生成 WHERE 子句（根谓词 + 物化步骤谓词）。
func (b *sqlBuilder) buildWhereClause()

// buildExistentialClauses 生成所有 EXISTS / NOT EXISTS 子查询。
func (b *sqlBuilder) buildExistentialClauses()

// buildGroupByClause 生成 GROUP BY 子句。
func (b *sqlBuilder) buildGroupByClause(metric *MetricProjection)

// buildOrderByClause 生成 ORDER BY 子句。
func (b *sqlBuilder) buildOrderByClause(projection *QueryProjection)

// buildLimitOffset 生成 LIMIT / OFFSET 子句。
func (b *sqlBuilder) buildLimitOffset(projection *QueryProjection)
```

---

## 7. SQL 编译详细规则

### 7.1 SELECT 子句（Query 模式）

```text
FOR each item in projection.SelectItems:
  FOR each field in item.Fields:
    IF item.As != "" AND len(item.Fields) == 1:
      输出: {item.Alias}.{field} AS {item.As}
    ELSE:
      输出: {item.Alias}.{field}
```

示例：

```text
SelectItems = [
    {Alias: "rel", Fields: ["agent_no", "obj_no"]},
    {Alias: "m",   Fields: ["id"], As: "merch_id"},
]

→ SELECT rel.agent_no, rel.obj_no, m.id AS merch_id
```

### 7.2 SELECT 子句（Aggregate 模式）

```text
FOR each item in metric.Metrics:
  IF item.As != "":
    输出: {item.Func}({item.Alias}.{item.Field}) AS {item.As}
  ELSE:
    输出: {item.Func}({item.Alias}.{item.Field})
```

示例：

```text
Metrics = [
    {Alias: "m", Field: "deposit_amt", Func: "sum", As: "total_deposit"}
]

→ SELECT SUM(m.deposit_amt) AS total_deposit
```

### 7.3 FROM 子句

```text
FROM {plan.RootTable} {plan.RootAlias}
```

示例：

```text
→ FROM agent_rel rel
```

### 7.4 JOIN 子句

遍历 `plan.Steps`，仅处理 `ScopeIndex == -1`（物化步骤）：

```text
FOR each step WHERE step.ScopeIndex == -1:
  IF step.Require == RequireAlways:
    输出: INNER JOIN {step.Relation.ToTable} {step.ToAlias}
           ON {step.JoinCondition.LeftAlias}.{step.JoinCondition.LeftField}
            = {step.JoinCondition.RightAlias}.{step.JoinCondition.RightField}

  IF step.Require == RequireOptional:
    输出: LEFT JOIN {step.Relation.ToTable} {step.ToAlias}
           ON {step.JoinCondition.LeftAlias}.{step.JoinCondition.LeftField}
            = {step.JoinCondition.RightAlias}.{step.JoinCondition.RightField}
```

示例：

```text
Steps[0] = {FromAlias:"rel", ToAlias:"m", Require:RequireAlways,
            Relation:{ToTable:"merch"},
            JoinCondition:{LeftAlias:"rel", LeftField:"merch_id",
                           RightAlias:"m", RightField:"id"}}

→ INNER JOIN merch m ON rel.merch_id = m.id
```

### 7.5 WHERE 子句

WHERE 子句由两部分组成：根谓词 + 物化步骤谓词。

```text
// Part 1: 根谓词
FOR each pred in plan.RootPredicates:
  输出: {pred.Alias}.{pred.Field} {op_sql} ?
  追加 pred.Value 到 args

// Part 2: 物化步骤的谓词（与根谓词以 AND 连接）
FOR each step WHERE step.ScopeIndex == -1:
  FOR each pred in step.Predicates:
    输出: AND {pred.Alias}.{pred.Field} {op_sql} ?
    追加 pred.Value 到 args
```

**op_sql 映射**：

| DSL op | SQL | 备注 |
|--------|-----|------|
| `eq` | `= ?` | |
| `neq` | `!= ?` | |
| `gt` | `> ?` | |
| `gte` | `>= ?` | |
| `lt` | `< ?` | |
| `lte` | `<= ?` | |
| `in` | `IN (?)` | V1 传数组，展开为 `IN (?, ?, ...)` |
| `not_in` | `NOT IN (?)` | 同上 |
| `like` | `LIKE ?` | |
| `is_null` | `IS NULL` / `IS NOT NULL` | Value=true → IS NULL, Value=false → IS NOT NULL，无参数 |

**`in` / `not_in` 展开规则**：

```go
func (b *sqlBuilder) expandInOp(field string, values []any) {
    if len(values) == 0 {
        // 空 IN 集合：field IN () 是非法 SQL，使用恒假条件替代
        b.buf.WriteString("1 = 0")
        return
    }
    placeholders := make([]string, len(values))
    for i, v := range values {
        placeholders[i] = "?"
        b.args = append(b.args, v)
    }
    b.buf.WriteString(fmt.Sprintf("%s IN (%s)", field, strings.Join(placeholders, ", ")))
}

func (b *sqlBuilder) expandNotInOp(field string, values []any) {
    if len(values) == 0 {
        // 空 NOT IN 集合：field NOT IN () 语义为"不在空集中"，恒为真
        b.buf.WriteString("1 = 1")
        return
    }
    placeholders := make([]string, len(values))
    for i, v := range values {
        placeholders[i] = "?"
        b.args = append(b.args, v)
    }
    b.buf.WriteString(fmt.Sprintf("%s NOT IN (%s)", field, strings.Join(placeholders, ", ")))
}
```

### 7.6 EXISTS / NOT EXISTS 子查询

遍历 `plan.ExistentialScopes`：

```text
FOR each scope in plan.ExistentialScopes:
  IF scope.Type == ScopeExists:
    输出: AND EXISTS (
  IF scope.Type == ScopeNotExists:
    输出: AND NOT EXISTS (

  // 子查询 SELECT
  输出:   SELECT 1

  // 子查询 FROM
  找到 scope.BoundaryAlias 对应的 step
  输出:   FROM {step.Relation.ToTable} {step.ToAlias}

  // 子查询 WHERE: 关联条件 + 步骤谓词
  输出:   WHERE {scope.Correlation.ChildAlias}.{scope.Correlation.ChildField}
           = {scope.Correlation.ParentAlias}.{scope.Correlation.ParentField}

  FOR each pred in step.Predicates:
    输出:     AND {pred.Alias}.{pred.Field} {op_sql} ?
    追加 pred.Value 到 args

  输出: )
```

示例：

```text
ExistentialScopes[0] = {
    Type: ScopeNotExists,
    BoundaryAlias: "od",
    Correlation: {ParentAlias:"m", ParentField:"id",
                  ChildAlias:"od", ChildField:"merch_id"},
}

Steps[1].Predicates = [
    {Alias:"od", Field:"report_date", Op:"gte", Value:"2026-05-01"},
    {Alias:"od", Field:"report_date", Op:"lte", Value:"2026-05-31"},
]

→ AND NOT EXISTS (
    SELECT 1
    FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
  )
```

### 7.7 GROUP BY 子句（Aggregate 模式）

```text
IF len(metric.GroupByItems) > 0:
  输出: GROUP BY
  FOR each item in metric.GroupByItems:
    输出: {item.Alias}.{item.Field}
    （多项之间逗号分隔）
```

示例：

```text
GroupByItems = [
    {Alias: "rel", Field: "agent_no"}
]

→ GROUP BY rel.agent_no
```

### 7.8 ORDER BY 子句（Query 模式）

```text
IF len(projection.OrderByItems) > 0:
  输出: ORDER BY
  FOR each item in projection.OrderByItems:
    输出: {item.Alias}.{item.Field} {item.Direction}
    （多项之间逗号分隔）
```

示例：

```text
OrderByItems = [
    {Alias: "rel", Field: "agent_no", Direction: "asc"}
]

→ ORDER BY rel.agent_no ASC
```

### 7.9 LIMIT / OFFSET 子句（Query 模式）

#### 7.9.1 PaginateDirect（无 fan-out）

```text
→ LIMIT ? OFFSET ?
追加 projection.Limit 和 projection.Offset 到 args
```

#### 7.9.2 PaginateRootFirst（有 fan-out）

当 `plan.HasFanOut == true` 时，采用子查询先对**过滤后的根行**分页，再在外层展开 fan-out JOIN。

**子查询边界规则**（V1 必须遵守）：

| 子句 | 内层子查询（分页前） | 外层查询（分页后） |
|------|---------------------|-------------------|
| FROM | 根表 | 根表（通过 `_roots` 重关联） |
| JOIN | 所有 `ScopeIndex == -1` 且 `IsFanOut == false` 的物化步骤 | 重放上述 non-fan-out JOIN（用于投影）+ 所有 `IsFanOut == true` 的 fan-out JOIN |
| WHERE | 根谓词 + non-fan-out 步骤谓词 | 无（已在内层完成） |
| EXISTS / NOT EXISTS | 全部 `ExistentialScopes` | 无（已在内层完成） |
| ORDER BY | 若排序字段均可由内层 alias 解析，则在内层排序 | 若排序字段引用 fan-out alias，则仅在外层排序 |
| LIMIT / OFFSET | 是 | 否 |

**关键约束**：内层子查询必须包含所有会改变根行资格（root eligibility）的约束——non-fan-out JOIN、谓词和 existential scope。仅 fan-out JOIN 本身延迟到外层，因为 1:N 展开会放大行数但不改变根行是否入选。

若将 existential 或 non-fan-out 谓词留在外层，内层 `LIMIT N` 会在过滤前取 N 条根行，外层再消除部分行，导致返回的根行数少于请求量，破坏分页保证。

```text
生成方式：将整体 SQL 包装为子查询结构

SELECT <select_clause>
FROM (
    SELECT {plan.RootAlias}.{plan.RootPrimaryKey}
    FROM {plan.RootTable} {plan.RootAlias}
    <non_fanout_joins>
    WHERE <root_and_non_fanout_predicates>
    <all_existential_clauses>
    [ORDER BY <inner_order_by>]
    LIMIT ? OFFSET ?
) _roots
INNER JOIN {plan.RootTable} {plan.RootAlias}
    ON {plan.RootAlias}.{plan.RootPrimaryKey} = _roots.{plan.RootPrimaryKey}
<non_fanout_joins_replay>
<fanout_joins>
[ORDER BY <outer_order_by>]
```

**RootPrimaryKey 来源**：

```text
RootPrimaryKey 由 Graph Traversal Planner 在 Phase 1 从 TableSchemaRegistry 解析，
固化在 TraversalPlan IR 中（plan.RootPrimaryKey）。

TableSchemaRegistry 在服务启动时通过 engine.DBMetas() 自动提取各表主键信息。
SQL Compiler 直接读取 plan.RootPrimaryKey，不接受调用方传入或覆盖。

V1 约束：仅支持单列主键。Composite PK 表暂不支持 PaginateRootFirst（见 query-planner.md 4.11）。
```

具体编译逻辑：

```go
func (b *sqlBuilder) buildRootPaginationFirst(
    projection *QueryProjection,
) {
    // 第一层：根行资格过滤 + 分页
    // 包含 non-fan-out JOIN、谓词、existential scope，确保 LIMIT 作用于过滤后的根行
    b.buf.WriteString("SELECT ")
    b.buf.WriteString(b.plan.RootAlias)
    b.buf.WriteString(".")
    b.buf.WriteString(b.plan.RootPrimaryKey)
    b.buf.WriteString(" FROM ")
    b.buf.WriteString(b.plan.RootTable)
    b.buf.WriteString(" ")
    b.buf.WriteString(b.plan.RootAlias)

    // non-fan-out JOINs: ScopeIndex == -1 && IsFanOut == false
    b.buildJoinClausesNonFanOut()

    // 根谓词 + non-fan-out 步骤谓词
    b.buildWhereClauseNonFanOut()

    // 全部 existential scope（必须在 LIMIT 之前）
    b.buildExistentialClauses()

    // 若 ORDER BY 字段均来自内层 alias，在此处排序
    if b.orderByResolvableInInner(projection) {
        b.buildOrderByClause(projection)
    }

    b.buf.WriteString(" LIMIT ? OFFSET ?")
    b.args = append(b.args, projection.Limit, projection.Offset)

    // 第二层：重关联根表 + 重放 non-fan-out JOIN + 展开 fan-out JOIN
    // SELECT <projection> FROM (...) _roots
    //   JOIN root_table ON root.id = _roots.id
    //   JOIN ... (non-fan-out joins replay)
    //   JOIN ... (fan-out joins only)
    //   [ORDER BY ...] (若排序字段引用 fan-out alias)
}
```

---

## 8. 完整编译示例

### 8.1 Query 模式

**输入**：

TraversalPlan（来自 query-planner.md 第 9 节示例）

QueryProjection：

```json
{
  "select_items": [
    { "alias": "rel", "fields": ["agent_no", "obj_no", "obj_name"] },
    { "alias": "m",   "fields": ["id"], "as": "merch_id" }
  ],
  "order_by_items": [
    { "alias": "rel", "field": "agent_no", "direction": "asc" }
  ],
  "limit": 200,
  "offset": 0,
  "pagination_strategy": 0
}
```

**编译过程**：

```text
1. SELECT 子句
   rel.agent_no, rel.obj_no, rel.obj_name, m.id AS merch_id

2. FROM 子句
   FROM agent_rel rel

3. JOIN 子句
   Step 0: ScopeIndex=-1, Require=always → INNER JOIN merch m ON rel.merch_id = m.id
   Step 1: ScopeIndex=0  → 跳过（existential scope 内）

4. WHERE 子句
   RootPredicates: rel.apply = ?  (args: [1])

5. EXISTS 子查询
   Scope 0: ScopeNotExists
   → AND NOT EXISTS (
       SELECT 1 FROM order_daily od
       WHERE od.merch_id = m.id
         AND od.report_date >= ?  (args: [..., "2026-05-01"])
         AND od.report_date <= ?  (args: [..., "2026-05-31"])
     )

6. ORDER BY 子句
   ORDER BY rel.agent_no ASC

7. LIMIT / OFFSET
   LIMIT ? OFFSET ?  (args: [..., 200, 0])
```

**输出**：

```sql
SELECT rel.agent_no, rel.obj_no, rel.obj_name, m.id AS merch_id
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
  AND NOT EXISTS (
    SELECT 1 FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
  )
ORDER BY rel.agent_no ASC
LIMIT ? OFFSET ?
```

```go
args = []any{1, "2026-05-01", "2026-05-31", 200, 0}
```

### 8.2 Aggregate 模式

**输入**：

同一个 TraversalPlan

MetricProjection：

```json
{
  "metrics": [
    { "alias": "m", "field": "deposit_amt", "func": "sum", "as": "total_deposit" }
  ],
  "group_by_items": [
    { "alias": "rel", "field": "agent_no" }
  ]
}
```

**编译过程**：

```text
1. SELECT 子句（聚合）
   SUM(m.deposit_amt) AS total_deposit

2. FROM + JOIN + WHERE + EXISTS → 同 Query 模式

3. GROUP BY 子句
   GROUP BY rel.agent_no

4. 无 ORDER BY / LIMIT
```

**输出**：

```sql
SELECT SUM(m.deposit_amt) AS total_deposit
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE rel.apply = ?
  AND NOT EXISTS (
    SELECT 1 FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
  )
GROUP BY rel.agent_no
```

```go
args = []any{1, "2026-05-01", "2026-05-31"}
```

### 8.3 Query 模式（HasFanOut = true）

**DSL**：

```json
{
  "match": { "type": "agent_rel", "alias": "rel" },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "always" }
  ],
  "return": {
    "select": [
      { "alias": "rel", "fields": ["agent_no"] },
      { "alias": "od",  "fields": ["trans_amt", "report_date"] }
    ],
    "limit": 200,
    "offset": 0
  }
}
```

**TraversalPlan 关键信息**：

```text
HasFanOut = true
Step 1: IsFanOut = true (has_order_daily is one_to_many, materialized)
```

**PaginationStrategy = PaginateRootFirst**，`plan.RootPrimaryKey = "id"`（来自 TableSchemaRegistry）：

**输出**：

```sql
SELECT rel.agent_no, od.trans_amt, od.report_date
FROM (
    SELECT rel.id
    FROM agent_rel rel
    INNER JOIN merch m ON rel.merch_id = m.id
    LIMIT ? OFFSET ?
) _roots
INNER JOIN agent_rel rel ON rel.id = _roots.id
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON od.merch_id = m.id
```

```go
args = []any{200, 0}
```

> 注意：内层子查询包含 non-fan-out JOIN（`rel → m`），仅 fan-out JOIN（`m → od`）在外层展开。外层不再重复 LIMIT/OFFSET，根行数已由子查询控制。

### 8.4 Query 模式（HasFanOut + 过滤约束）

在 8.3 基础上增加根谓词和 non-fan-out 步骤谓词，验证这些约束必须在内层子查询中执行。

**DSL**：

```json
{
  "match": {
    "type": "agent_rel",
    "alias": "rel",
    "where": [{ "field": "apply", "op": "eq", "value": 1 }]
  },
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always",
      "where": [{ "field": "deposit_amt", "op": "gt", "value": 1000 }] },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "always" }
  ],
  "return": {
    "select": [
      { "alias": "rel", "fields": ["agent_no"] },
      { "alias": "od",  "fields": ["trans_amt"] }
    ],
    "limit": 200,
    "offset": 0
  }
}
```

**TraversalPlan 关键信息**：

```text
HasFanOut = true
Step 0: for_merch, IsFanOut=false → 内层子查询（含 m.deposit_amt > ? 谓词）
Step 1: has_order_daily, IsFanOut=true → 外层 fan-out JOIN
RootPredicates: rel.apply = ?
```

**输出**：

```sql
SELECT rel.agent_no, od.trans_amt
FROM (
    SELECT rel.id
    FROM agent_rel rel
    INNER JOIN merch m ON rel.merch_id = m.id
    WHERE rel.apply = ?
      AND m.deposit_amt > ?
    LIMIT ? OFFSET ?
) _roots
INNER JOIN agent_rel rel ON rel.id = _roots.id
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON od.merch_id = m.id
```

```go
args = []any{1, 1000, 200, 0}
```

> 若将 `m.deposit_amt > ?` 留在外层，内层会先取 200 条根行，外层再消除不满足条件的商户，返回的根行数将少于 200。
>
> 当 TraversalPlan 同时包含 `ExistentialScopes` 时（如 8.1 的 NOT EXISTS），同样必须在内层子查询的 WHERE 中生成，不可延迟到外层。

---

## 9. 校验规则与错误定义

### 9.1 Projection Planner 校验

| 编号 | 规则 | 错误码 |
|------|------|--------|
| P1 | select alias 必须在 AliasBindings 中存在 | ErrUndefinedAlias |
| P2 | select alias 的 ScopeType 必须为 Materialize | ErrSelectFromExistential |
| P3 | select fields 非空 | ErrEmptyFields |
| P4 | order_by alias 存在且为 Materialize | ErrOrderByExistential |
| P5 | order_by direction 为 asc 或 desc | ErrInvalidDirection |

### 9.2 Metric Planner 校验

| 编号 | 规则 | 错误码 |
|------|------|--------|
| M1 | metric alias 存在且为 Materialize | ErrMetricFromExistential |
| M2 | metric.func 合法 | ErrInvalidAggFunc |
| M3 | metric.field 非空 | ErrEmptyAggField |
| M4 | group_by alias 存在且为 Materialize | ErrGroupByExistential |
| M5 | HasFanOut 时禁止对 fan-out 父端 alias 做 SUM/AVG | ErrAggOnFanOutParent |

### 9.3 错误类型

```go
var (
    ErrSelectFromExistential  = errors.New("cannot SELECT from existential alias (require: exists/none)")
    ErrOrderByExistential     = errors.New("cannot ORDER BY existential alias (require: exists/none)")
    ErrInvalidDirection       = errors.New("order_by.direction must be 'asc' or 'desc'")
    ErrEmptyFields            = errors.New("select.fields must not be empty")
    ErrMetricFromExistential  = errors.New("cannot aggregate on existential alias (require: exists/none)")
    ErrInvalidAggFunc         = errors.New("metric.func must be one of: sum, count, avg, min, max")
    ErrEmptyAggField          = errors.New("metric.field must not be empty")
    ErrGroupByExistential     = errors.New("cannot GROUP BY existential alias (require: exists/none)")
    ErrAggOnFanOutParent      = errors.New("V1: cannot SUM/AVG on fan-out parent alias; use fan-out endpoint or GROUP BY parent + COUNT on fan-out")
)
```

---

## 10. API 层集成

### 10.1 POST /graph/plan

```go
func HandlePlan(c echo.Context) error {
    var query GraphTraversalQuery
    if err := c.Bind(&query); err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    plan, err := CompilePlan(&query, RelationRegistry, TableSchemaRegistry)
    if err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    planCache.Put(plan)

    return c.JSON(200, map[string]any{
        "plan_token": plan.ID,
        "plan":       plan,
    })
}
```

### 10.2 POST /graph/query

```go
func HandleQuery(c echo.Context) error {
    planToken := c.QueryParam("plan_token")

    plan, ok := planCache.Get(planToken)
    if !ok {
        return c.JSON(404, map[string]any{"error": "plan not found or expired"})
    }

    var returnDef QueryReturnDef
    if err := c.Bind(&returnDef); err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    projection, err := PlanQuery(plan, &returnDef)
    if err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    sql, args, err := CompileQuery(plan, projection)
    if err != nil {
        return c.JSON(500, map[string]any{"error": err.Error()})
    }

    rows, err := engine.SQL(sql, args...).QueryInterface()
    if err != nil {
        return c.JSON(500, map[string]any{"error": err.Error()})
    }

    return c.JSON(200, map[string]any{"data": rows})
}
```

### 10.3 POST /graph/aggregate

```go
func HandleAggregate(c echo.Context) error {
    planToken := c.QueryParam("plan_token")

    plan, ok := planCache.Get(planToken)
    if !ok {
        return c.JSON(404, map[string]any{"error": "plan not found or expired"})
    }

    var returnDef AggregateReturnDef
    if err := c.Bind(&returnDef); err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    metric, err := PlanAggregate(plan, &returnDef)
    if err != nil {
        return c.JSON(400, map[string]any{"error": err.Error()})
    }

    sql, args, err := CompileAggregate(plan, metric)
    if err != nil {
        return c.JSON(500, map[string]any{"error": err.Error()})
    }

    rows, err := engine.SQL(sql, args...).QueryInterface()
    if err != nil {
        return c.JSON(500, map[string]any{"error": err.Error()})
    }

    return c.JSON(200, map[string]any{"data": rows})
}
```

---

## 11. Xorm 执行层

### 11.1 执行方式

SQL Compiler 输出原始 SQL + 参数列表，Xorm 只负责执行：

```go
sql, args, err := compiler.CompileQuery(plan, projection, rootPK)
rows, err := engine.SQL(sql, args...).QueryInterface()
```

```go
sql, args, err := compiler.CompileAggregate(plan, metric, rootPK)
rows, err := engine.SQL(sql, args...).QueryInterface()
```

### 11.2 为什么不使用 Xorm Builder

| 问题 | 说明 |
|------|------|
| EXISTS / NOT EXISTS | Xorm Builder 不原生支持 correlated subquery |
| 嵌套子查询 | Builder 的嵌套 API 容易导致 alias 错乱 |
| Root Pagination First | 需要子查询包装，Builder 难以表达 |
| SQL 可控性 | 复杂场景下 Builder 生成的 SQL 不可预测 |

结论：**Raw SQL Compiler + Xorm Execute Only**

---

## 12. 安全性

### 12.1 SQL 注入防护

- 所有用户值通过 `?` 占位符传入 args，由数据库驱动参数化绑定
- 表名来自 DSL `match.type`，经过 Traversal Planner 校验（必须在 RelationRegistry 的 FromTable/ToTable 中存在）；字段名来自 DSL `select.fields` / `where.field` 等，V1 不做字段级校验
- Relation 名来自 Registry（服务端配置），非用户输入
- Alias 名在 Planner 阶段校验（全局唯一、已定义），SQL Compiler 直接使用 IR 中的 alias

**V1 安全边界**：V1 假设 DSL API 仅对受信任的内部调用方开放。字段名和表名虽然在 IR 中流转，但本质上来自用户 DSL 输入。V1 不做 Table Schema 校验，因此安全性依赖于 API 访问控制。V2 将引入 Table Schema Registry，在 Planner 阶段对字段名做白名单校验。

### 12.2 Alias 注入防护

Alias 名在 CompilePlan 阶段校验（全局唯一、已定义），SQL Compiler 直接使用 IR 中的 alias，用户无法注入额外的 SQL 片段。

### 12.3 表名/字段名校验

V1 信任 DSL 输入的字段名（不做 Table Schema 校验）。V2 可扩展 Table Schema Registry，在 Planner 阶段校验字段是否存在于表中。

---

## 13. V1 / V2 边界

| 特性 | V1 | V2 |
|------|----|----|
| `in` / `not_in` 参数展开 | 数组直接展开为 `IN (?, ?, ...)` | 大数组自动分批 (IN + OR) |
| Root Pagination First | 简单子查询包装 | 优化为 CTE / LATERAL JOIN |
| 聚合安全校验 | 禁止 fan-out 父端 SUM/AVG；允许 GROUP BY 父端 + COUNT fan-out 端 | 自动 DISTINCT / 子查询去重 |
| HAVING 子句 | 不支持 | 支持 |
| 多表聚合 | 单次查询 | 支持 UNION ALL 多段聚合 |
| Predicate OR 组合 | 不支持（仅 AND） | 支持 |
| 字段存在性校验 | 不校验 | Table Schema Registry |
| SQL 方言 | MySQL | MySQL + PostgreSQL 适配 |
| COUNT 查询 | 不支持 | `POST /graph/count` 专用 API |
