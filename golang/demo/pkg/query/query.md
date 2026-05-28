# SearchParams：URL 查询参数与数据库查询映射规范

本文档定义了一套将 URL QueryString 映射为数据库查询条件的统一约定，用于构建灵活、可预测、安全的 RESTful API 查询能力。

核心目标：

* 统一前后端查询协议
* 减少接口数量
* 提供可组合的查询能力
* 保持 URL 可读性
* 避免后端手写大量查询逻辑

---

# 1. 基础语法

查询参数采用：

```text
操作.参数1.参数2=值
```

使用 `.` 作为层级分隔符。

例如：

```text
where.name.eq=John
```

表示：

```sql
WHERE name = 'John'
```

---

# 2. 过滤条件（where）

用于生成 SQL `WHERE` 条件。

---

## 2.1 基础过滤（AND）

默认情况下：

* 所有 `where.*` 条件之间使用 `AND` 连接。

### 语法

```text
where.字段名.操作符=值
```

### 示例

```text
where.age.gt=20
&where.status.eq=active
```

对应 SQL：

```sql
WHERE age > 20
  AND status = 'active'
```

---

## 2.2 模糊搜索（q）

`q` 用于快速文本搜索。

内部使用：

```sql
OR + LIKE
```

实现。

支持两种模式。

---

### 2.2.1 全局模糊搜索

后端预先定义一组可搜索字段，例如：

```ts
['name', 'title']
```

### 语法

```text
q=keyword
```

### 示例

```text
q=test
```

对应 SQL：

```sql
WHERE (
  name  LIKE '%test%'
  OR title LIKE '%test%'
)
```

---

### 2.2.2 指定字段模糊搜索

### 语法

```text
q.字段1.字段2=keyword
```

### 示例

```text
q.name.email=test
```

对应 SQL：

```sql
WHERE (
  name  LIKE '%test%'
  OR email LIKE '%test%'
)
```

---

# 3. 操作符（Operator）

当前支持以下操作符：

| 操作符     | 含义            | URL 示例                                                          | SQL 示例                                     |
| ------- | ------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `eq`    | 等于            | `where.name.eq=John`                                            | `name = 'John'`                            |
| `neq`   | 不等于           | `where.name.neq=John`                                           | `name <> 'John'`                           |
| `gt`    | 大于            | `where.age.gt=20`                                               | `age > 20`                                 |
| `lt`    | 小于            | `where.age.lt=20`                                               | `age < 20`                                 |
| `gte`   | 大于等于          | `where.age.gte=21`                                              | `age >= 21`                                |
| `lte`   | 小于等于          | `where.age.lte=21`                                              | `age <= 21`                                |
| `in`    | IN 查询（`,` 分隔） | `where.status.in=active,pending`                                | `status IN (...)`                          |
| `notIn` | NOT IN 查询     | `where.status.notIn=archived`                                   | `status NOT IN (...)`                      |
| `like`  | LIKE 模糊匹配     | `where.name.like=%john%`                                        | `name LIKE '%john%'`                       |
| `likes` | 多个 LIKE（AND）  | `where.name.likes=john,doe`                                     | `name LIKE '%john%' AND name LIKE '%doe%'` |
| `btw`   | BETWEEN 区间    | `where.age.btw=20,30`                                           | `age BETWEEN 20 AND 30`                    |
| `null`  | NULL 判断       | `where.deleted_at.null=true`                                    | `deleted_at IS NULL`                       |
| `null`  | 非 NULL 判断     | `where.deleted_at.null=false`                                   | `deleted_at IS NOT NULL`                   |
| `time`  | UTC 时间范围      | `where.created_at.time=2024-01-01 00:00:00,2024-01-31 23:59:59` | `BETWEEN ...`                              |
| `date`  | 本地日期范围        | `where.created_at.date=2024-01-01,2024-01-31`                   | `>= ... AND <= ...`                        |

---

# 4. 时间处理规则

系统中的数据库时间统一使用：

```text
UTC
```

存储。

因此：

## URL 输入

前端传入：

* 本地时间
* 或本地日期

例如：

```text
where.created_at.time=2024-01-01 00:00:00,2024-01-31 23:59:59
```

---

## 后端处理

后端必须：

1. 将本地时间转换为 UTC
2. 再参与数据库查询

---

## 数据库存储

数据库中的时间字段统一为：

```text
UTC 时间
```

---

# 5. 字段选择（select）

控制返回字段。

---

## 语法

```text
select=字段1,字段2
```

---

## 示例

```text
select=id,name
```

对应 SQL：

```sql
SELECT id, name
FROM ...
```

---

# 6. 排序（order）

控制结果排序。

---

## 语法

```text
order=字段1.方向,字段2.方向
```

方向支持：

* `asc`
* `desc`

默认：

```text
asc
```

---

## 示例

```text
order=created_at.desc,name.asc
```

对应 SQL：

```sql
ORDER BY created_at DESC,
         name ASC
```

---

# 7. 分页（Pagination）

通过 `page` 与 `pagesize` 控制分页。

---

## 语法

```text
page=页码
&pagesize=每页数量
```

---

## 默认值建议

| 参数         | 默认值       |
| ---------- | --------- |
| `page`     | `0` 或 `1` |
| `pagesize` | `10`      |

---

## 安全限制

后端应限制：

```text
pagesize 最大值
```

例如：

```text
500
```

避免大查询滥用。

---

## 示例

```text
page=2&pagesize=20
```

对应 SQL：

```sql
LIMIT 20 OFFSET 20
```

---

# 8. 关联查询（Join Query）

当前仅支持：

```text
单层 LEFT JOIN 条件过滤
```

复杂多层关联暂不支持。

---

## 当前语法

