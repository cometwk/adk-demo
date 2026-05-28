---
name: xorm-conventions
description: xorm ORM 使用规范检查。在编写 Go 代码涉及 xorm、SQL 查询构建、数据库实体定义时使用。包括 builder.In 的正确写法、int64 ID 的 JSON tag 格式、xorm tag 规范等。当用户编写 xorm 相关代码、定义数据库表结构、编写查询条件时，主动检查并提示这些规范。
---

# xorm ORM 使用规范

本项目使用 xorm 作为 ORM 库。以下规范需在编写代码时主动遵守。

## 1. SQL IN 查询的正确写法

使用 `builder.ToSQL(builder.In(...))` 生成 SQL 和参数，而不是直接拼接。

**正确写法：**
```go
// 生成 IN 条件的 SQL 和参数
sql, args, _ := builder.ToSQL(builder.In("agent.agent_no", agentNos))
session.Where(sql, args...)

// 或在 Where 中直接使用（简化场景）
session.Where(builder.In("level", levelIn))
```

**为什么不能直接拼接：**
- 直接拼接字符串会导致 SQL 注入风险
- builder.In 会正确处理参数绑定，生成安全的 SQL

**常见用法：**
```go
// 单条件 IN
sql, args, _ := builder.ToSQL(builder.In("column", values...))

// 组合条件
where, args, err := builder.ToSQL(
    builder.In("tb.entity", users).And(builder.Eq{"tb.type": 1})
)

// 在 Dialect 构建中使用
selectSQL, args, err := builder.Dialect(engine.DriverName()).
    Select("id").
    From("table").
    Where(builder.In("column", values...)).
    ToSQL()
```

## 2. int64 类型 ID 字段的 JSON tag

所有 `int64` 类型的 ID 字段（包括 `ID`、`AgentID`、`MerchID` 等）必须使用 `json:"xxx,string"` 格式。

**原因：**
JavaScript 的 Number 类型最大安全整数是 `2^53-1`（约 9007 万亿）。本项目使用分布式雪花 ID，ID 值可能超过此限制。如果不加 `,string`，传给前端后会丢失精度。

**正确写法：**
```go
ID     int64 `xorm:"bigint not null pk 'id'"     json:"id,string"`      // 分布式雪花ID
AgentID int64 `xorm:"bigint 'agent_id'"          json:"agent_id,string"` // 代理商ID
MerchID int64 `xorm:"bigint 'merch_id'"          json:"merch_id,string"` // 商户ID
```

**错误写法（会导致前端精度丢失）：**
```go
ID int64 `json:"id"`  // 错误！缺少 ,string
```

## 3. xorm tag 格式规范

项目中的 xorm tag 格式：

| 用途 | 格式 |
|------|------|
| 主键自增 | `xorm:"'id' pk autoincr"` |
| 主键非自增 | `xorm:"bigint not null pk 'id'"` |
| 普通字段 | `xorm:"'column_name' TYPE NOT NULL"` 或 `xorm:"bigint 'column_name'"` |
| 可空字段 | `xorm:"'column_name' TYPE NULL"` |
| JSON 类型 | `xorm:"'payload' JSON NOT NULL"` |
| 默认值 | `xorm:"'column' INT NOT NULL DEFAULT 0"` |
| 忽略字段 | `xorm:"-"` |

**注意：**
- 字段名需要用单引号包裹：`'column_name'`
- 类型名使用大写：`VARCHAR`, `INT`, `BIGINT`, `TIMESTAMP(6)`, `JSON`
- 约束使用大写：`NOT NULL`, `NULL`, `DEFAULT`, `PK`

## 4. 检查时机

在以下场景主动检查：

- 定义数据库实体结构体时：检查 int64 ID 的 JSON tag
- 编写查询条件时：检查 builder.In 的使用方式
- 代码审查时：发现不符合规范的代码应提示修正

## 5. 常见错误示例

**错误 1：ID 字段缺少 string 格式**
```go
// 错误
type Agent struct {
    ID int64 `json:"id"`
}
// 正确
type Agent struct {
    ID int64 `json:"id,string"`
}
```

**错误 2：IN 查询直接拼接**
```go
// 错误 - SQL 注入风险
session.Where("agent_no IN (" + strings.Join(agentNos, ",") + ")")

// 正确
sql, args, _ := builder.ToSQL(builder.In("agent_no", agentNos))
session.Where(sql, args...)
```

**错误 3：复杂条件未用 builder**
```go
// 错误 - 手动拼接复杂条件
session.Where("queue_name IN (?, ?, ?) AND available_at <= ?", args...)

// 正确 - 使用 builder 构建
selectSQL, args, err := builder.Dialect(engine.DriverName()).
    Select("id").
    From("job_queue").
    Where(builder.In("queue_name", queues...)).
    And(builder.Lte{"available_at": availableTime}).
    ToSQL()
```