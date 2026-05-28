# Semantic Graph Runtime V1 详细设计文档（Golang + Xorm）

## 一、项目目标

构建一套：

```text
Semantic Graph Runtime
```

用于：

* Graph Traversal
* SQL Pushdown
* Anti Join / Semi Join
* 聚合下推
* Traversal IR 缓存
* 多阶段 Projection Rewrite

系统核心目标：

```text
图语义定义（Traversal）
与
数据投影（Projection）
彻底解耦
```

从而实现：

* 单次 Plan，多次 Projection
* 聚合安全下推
* Alias 无二义性
* Exists/Not Exists 语义稳定
* 避免 ORM Join Explosion
* 避免 GraphQL Nested Explosion

---

# 二、核心设计哲学

## 1. Graph ≠ GraphDB

本系统不是图数据库。

而是：

```text
Graph Semantic Layer on Relational Database
```

底层仍然是：

* MySQL
* PostgreSQL

但：

业务表达采用：

```text
Graph Traversal Semantics
```

---

# 三、为什么不采用 GraphQL

GraphQL 的核心问题：

```text
Nested Query Tree
```

它天然偏：

```text
Object Materialization
```

而不是：

```text
Relational Pushdown
```

在：

* anti join
* semi join
* exists
* aggregation rewrite

场景中极易：

* alias 崩塌
* cardinality 爆炸
* join 重复
* limit 失效

因此：

本系统采用：

```text
MATCH -> TRAVERSE -> RETURN
```

扁平流水线 DSL。

---

# 四、最终 DSL 规范

## 1. Query DSL

```json
{
  "match": {
    "type": "AgentRel",
    "alias": "rel",
    "where": [
      { "field": "apply", "op": "eq", "value": 1 }
    ]
  },
  "traverse": [
    {
      "from": "rel",
      "relation": "for_merch",
      "alias": "m",
      "require": "always"
    },
    {
      "from": "m",
      "relation": "has_order_daily",
      "alias": "od",
      "where": [
        { "field": "report_date", "op": "gte", "value": "2026-05-01" },
        { "field": "report_date", "op": "lte", "value": "2026-05-31" }
      ],
      "require": "none"
    }
  ],
  "return": {
    "limit": 200,
    "offset": 0,
    "select": [
      {
        "alias": "rel",
        "fields": ["agent_no", "obj_no", "obj_name"]
      },
      {
        "alias": "m",
        "fields": ["id"],
        "as": "merch_id"
      }
    ]
  }
}
```

---

# 五、核心语义模型

---

# 1. match

定义：

```text
Root Scope
```

即：

```text
Traversal 起点
```

例如：

```json
{
  "type": "AgentRel",
  "alias": "rel"
}
```

表示：

```text
FROM agent_rel rel
```

---

# 2. traverse

定义：

```text
Edge Pipeline
```

每个 traverse step：

```json
{
  "from": "rel",
  "relation": "for_merch",
  "alias": "m"
}
```

表示：

```text
rel --for_merch--> m
```

---

# 3. require

require 是：

```text
Graph Constraint
```

而不是简单 join 类型。

---

## require: always

默认：

```text
INNER JOIN
```

语义：

```text
必须存在
```

---

## require: optional

对应：

```text
LEFT JOIN
```

语义：

```text
可存在
```

---

## require: exists

对应：

```text
SEMI JOIN
```

SQL：

```sql
EXISTS (...)
```

---

## require: none

对应：

```text
ANTI JOIN
```

SQL：

```sql
NOT EXISTS (...)
```

这是整个系统最关键能力。

---

# 六、为什么 require:none 极其重要

业务问题：

```text
找：
5 月没有日交易的商户对应的 AgentRel
```

核心过滤发生在：

```text
OrderDaily
```

但：

最终裁剪的是：

```text
AgentRel
```

这是：

```text
Leaf Predicate Upstream Pollution
```

传统 ORM 很难优雅处理。

---

# 七、系统核心思想

系统并不：

```text
Materialize Graph
```

而是：

```text
Compile Traversal Semantics
```

即：

```text
Traversal Tree
→
Relational Algebra
→
SQL Pushdown
```

---

# 八、系统架构

```text
                 ┌──────────────────┐
                 │      Agent       │
                 └────────┬─────────┘
                          │
                          ▼
                 POST /graph/plan
                          │
                          ▼
              Graph Traversal Planner
                          │
                          ▼
                  Traversal IR
                          │
                  Redis / Memory
                          │
             plan_token / traversal_id
                          │
          ┌───────────────┴──────────────┐
          ▼                              ▼
POST /graph/query          POST /graph/aggregate
          │                              │
          ▼                              ▼
 Projection Planner             Metric Planner
          │                              │
          ▼                              ▼
      SQL Compiler                SQL Compiler
          │                              │
          ▼                              ▼
      MySQL/Postgres              MySQL/Postgres
```

---

# 九、核心分层

系统必须严格分为：

---

# 1. Traversal Layer

负责：

* alias binding
* relation resolution
* anti join
* semi join
* existential scope
* traversal semantics

不负责：

* select
* aggregate
* pagination

---

# 2. Projection Layer

负责：

* select fields
* aggregate metrics
* limit
* offset
* order by

---

# 十、核心 IR（Traversal Plan）

## 1. TraversalPlan

```go
type TraversalPlan struct {
    RootAlias string

    RootTable string

    AliasBindings map[string]*AliasBinding

    RelationEdges []*RelationEdge

    PredicateTree *PredicateNode

    ExistentialScopes []*ExistentialScope

    CardinalityHints map[string]CardinalityHint
}
```