```text
where.表名#字段名.操作符=值
```

例如：

```text
where.user_profile#city.eq=Beijing
```

后端转换为：

```sql
user_profile.city = 'Beijing'
```

---

## SQL 示例

```sql
LEFT JOIN user_profile
  ON xxx.field = yyy.field

WHERE user_profile.city = 'Beijing'
```

---

## 当前限制

### 不支持多层关联

例如：

```text
where.othertable.friends.status.eq=enabled
```

当前不支持。

---

### 当前实现限制

目前：

* JOIN 关系需要手工定义
* 需要显式配置：

```text
x.field = y.field
```

关系映射

---

## TODO

当前 `#` 存在 URL 语义冲突问题。

后续考虑：

```text
user~name
```

替代：

```text
user#name
```

---

# 9. OR 分组查询（规划中）

> 当前版本尚未实现。

未来计划支持：

```sql
(A OR B) AND C
```

这种复杂逻辑。

---

## 设计语法

```text
or[分组号].字段名.操作符=值
```

---

## 规则

### 同组条件

同一个分组内：

```text
OR
```

连接。

---

### 不同组之间

不同组之间：

```text
AND
```

连接。

同时：

* `or[...]`
* `where.*`

之间也使用 `AND`

连接。

---

## 示例

```text
or[1].status.eq=pending
&or[1].status.eq=review_needed
&where.age.gt=60
```

对应 SQL：

```sql
WHERE (
  status = 'pending'
  OR status = 'review_needed'
)
AND age > 60
```

---

# 10. TypeScript 类型定义

```ts
export type SearchParams = {
  page?: number
  pagesize?: number

  // Row Query: 返回字段
  select?: string

  // 排序
  order?: string

  // Aggregate Query（见 §12；不支持 select）
  metrics?: string
  group_by?: string
} & Record<string, number | string>
```

其中：

```ts
Record<string, number | string>
```

用于承载动态过滤条件。

例如：

```ts
const params: SearchParams = {
  "where.name.eq": "John",
  "where.age.gt": 21,
}
```

---

# 11. 设计特点总结

该查询协议具备以下特点：

| 特性      | 说明                            |
| ------- | ----------------------------- |
| RESTful | 完全基于 URL Query                |
| 可组合     | where/order/select/page 可自由组合 |
| 双模式     | Row Query 与 Aggregate Query 独立入口 |
| 易扩展     | 操作符可持续扩展                      |
| 前后端统一   | Query → SQL 映射明确              |
| 安全可控    | 可限制字段、分页、操作符                  |
| ORM 无关  | 可映射到 SQL、ORM、ES、Graph 查询      |
| 可渐进增强   | 支持未来扩展 OR / JOIN / having     |

---

# 12. 聚合查询（Aggregation）

Aggregate Query 与 Row Query **完全分离**，使用独立的 Go API：

| Row Query | Aggregate Query |
| --- | --- |
| `BindQueryString` | `BindAggregateQueryString` |
| `BindQueryStringWithOptions` | `BindAggregateQueryStringWithOptions` |
| `BindQueryStringWithPage` | `BindAggregateQueryStringWithPage` |
| `BindQueryStringWithTable` | `BindAggregateQueryStringWithTable` |
| `Options` | `AggregateOptions` |

用于 OLAP 风格查询：`count` / `sum` / `avg` / `min` / `max` + `group_by`。

## 12.1 聚合指标（metrics）

```text
metrics=函数(字段).别名
```

多个指标用 `,` 分隔。**metrics 始终出现在 SELECT 输出中。**

示例：

```text
metrics=count(*).total
metrics=sum(amount).totalAmount
metrics=count(*).total,sum(amount).amount
```

对应 SQL：

```sql
COUNT(*) AS total
SUM(amount) AS totalAmount
```

支持函数：`count(*)`、`count(字段)`、`sum`、`avg`、`min`、`max`。

## 12.2 分组（group_by）

```text
group_by=字段1,字段2
```

示例：

```text
group_by=status,city
```

## 12.3 输出列规则（方案 1：默认全返）

聚合模式 **不支持 `select`**（与 Row Query 的 select 语义不同）：

| 场景 | SELECT 输出 |
| --- | --- |
| 仅有 `metrics` | 仅 metrics 别名 |
| 有 `group_by` | **全部** group_by 维度列 + metrics 别名 |

不需要维度列时，**不传 `group_by`** 即可（全局聚合一行）。

## 12.4 完整示例

URL Query：

```text
where.status.eq=active
&metrics=count(*).total,sum(amount).amount
&group_by=status
&order=amount.desc
```

SQL（示意）：

```sql
SELECT
  status,
  COUNT(*) AS total,
  SUM(amount) AS amount
FROM orders
WHERE status = 'active'
GROUP BY status
ORDER BY amount DESC
```

## 12.5 与 Row Query 的关系

| 能力 | Row Query | Aggregate Query |
| --- | --- | --- |
| where | ✓ | ✓ |
| order | ✓ | ✓（可引用 metric alias 或 group_by 字段） |
| select | ✓ | ✗（不支持；维度由 group_by 全返） |
| page/pagesize | ✓ | ✓ |
| metrics | — | ✓ |
| group_by | — | ✓ |
| having | — | 未来扩展 |

## 12.6 AggregateOptions 白名单

```go
type AggregateOptions struct {
    TableName        string
    WhereWhitelist   []string
    GroupByWhitelist []string
    MetricsWhitelist []string
    QWhitelist       []string
}
```

- `count(*)` 不校验字段白名单
- 其他聚合字段走 `MetricsWhitelist`
- `group_by` 字段走 `GroupByWhitelist`
- 空 whitelist 表示不限制（与 Row Query 一致）
