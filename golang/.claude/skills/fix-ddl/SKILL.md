---
name: fix-ddl
description: 检查并同步 DDL SQL 与 Go 表结构及测试数据的一致性。当需要新增或修改 DDL（demo/docs/ddl/*.sql）、同步 demo/biz/tables.go 表结构、检查 demo/biz/init.go orm 注册、或修复 demo/docs/data/init.sql 测试数据时使用此 Skill。以 DDL SQL 为准，检查 SQL 语法错误并修复四者之间的差异。
---

# fix-ddl — DDL / tables.go / init.go / init.sql 四向同步

## 文件职责

| 文件 | 职责 |
|------|------|
| `demo/docs/ddl/xxx.sql` | **权威来源**：每张表一个文件，包含建表语句及必要的种子数据 |
| `demo/biz/tables.go` | Go xorm 结构体，需与对应 DDL 字段一一对应 |
| `demo/biz/init.go` | 表注册入口，每张表的 struct 必须在此调用 `orm.MustLoadStructModel[T]()` 注册，并声明对应的 `orm.EntityOps[T]` 变量及 `orm.MustEntityOps[T]()` 初始化 |
| `demo/docs/data/init.sql` | 测试环境初始化脚本，表结构操作需与 DDL 保持同步 |

## 检查流程

当涉及表结构变更时，按以下顺序操作：

### 1. 确认变更范围

- 读取涉及的 `demo/docs/ddl/<table>.sql`
- 对照 `demo/biz/tables.go` 中对应的 struct
- 检查 `demo/biz/init.go` 中该 struct 是否已完成 orm 注册（见下方步骤 5）
- 检查 `demo/docs/data/init.sql` 中是否有针对该表的 INSERT/DELETE/UPDATE

### 2. 以 DDL SQL 为准进行检查

**SQL 语法检查要点：**

- 每列定义末尾的逗号：最后一列（或最后一个索引/约束）前不能有多余逗号
- `PRIMARY KEY` 必须在列定义之后声明
- `COMMENT='...'` 在 `)` 之后，不能有多余的括号
- 时间字段统一使用 `DATETIME`（不用 TIMESTAMP）；业务日期用 `DATE`
- 自动时间字段：`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`，`updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
- `id` 字段类型为 `BIGINT NOT NULL`，不加 `AUTO_INCREMENT`（使用雪花ID）

**常见语法错误示例：**

```sql
-- 错误：最后一行多了逗号
CREATE TABLE IF NOT EXISTS `foo` (
  `id` BIGINT NOT NULL,
  `name` VARCHAR(64),          -- ← 这里逗号后无更多列/索引定义
) COMMENT='foo';

-- 正确
CREATE TABLE IF NOT EXISTS `foo` (
  `id` BIGINT NOT NULL,
  `name` VARCHAR(64),
  PRIMARY KEY (id)
) COMMENT='foo';
```

### 3. 同步 tables.go

DDL → Go struct 字段映射规则（xorm tag）：

| DDL 类型 | xorm tag |
|----------|----------|
| `BIGINT NOT NULL` | `xorm:"bigint not null"` |
| `VARCHAR(n) NOT NULL` | `xorm:"varchar(n) not null"` |
| `VARCHAR(n)` (nullable) | `xorm:"varchar(n)"` |
| `TINYINT NOT NULL DEFAULT 0` | `xorm:"tinyint not null default 0"` |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `xorm:"created 'created_at'"` |
| `DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE ...` | `xorm:"updated 'updated_at'"` |
| `TEXT` | `xorm:"text"` |
| `DATE` | 对应 `BizDate` 类型 |
| `PRIMARY KEY (id)` | 在字段 tag 中加 `pk` |

- `id` 字段为雪花ID，json tag 加 `string`：`json:"id,string"`
- 关联外键 ID 字段同样加 `json:"xxx_id,string"`
- `TableName()` 方法：当结构体名与表名不一致时需实现

### 4. 同步 init.sql

- 若 DDL 新增了列，检查 `init.sql` 中该表的 INSERT 语句，补充对应字段
- 若 DDL 删除或重命名了列，更新 `init.sql` 中的引用
- 列顺序与字段名以 DDL 为准

### 5. 检查 init.go 注册

若新增了表（新 struct），需在 `demo/biz/init.go` 中完成以下三步：

1. 在顶部声明 `var XxxModel orm.EntityOps[Xxx]`
2. 在 `InitDB()` 中调用 `orm.MustLoadStructModel[Xxx]()`
3. 在 `InitDB()` 中赋值 `XxxModel = orm.MustEntityOps[Xxx]()`

若删除了表，移除上述三处对应代码。

## 修复优先级

1. **先修复 DDL SQL 语法错误**（括号、逗号、关键字拼写）
2. **再对齐 tables.go**（字段名、类型、tag）
3. **检查 init.go 注册**（变量声明、`MustLoadStructModel`、`MustEntityOps` 三处齐全）
4. **最后检查 init.sql**（INSERT 列名与 DDL 列名一致）