---

# 十一、Alias Binding

```go
type AliasBinding struct {
    Alias string

    Table string

    ParentAlias string

    Relation string

    ScopeType string
}
```

---

# 十二、Relation Schema

Relation 必须：

```text
全局唯一
```

禁止：

```text
for_user
```

同时表示：

* creator
* updater

必须：

```text
agent_creator
agent_updater
```

---

## RelationSchema

```go
type RelationSchema struct {
    Name string

    FromTable string
    FromField string

    ToTable string
    ToField string

    Cardinality string
}
```

---

# 十三、Schema Registry

```go
var RelationRegistry = map[string]*RelationSchema{
    "for_merch": {
        Name: "for_merch",

        FromTable: "agent_rel",
        FromField: "merch_id",

        ToTable: "merch",
        ToField: "id",

        Cardinality: "many_to_one",
    },

    "has_order_daily": {
        Name: "has_order_daily",

        FromTable: "merch",
        FromField: "id",

        ToTable: "order_daily",
        ToField: "merch_id",

        Cardinality: "one_to_many",
    },
}
```

---

# 十四、CompilePlan 阶段

只做：

```text
Semantic Binding
```

不生成 SQL。

不执行数据库。

---

## CompilePlan

```go
func CompilePlan(
    query *GraphTraversalQuery,
) (*TraversalPlan, error)
```

---

# 十五、CompilePlan 的职责

---

## 1. Alias 校验

禁止：

```text
重复 alias
```

---

## 2. Relation 校验

校验：

```text
from alias
relation
```

是否匹配。

---

## 3. Scope 构建

构建：

```text
Existential Scope Tree
```

例如：

```text
rel
 └── m
      └── NOT EXISTS od
```

---

## 4. Cardinality 分析

标记：

```text
one_to_many
many_to_one
```

后续：

* limit rewrite
* aggregate rewrite

依赖这个信息。

---

# 十六、CompileQuery

```go
func CompileQuery(
    plan *TraversalPlan,
    projection *QueryProjection,
) (string, []any, error)
```

---

# 十七、CompileAggregate

```go
func CompileAggregate(
    plan *TraversalPlan,
    metric *MetricProjection,
) (string, []any, error)
```

---

# 十八、为什么 aggregate 不允许 Agent 重写 traversal

因为：

```text
Traversal Semantics
必须稳定
```

Agent 只允许：

```text
替换 Projection
```

不允许：

* 改 FROM
* 改 EXISTS
* 改 NOT EXISTS
* 改 JOIN TREE

否则：

```text
alias scope
correlated subquery
anti join direction
```

全部可能崩塌。

---

# 十九、CompileQuery 示例

DSL：

```json
{
  "return": {
    "select": [
      {
        "alias": "rel",
        "fields": ["agent_no", "obj_no"]
      }
    ]
  }
}
```

生成：

```sql
SELECT
  rel.agent_no,
  rel.obj_no
FROM agent_rel rel
INNER JOIN merch m
  ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
    SELECT 1
    FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
)
LIMIT 200
OFFSET 0
```

---

# 二十、CompileAggregate 示例

Metric：

```json
{
  "metrics": [
    {
      "alias": "m",
      "field": "deposit_amt",
      "func": "sum",
      "as": "total_deposit"
    }
  ]
}
```

生成：

```sql
SELECT
  SUM(m.deposit_amt) AS total_deposit
FROM agent_rel rel
INNER JOIN merch m
  ON rel.merch_id = m.id
WHERE rel.apply = ?
AND NOT EXISTS (
    SELECT 1
    FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
)
```

注意：

```text
Traversal Tree 完全没变
```

只是：

```text
Projection Rewrite
```

---

# 二十一、Limit/Offset 正确处理

禁止：

```sql
SELECT ...
FROM rel
JOIN od
LIMIT 200
```

因为：

```text
1:N Join
```

会导致：

```text
根节点数量失真
```

---

# 正确做法

如果：

```text
Root Entity Return
+
存在 one_to_many
```

则：

```sql
FROM (
   SELECT rel.id
   FROM agent_rel rel
   LIMIT 200
) roots
JOIN ...
```

即：

```text
Root Pagination First
```

---

# 二十二、Xorm 集成

---

# Query 执行

```go
sql, args, err := compiler.CompileQuery(plan, projection)

var rows []map[string]any

err = engine.SQL(sql, args...).Find(&rows)
```

---

# Aggregate 执行

```go
sql, args, err := compiler.CompileAggregate(plan, metric)

var rows []map[string]any

err = engine.SQL(sql, args...).Find(&rows)
```

---

# 二十三、为什么不使用 Xorm Builder

因为：

```text
Graph Traversal
=
Relational Algebra Compilation
```

不是：

```text
CRUD ORM
```

复杂：

* exists
* anti join
* correlated subquery

builder 极易：

* alias 错乱
* nesting 崩溃
* SQL 不可控

因此：

推荐：

```text
Raw SQL Compiler
+
Xorm Execute Only
```

---

# 二十四、Redis 缓存

缓存：

```text
TraversalPlan
```

不是：

```text
SQL String
```

因为：

同一个 traversal：

可能：

* query
* aggregate
* count
* topk

共用。

---

# 二十五、最终系统定位

本系统不是：

* ORM
* GraphQL Engine
* GraphDB

而是：

```text
Semantic Graph Runtime
```

核心能力：

```text
Graph Traversal IR
+
Projection Rewrite
+
SQL Pushdown
```

本质：

```text
Semantic Query Compiler
```
