# Query DSL 规范

## 概述

Semantic Graph Runtime 采用 `MATCH → TRaverse → RETURN` 扁平流水线 DSL，以 JSON 格式表达。

核心原则：

- **Graph Semantic Layer on Relational Database** —— 不是图数据库，而是基于关系型数据库的图语义层
- **Traversal 与 Projection 彻底解耦** —— 单次 Plan，多次 Projection
- **避免 GraphQL Nested Explosion** —— 扁平结构而非嵌套查询树
- **语义稳定** —— alias 无二义性，exists/not exists 语义可靠

---

## 顶层结构

```json
{
  "match": { ... },
  "traverse": [ ... ],
  "return": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `match` | object | **是** | 定义 Traversal 起点（Root Scope） |
| `traverse` | array | 否 | Edge Pipeline，0~N 步遍历 |
| `return` | object | **是** | 定义投影方式（字段选择 / 聚合 / 分页） |

---

## 1. match —— Root Scope 定义

`match` 定义 Traversal 的起点，对应 SQL 的 `FROM` 子句。

### 结构

```json
{
  "type": "<表名>",
  "alias": "<别名>",
  "where": [ <谓词列表> ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | **是** | 目标表名，如 `"AgentRel"`、`"merch"` |
| `alias` | string | **是** | 全局唯一别名，后续 traverse / return 通过此别名引用 |
| `where` | array | 否 | 根节点过滤条件 |

### 示例

```json
{
  "type": "AgentRel",
  "alias": "rel",
  "where": [
    { "field": "apply", "op": "eq", "value": 1 }
  ]
}
```

等价 SQL：

```sql
FROM agent_rel rel
WHERE rel.apply = 1
```

---

## 2. traverse —— Edge Pipeline

`traverse` 是有序的遍历步骤列表，每一步沿一条 Relation 从已有 alias 跳转到新 alias。

### 结构

```json
[
  {
    "from": "<来源别名>",
    "relation": "<关系名>",
    "alias": "<新别名>",
    "require": "<约束类型>",
    "where": [ <谓词列表> ]
  }
]
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `from` | string | **是** | — | 已存在的 alias（match 或前序 traverse 产生） |
| `relation` | string | **是** | — | Relation Schema Registry 中注册的关系名，全局唯一 |
| `alias` | string | **是** | — | 本步骤产生的全局唯一别名 |
| `require` | string | 否 | `"always"` | Graph Constraint 类型，见下方详述 |
| `where` | array | 否 | `[]` | 本步骤节点的过滤条件 |

### require 约束类型

`require` 是 Graph Constraint，不是简单 join 类型。它决定了本步遍历对父节点的影响方式。

| require 值 | SQL 对应 | 语义 | 说明 |
|------------|----------|------|------|
| `always` | `INNER JOIN` | 必须存在 | 父节点必须在目标表中存在对应行，否则父节点被过滤 |
| `optional` | `LEFT JOIN` | 可存在 | 父节点在目标表中可以没有对应行，目标字段为 NULL |
| `exists` | `SEMI JOIN` (`EXISTS`) | 存在性检验 | 仅判断是否存在对应行，不输出目标字段，不展开 cardinality |
| `none` | `ANTI JOIN` (`NOT EXISTS`) | 不存在性检验 | 仅判断是否不存在对应行，不输出目标字段，不展开 cardinality |

**关键说明**：

- `exists` / `none` 是本系统最核心的能力，解决了传统 ORM 难以优雅处理的 **Leaf Predicate Upstream Pollution** 问题
- `exists` / `none` 产生的 alias **不可** 在 `return.select` 中引用字段（因为语义上不展开行）
- `optional` 产生的 alias 字段值可能为 `NULL`

### 示例

```json
[
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
]
```

语义：`rel --for_merch--> m`（必须存在），`m --has_order_daily--> od`（5月不存在交易）

等价 SQL 片段：

```sql
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
WHERE NOT EXISTS (
    SELECT 1 FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= '2026-05-01'
      AND od.report_date <= '2026-05-31'
)
```

---

## 3. return —— 投影定义

`return` 定义最终输出方式。系统支持两种投影模式：**Query**（字段查询）和 **Aggregate**（聚合统计），分别由不同 API 调用。

### 3.1 Query 模式

对应 `POST /graph/query`，由 Projection Planner 处理。

```json
{
  "select": [ ... ],
  "order_by": [ ... ],
  "limit": 200,
  "offset": 0
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `select` | array | **是** | — | 字段选择列表 |
| `order_by` | array | 否 | `[]` | 排序规则 |
| `limit` | integer | 否 | `200` | 分页大小 |
| `offset` | integer | 否 | `0` | 分页偏移 |

#### select 项结构

```json
{
  "alias": "<别名>",
  "fields": ["<字段1>", "<字段2>"],
  "as": "<输出名>"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `alias` | string | **是** | match 或 traverse 中定义的别名 |
| `fields` | array | **是** | 要输出的字段列表 |
| `as` | string | 否 | 字段重命名前缀（仅单字段时生效） |

**约束**：

- `require: exists` 或 `require: none` 的 alias **不可** 出现在 `select` 中
- 同一 alias 可出现多次

#### order_by 项结构

```json
{
  "alias": "<别名>",
  "field": "<字段>",
  "direction": "asc"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|------|------|
| `alias` | string | **是** | — | 别名 |
| `field` | string | **是** | — | 字段名 |
| `direction` | string | 否 | `"asc"` | `"asc"` 或 `"desc"` |

#### Query 模式示例

```json
{
  "select": [
    { "alias": "rel", "fields": ["agent_no", "obj_no", "obj_name"] },
    { "alias": "m", "fields": ["id"], "as": "merch_id" }
  ],
  "order_by": [
    { "alias": "rel", "field": "agent_no", "direction": "asc" }
  ],
  "limit": 200,
  "offset": 0
}
```

### 3.2 Aggregate 模式

对应 `POST /graph/aggregate`，由 Metric Planner 处理。

```json
{
  "metrics": [ ... ],
  "group_by": [ ... ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `metrics` | array | **是** | 聚合指标列表 |
| `group_by` | array | 否 | 分组字段列表 |

#### metrics 项结构

```json
{
  "alias": "<别名>",
  "field": "<字段>",
  "func": "<聚合函数>",
  "as": "<输出名>"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `alias` | string | **是** | 别名 |
| `field` | string | **是** | 聚合字段 |
| `func` | string | **是** | 聚合函数：`"sum"` / `"count"` / `"avg"` / `"min"` / `"max"` |
| `as` | string | 否 | 输出别名 |

#### group_by 项结构

```json
{
  "alias": "<别名>",
  "field": "<字段>"
}
```

#### Aggregate 模式示例

```json
{
  "metrics": [
    { "alias": "m", "field": "deposit_amt", "func": "sum", "as": "total_deposit" }
  ],
  "group_by": [
    { "alias": "rel", "field": "agent_no" }
  ]
}
```

---

## 4. where 谓词

`match.where` 和 `traverse[].where` 共享相同的谓词格式。

### 谓词结构

```json
{
  "field": "<字段名>",
  "op": "<操作符>",
  "value": <任意值>
}
```

### 支持的操作符

| op | 语义 | value 类型 | SQL 示例 |
|----|------|-----------|----------|
| `eq` | 等于 | any | `field = ?` |
| `neq` | 不等于 | any | `field != ?` |
| `gt` | 大于 | number / string | `field > ?` |
| `gte` | 大于等于 | number / string | `field >= ?` |
| `lt` | 小于 | number / string | `field < ?` |
| `lte` | 小于等于 | number / string | `field <= ?` |
| `in` | 在集合中 | array | `field IN (?)` |
| `not_in` | 不在集合中 | array | `field NOT IN (?)` |
| `like` | 模糊匹配 | string | `field LIKE ?` |
| `is_null` | 为空 | `true` / `false` | `field IS NULL` / `field IS NOT NULL` |

### 多谓词关系

同一 `where` 数组中的多个谓词默认以 **AND** 连接。

> 未来可扩展 `"logic": "or"` 支持 OR 组合，V1 暂不实现。

---

## 5. Relation Schema Registry

Relation 是全局注册的边定义，`traverse.relation` 必须指向已注册的 Relation。

### RelationSchema 结构

| 字段 | 说明 |
|------|------|
| `name` | 关系名，全局唯一 |
| `from_table` | 起始表 |
| `from_field` | 起始表外键字段 |
| `to_table` | 目标表 |
| `to_field` | 目标表关联字段 |
| `cardinality` | 基数：`one_to_one` / `one_to_many` / `many_to_one` / `many_to_many` |

### 注册示例

```go
var RelationRegistry = map[string]*RelationSchema{
    "for_merch": {
        Name:        "for_merch",
        FromTable:   "agent_rel",
        FromField:   "merch_id",
        ToTable:     "merch",
        ToField:     "id",
        Cardinality: "many_to_one",
    },
    "has_order_daily": {
        Name:        "has_order_daily",
        FromTable:   "merch",
        FromField:   "id",
        ToTable:     "order_daily",
        ToField:     "merch_id",
        Cardinality: "one_to_many",
    },
}
```

### 命名规则

- Relation 名称必须 **全局唯一**
- 禁止同一关系名表示多种语义（如 `for_user` 同时表示 creator 和 updater）
- 必须拆分为 `agent_creator`、`agent_updater` 等明确语义的名称

---

## 6. 完整 DSL 示例

### 示例：查找5月无日交易的商户及其 AgentRel

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
    "select": [
      { "alias": "rel", "fields": ["agent_no", "obj_no", "obj_name"] },
      { "alias": "m", "fields": ["id"], "as": "merch_id" }
    ],
    "limit": 200,
    "offset": 0
  }
}
```

生成 SQL：

```sql
SELECT
  rel.agent_no,
  rel.obj_no,
  rel.obj_name,
  m.id AS merch_id
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
LIMIT 200 OFFSET 0
```

### 示例：统计商户存款总额

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
    "metrics": [
      { "alias": "m", "field": "deposit_amt", "func": "sum", "as": "total_deposit" }
    ],
    "group_by": [
      { "alias": "rel", "field": "agent_no" }
    ]
  }
}
```

> 注意：Query 与 Aggregate 共享同一个 `match + traverse`，只是 `return` 部分不同。

---

## 7. 校验规则

### 7.1 Alias 规则

- `match.alias` 和所有 `traverse[].alias` 必须全局唯一
- `traverse[].from` 必须引用已定义的 alias
- `return.select[].alias` 和 `return.metrics[].alias` 必须引用已定义的 alias
- `require: exists` / `require: none` 的 alias **不可** 出现在 `return.select` 中

### 7.2 Relation 规则

- `traverse[].relation` 必须在 Relation Schema Registry 中存在
- `traverse[].from` 对应的 alias 所绑定的表，必须与 Relation 的 `from_table` 匹配

### 7.3 Cardinality 规则

- 存在 `one_to_many` 关系时，Query 模式的 `LIMIT/OFFSET` 必须采用 **Root Pagination First** 策略
- 禁止直接在 1:N JOIN 结果上做 `LIMIT`（会导致根节点数量失真）

### 7.4 Projection 规则

- `return.select` 和 `return.metrics` 互斥，同一请求只能使用其一
- `return.metrics[].func` 必须为合法聚合函数

---

## 8. API 映射

| API | return 模式 | Planner | 产出 |
|-----|------------|---------|------|
| `POST /graph/plan` | 无（仅 plan） | Graph Traversal Planner | TraversalPlan（缓存） |
| `POST /graph/query` | `select` + `limit/offset` | Projection Planner → SQL Compiler | SQL |
| `POST /graph/aggregate` | `metrics` + `group_by` | Metric Planner → SQL Compiler | SQL |

`/graph/plan` 可以独立调用以获取 `plan_token`，后续 `/graph/query` 和 `/graph/aggregate` 通过 `plan_token` 复用 TraversalPlan，避免重复编译。
