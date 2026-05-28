---
name: create-route
description: 为新的数据库表创建完整的 CRUD route。当用户说"给 xxx 表创建 route"、"新增 xxx 的路由"、"添加 xxx 的 CRUD 接口"、"为 xxx 表建 route"时使用此 Skill。也适用于用户提到新增表并需要配套的 route handler 时，即使没有明确说"创建 route"。此 Skill 不处理已有 route 的修改，只处理新表的 route 创建。
---

# create-route — 为新表创建 CRUD Route

本项目采用三层架构：DDL SQL → Go struct (tables.go) → Route Handler (routes/)。为新表创建 route 需要同步修改三个文件。

## 文件关系

| 文件 | 职责 | 说明 |
|------|------|------|
| `demo/ddl/demo/<table>.sql` | 建表语句 | DDL 是权威来源，定义表的字段、类型、约束 |
| `demo/biz/tables.go` | Go xorm struct | struct 字段需与 DDL 一一对应，这是 route handler 的泛型参数 |
| `demo/biz/init.go` | ORM 注册 | 必须注册 struct 才能使用 ORM 操作，必须声明 EntityOps 变量 |
| `demo/routes/demo/<table>.go` | Route handler | 组合 CrudHandler，注册到 echo 路由组 |
| `demo/routes/demo/attach.go` | 路由汇总 | 所有 Attach 函数在此调用，新表必须添加一行 |

## 创建流程

### 步骤 1：确认 DDL 和 struct 已就绪

新表的 route 依赖于 DDL 和 struct 已经存在。如果不存在，先使用 `fix-ddl` skill 创建它们。

确认以下内容：
- `demo/ddl/demo/<table>.sql` 存在且语法正确
- `demo/biz/tables.go` 中已有对应的 struct（如 `Alert`）
- `demo/biz/init.go` 中已注册该 struct（`orm.MustLoadStructModel[Alert]()`）并声明了 EntityOps 变量（`AlertModel = orm.MustEntityOps[Alert]()`）

### 步骤 2：创建 route handler 文件

在 `demo/routes/demo/` 目录下创建 `<table>.go` 文件。遵循现有文件的命名和结构模式。

**文件命名规则：**
- 文件名与表名一致，如 `alert.go` 对应 `alert` 表
- 但表名用复数形式时（如 `orders`），文件名用对应的逻辑名（如 `order.go`）

**文件模板：**

```go
package demo

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/demo/biz"
	"github.com/lucky-byte/lib/pkg/serve"
)

type alertHandler struct {
	*serve.CrudHandler[biz.Alert]
}

func AlertAttach(attach *echo.Group) {
	e := attach.Group("/alert")

	handler := &alertHandler{
		serve.NewCrudHandler[biz.Alert](""),
	}

	handler.RegisterRoutes(e)
}
```

**关键规则：**

1. **handler struct 命名**：小写表名 + Handler，如 `alertHandler`、`merchHandler`。当同一文件有多个 handler 时，依次命名为 `handler`、`handler2`、`handler3`（参考 `other.go`）

2. **Attach 函数命名**：首字母大写的驼峰形式 + Attach，如 `AlertAttach`、`MerchAttach`。对于需要区分的表（如 `agent_closure`），用 `AttachAgentClosure` 格式

3. **路由路径**：使用表名的 snake_case 形式作为 URL path，如 `/alert`、`/agent_closure`、`/profit_daily`

4. **泛型参数**：使用 `demo/biz/tables.go` 中定义的 struct 名，如 `biz.Alert`、`biz.Merch`

5. **CrudHandler 参数**：`serve.NewCrudHandler[biz.Alert]("")`，第二个参数为空字符串

6. **RegisterRoutes**：调用 `handler.RegisterRoutes(e)` 注册 CRUD 路由

### 步骤 3：注册到 attach.go

在 `demo/routes/demo/attach.go` 的 `Attach` 函数中添加一行调用：

```go
func Attach(group *echo.Group) {
	MerchAttach(group)
	AgentAttach(group)
	ApplyAttach(group)
	AttachAgentClosure(group)
	AttachAgentRel(group)
	AttachProfitDaily(group)
	AttachOrderDaily(group)
	AlertAttach(group)  // ← 新增
}
```

**注意**：Attach 函数中的调用顺序按逻辑分组排列，新表添加到末尾即可。

### 步骤 4：验证

1. 确认新建的 route 文件语法正确，包名为 `demo`
2. 确认 `attach.go` 中已添加新表的 Attach 调用
3. 确认 import 路径正确：`github.com/lucky-byte/demo/biz` 和 `github.com/lucky-byte/lib/pkg/serve`
4. 运行 `go build` 验证编译通过

## 完整示例

以 `Alert` 表为例，展示从 DDL 到 route 的完整链路：

**DDL** (`demo/ddl/demo/alert.sql`)：
```sql
CREATE TABLE IF NOT EXISTS alert (
  id int64 NOT NULL COMMENT '自增ID',
  alert_level TINYINT NOT NULL COMMENT '告警级别',
  ...
  PRIMARY KEY (id)
);
```

**struct** (`demo/biz/tables.go`)：
```go
type Alert struct {
    ID         int64     `xorm:"bigint not null pk autoincr 'id'" json:"id"`
    AlertLevel int       `xorm:"tinyint not null 'alert_level'"  json:"alert_level"`
    ...
}
```

**ORM 注册** (`demo/biz/init.go`)：
```go
var AlertModel orm.EntityOps[Alert]

orm.MustLoadStructModel[Alert]()
AlertModel = orm.MustEntityOps[Alert]()
```

**Route handler** (`demo/routes/demo/alert.go`)：
```go
package demo

import (
    "github.com/labstack/echo/v4"
    "github.com/lucky-byte/demo/biz"
    "github.com/lucky-byte/lib/pkg/serve"
)

type alertHandler struct {
    *serve.CrudHandler[biz.Alert]
}

func AlertAttach(attach *echo.Group) {
    e := attach.Group("/alert")
    handler := &alertHandler{
        serve.NewCrudHandler[biz.Alert](""),
    }
    handler.RegisterRoutes(e)
}
```

**路由汇总** (`demo/routes/demo/attach.go`)：
```go
func Attach(group *echo.Group) {
    ...
    AlertAttach(group)
}
```

## 注意事项

- 如果表名与 struct 名不完全一致（如表名 `orders` 但 struct 名 `Order`），route handler 的泛型参数使用 struct 名，URL path 使用表名的 snake_case 形式
- 同一文件可以包含多个 handler（参考 `other.go` 中 `handler`、`handler2`、`handler3` 的命名方式），但优先每个表独立一个文件
- 创建 route 前务必确认 struct 和 ORM 注册已完成，否则编译会失败