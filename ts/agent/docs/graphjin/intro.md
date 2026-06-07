# GraphJin 编译器完整映射分析：从 GraphQL 到 SQL

> 本文档基于 GraphJin v3.18.27 源码，逐步追踪一次 GraphQL 查询从输入文本到最终 SQL 的完整生命周期，每一步都给出源码定位和关键数据结构。

---

## 0. 全局流程概览

```
GraphQL 文本
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 1: 词法/语法解析 (Parser)      │  core/internal/graph/parse.go
│   输出: graph.Operation (AST)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Phase 2: 语义分析 & Schema 绑定      │  core/internal/qcode/qcode.go
│   输出: qcode.QCode (IR)            │  + core/internal/qcode/fields.go
│   关键: 关系推导、字段收集、权限过滤  │  + core/internal/qcode/exp.go
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Phase 3: 别名 & 作用域隔离           │  (Phase 2 内联完成)
│   关键: Select.ID = 0,1,2...        │  qcode.Compile() 中分配
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Phase 4: SQL 代码生成 (CodeGen)      │  core/internal/psql/query.go
│   输出: 单条 SQL 字符串              │  + core/internal/psql/columns.go
│   关键: LATERAL JOIN + JSON_AGG     │  + core/internal/psql/exp.go
│   Dialect 分发: Postgres/MySQL/...   │  core/internal/dialect/
└──────────────────────┬──────────────┘
                       │
                       ▼
                  数据库执行
                       │
                       ▼
              json.RawMessage → 客户端
          (Go 侧零反序列化开销)
```

---

## 1. Phase 1: 词法/语法解析

### 1.1 入口

```go
// core/internal/graph/parse.go:124
func Parse(gql []byte) (op Operation, err error)
```

### 1.2 解析过程

Parser 采用两遍扫描策略：

1. **第一遍**（快速扫描）：识别 `query`/`mutation`/`subscription` 关键字、fragment 定义，记录位置
2. **第二遍**（详细解析）：从记录的位置开始，构建完整的 `Operation` 树

### 1.3 核心数据结构

```go
// core/internal/graph/parse.go
type Operation struct {
    Type       ParserType   // OpQuery / OpMutate / OpSub
    Name       string       // query 的名称
    VarDef     []VarDef      // $var 定义
    Args       []Arg         // query 级别参数
    Directives []Directive   // @include, @skip 等
    Fields     []Field       // ← 核心：扁平化的字段树
    Query      []byte        // 原始查询文本
    Frags      []Fragment
}

type Field struct {
    ID         int32        // 全局唯一 ID（扁平数组中的下标）
    ParentID   int32        // 父字段 ID，-1 表示根节点
    Type       FieldType    // FieldUnion / FieldMember / 普通字段
    Name       string       // 字段名（如 "products", "id", "owner"）
    Alias      string       // GraphQL 别名
    Args       []Arg        // 字段参数（where, limit, order_by 等）
    Directives []Directive
    Children   []int32      // 子字段 ID 列表
}
```

### 1.4 关键设计：扁平化数组

GraphJin 的 Parser **不构建嵌套的树状结构**，而是将所有字段平铺到一个 `[]Field` 数组中，通过 `ParentID` / `Children` 建立引用关系。

**示例输入**：

```graphql
query {
  products(limit: 10) {
    id
    name
    owner {
      id
      name
    }
  }
}
```

**解析结果**（扁平化表示）：

| ID | Name      | ParentID | Children   | Type  |
|----|-----------|----------|------------|-------|
| 0  | products  | -1       | [1, 2, 3]  | 普通   |
| 1  | id        | 0        | []         | 普通叶 |
| 2  | name      | 0        | []         | 普通叶 |
| 3  | owner     | 0        | [4, 5]     | 普通嵌 |
| 4  | id        | 3        | []         | 普通叶 |
| 5  | name      | 3        | []         | 普通叶 |

这种扁平化设计的好处：
- **零嵌套指针**：所有字段在连续内存中，对 CPU 缓存友好
- **O(1) 访问**：通过 `Fields[id]` 直接索引，无需遍历
- **栈式编译**：后续编译阶段用栈遍历，天然适配

---

## 2. Phase 2: 语义分析与 Schema 绑定

### 2.1 入口

```go
// core/internal/qcode/qcode.go:518
func (co *Compiler) Compile(query []byte, vmap map[string]json.RawMessage,
    role, namespace string) (qc *QCode, err error)
```

内部调用链：

```
Compile()
  └→ compileQuery(qc, op, role)
       └→ 循环: 对每个 Field 执行
            ├→ addRelInfo()        // 关系推导
            ├→ setSelectorRoleConfig() // 权限检查
            ├→ compileSelectArgs()    // 参数编译
            ├→ compileFields()       // 字段编译 + 列收集
            ├→ addFilters()          // 权限过滤注入
            └→ setRelFilters()       // 关系 JOIN 条件注入
```

### 2.2 元数据自动加载（启动时完成）

```go
// core/internal/sdata/schema.go:109
func NewDBSchema(info *DBInfo, aliases map[string][]string) (*DBSchema, error)
```

GraphJin 在启动时执行 SQL 查询 `information_schema`，构建完整的**关系物理拓扑图**：

```go
type DBSchema struct {
    tables            []DBTable               // 所有表
    tindex            map[string]nodeInfo     // 表名 → 节点索引
    edgesIndex        map[string][]edgeInfo   // 边索引
    allEdges          map[int32]TEdge         // 全部边
    relationshipGraph *util.Graph             // 图算法引擎
    crossDBRels       []CrossDBRel            // 跨数据库 FK
}

type DBRel struct {
    Type       RelType       // RelOneToOne / RelOneToMany / RelPolymorphic / RelRecursive / ...
    Left       DBRelLeft     // {Ti: DBTable, Col: DBColumn}
    Right      DBRelRight    // {Ti: DBTable, Col: DBColumn}
    ExtraPairs []ColPair     // 复合外键的额外列对
}
```

**关系推导逻辑**（`sdata/schema.go:260` `addColumnRels`）：

```go
for _, c := range t.Columns {
    if c.FKeyTable == "" { continue }
    // 找到外键目标表
    ft := schema.tables[fkTableNodeID]
    fc := ft.getColumn(c.FKeyCol)

    // 根据基数确定关系类型
    switch {
    case c.FKRecursive:   rt = RelRecursive     // 自引用
    case fc.UniqueKey:    rt = RelOneToOne       // 唯一键 → 1:1
    default:             rt = RelOneToMany       // 默认 → 1:N
    }
    schema.addToGraph(t, c, ft, fc, rt)
}
```

### 2.3 关系推导过程（以 products.owner 为例）

当 `compileQuery` 遍历到 `owner` 字段时：

```go
// core/internal/qcode/qcode.go:801
func (co *Compiler) addRelInfo(name, op, qc, sel, field) error
```

1. `name = "owner"`，`parentName = "products"`
2. 调用 `co.FindPath("owner", "products", "")` — 在关系图中搜索路径
3. 内部使用 `util.Graph.Connections()` 执行 BFS
4. 找到路径：`products.owner_id → users.id`（RelOneToOne）
5. 将 `DBRel` 注入到 `sel.Rel`：

```go
sel.Rel = DBRel{
    Type:  RelOneToOne,
    Left:  {Ti: users, Col: DBColumn{Name: "id", Table: "users"}},
    Right: {Ti: products, Col: DBColumn{Name: "owner_id", Table: "products"}},
}
```

### 2.4 字段收集与列投影

```go
// core/internal/qcode/fields.go:97
func (co *Compiler) compileChildColumns(st, op, qc, sel, gf, tr, role) error
```

对于每个叶子字段（如 `id`, `name`），编译器执行：

1. **验证字段存在性**：`sel.Ti.ColumnExists(name)` — 检查列是否在表中
2. **权限检查**：`validateField(qc, f, tr)` — 检查角色是否有权访问该列
3. **收集到两个列表**：
   - `sel.Fields []Field` — 用户请求的输出字段（用于 JSON 构建）
   - `sel.BCols []Column` — 基础列（用于 FROM SELECT，含隐式加入的 Join 列）

**隐式列注入**（`fields.go:385` `addRelColumns`）：

```go
case RelOneToOne, RelOneToMany:
    psel.addBaseCol(Column{Col: rel.Right.Col})  // 将 products.owner_id 加入父 Select 的 BCols
```

这意味着 `owner_id` 列会**自动被添加**到 `products` 的 SELECT 列表中，即使用户没有显式请求它。这是后续 LATERAL JOIN 关联条件的来源。

### 2.5 权限过滤注入

```go
// core/internal/qcode/qcode.go:1306
func addFilters(qc *QCode, where *Filter, trv trval) bool
```

权限配置中的过滤条件会被自动注入到 WHERE 子句中。例如配置：

```yaml
roles:
  user:
    tables:
      - name: products
        query:
          filters: ["{ owner_id: { eq: $user_id } }"]
```

会被编译为 `Exp` 树，注入到 `sel.Where`：

```go
sel.Where = Filter{
    Exp: &Exp{
        Op:    OpAnd,
        Children: []*Exp{
            {Op: OpEquals, Left: {Col: owner_id_col}, Right: {ValType: ValVar, Val: "user_id"}},
        },
    },
}
```

### 2.6 关系 JOIN 条件注入

```go
// core/internal/qcode/qcode.go:925
func (co *Compiler) setRelFilters(qc *QCode, sel *Select)
```

根据 `sel.Rel.Type`，将 JOIN 条件注入到子 Select 的 WHERE 子句：

```go
case RelOneToOne, RelOneToMany:
    // 注入: users.id = products.owner_id
    ex := &Exp{Op: OpEquals}
    ex.Left.Col = rel.Left.Col     // users.id
    ex.Right.ID = sel.ParentID     // 引用父 Select
    ex.Right.Col = rel.Right.Col   // products.owner_id
    addAndFilter(&sel.Where, ex)
```

**注意**：这里的 `ex.Right.ID = sel.ParentID` 是关键 — 它不是直接写死表名，而是引用**父 Select 的 ID**。在 SQL 生成阶段，这个 ID 会被解析为带别名的列引用（如 `products_0.owner_id`）。

---

## 3. Phase 3: 别名与作用域隔离

GraphJin 的别名方案**不是运行时计数器**，而是**编译期确定性 ID**。

### 3.1 ID 分配

```go
// core/internal/qcode/qcode.go:564
func (co *Compiler) compileQuery(qc *QCode, op *graph.Operation, role string) error {
    var id int32  // ← 从 0 开始递增
    // ...
    for { /* 栈式遍历 */
        s1 := Select{
            Field: Field{ID: id, ParentID: parentID},
        }
        // ...
        id++
    }
}
```

每个 Select 节点在编译时获得一个**确定性递增 ID**：0, 1, 2, ...

### 3.2 别名生成

```go
// core/internal/psql/util.go:16
func (c *compilerContext) aliasWithID(alias string, id int32) {
    c.dialect.RenderTableAlias(c, alias+"_"+strconv.Itoa(int(id)))
}

func (c *compilerContext) colWithTableID(table string, id int32, col string) {
    c.quoted(table + "_" + strconv.Itoa(int(id)))  // products_0
    c.w.WriteString(`.`)
    c.quoted(col)                                    // .name
}
```

**生成规则**：
- 表别名：`{table}_{id}` — 如 `products_0`, `users_1`
- 列引用：`{table}_{id}.{col}` — 如 `products_0.name`, `users_1.id`
- 子查询别名：`__sj_{id}`, `__sr_{id}`

**确定性 ID 的优势**：
- 同一条 GraphQL 查询，无论何时编译，生成的 SQL 完全一致
- 支持 SQL 缓存和预编译（prepared statement）
- 自引用场景（A → B → A）天然隔离：同一张表不同深度的 Select 有不同 ID

---

## 4. Phase 4: SQL 代码生成

### 4.1 入口

```go
// core/internal/psql/query.go:143
func (co *Compiler) Compile(w *bytes.Buffer, qc *qcode.QCode) (Metadata, error)
```

内部调用链：

```
Compile()
  └→ CompileQuery(w, qc, md)
       ├→ 1. 渲染 JSON 根对象: SELECT json_build_object(...)
       ├→ 2. 渲染根字段
       │    ├→ 一对一: colWithTableID("__sj", sel.ID, "json")
       │    └→ 一对多: colWithTableID("__sj", sel.ID, "json")
       ├→ 3. 渲染 FROM 子查询
       └→ 4. renderQuery(st, true)  ← 栈式递归渲染
            ├→ renderLateralJoin(sel)    // LEFT OUTER JOIN LATERAL
            ├→ renderPluralSelect(sel)   // SELECT json_agg(...)
            ├→ renderSelect(sel)        // SELECT ... FROM (subquery)
            │    ├→ renderColumns(sel)
            │    ├→ renderBaseSelect(sel)
            │    │    ├→ renderBaseColumns(sel)
            │    │    ├→ renderFrom(sel)
            │    │    ├→ renderJoinTables(sel)
            │    │    ├→ renderWhere(sel)
            │    │    ├→ renderOrderBy(sel)
            │    │    └→ renderLimit(sel)
            │    └→ renderSelectClose(sel)
            ├→ 递归子节点
            ├→ renderSelectClose(sel)
            └→ renderLateralJoinClose(sel) // ON 1=1
```

### 4.2 场景一：一对一关系 (BelongsTo / HasOne)

**GraphQL**：

```graphql
query {
  products(limit: 10) {
    id
    name
    owner {
      id
      name
    }
  }
}
```

**生成的 SQL**（PostgreSQL）：

```sql
SELECT json_build_object(
  'products', "__sj_0"."json"
) AS "__root"
FROM (
  SELECT
    -- 对多包装层
    coalesce(json_agg("__sj_0"."json"), '[]') AS "json"
  FROM (
    -- 每个 product 的 JSON 构建层
    SELECT json_build_object(
      'id', "products_0"."id",
      'name', "products_0"."name",
      'owner', "__sj_1"."json"
    ) AS "json"
    FROM (
      -- 基础数据层：products 表
      SELECT
        "products"."id" AS "t0_id",
        "products"."name" AS "t0_name",
        "products"."owner_id" AS "t0_owner_id"
      FROM "public"."products"
      LIMIT 10
    ) "products_0"
    -- owner 是一对一，使用 LATERAL JOIN
    LEFT OUTER JOIN LATERAL (
      SELECT
        coalesce(
          json_build_object(
            'id', "users_1"."id",
            'name', "users_1"."name"
          ),
          'null'
        ) AS "json"
      FROM (
        SELECT
          "users"."id" AS "t1_id",
          "users"."name" AS "t1_name"
        FROM "public"."users"
        WHERE ("users"."id") = ("products_0"."owner_id")
      ) "users_1"
    ) "__sj_1" ON 1=1
  ) "__sj_0"
) "__root"
```

**逐层解析**：

| 层 | 别名 | 作用 |
|----|------|------|
| 最内层 | `products_0` | 从 products 表取基础列（含隐式加入的 `owner_id`） |
| 中间层 | `users_1` | 从 users 表取关联数据，WHERE 引用父层别名 `products_0.owner_id` |
| JSON 构建层 | `__sj_1` | 用 `json_build_object` 将 users 的列组装成 JSON 对象 |
| 聚合层 | `__sj_0` | 用 `json_agg` 将多个 product 的 JSON 聚合成数组 |
| 根层 | `__root` | 用 `json_build_object` 包装顶层字段名 |

**一对一的关键设计**：
- 使用 `LEFT OUTER JOIN LATERAL`，不是标量子查询
- `ON 1=1`：关联条件已在子查询 WHERE 中，外层 JOIN 只需保证不丢行
- `coalesce(..., 'null')`：当 owner 不存在时返回 JSON null 而非 SQL NULL
- 子查询 WHERE 中的 `"products_0"."owner_id"`：**通过别名引用父层列**，这是 LATERAL 的核心能力

### 4.3 场景二：一对多关系 (HasMany)

**GraphQL**：

```graphql
query {
  products(limit: 5) {
    id
    name
    comments {
      id
      body
    }
  }
}
```

**生成的 SQL**：

```sql
SELECT json_build_object(
  'products', "__sj_0"."json"
) AS "__root"
FROM (
  SELECT coalesce(json_agg("__sj_0"."json"), '[]') AS "json"
  FROM (
    SELECT json_build_object(
      'id', "products_0"."id",
      'name', "products_0"."name",
      'comments', "__sj_1"."json"
    ) AS "json"
    FROM (
      SELECT
        "products"."id" AS "t0_id",
        "products"."name" AS "t0_name",
        "products"."id" AS "t0_id"  -- 隐式加入，用于关联
      FROM "public"."products"
      LIMIT 5
    ) "products_0"
    LEFT OUTER JOIN LATERAL (
      SELECT
        coalesce(json_agg("__sj_1"."json"), '[]') AS "json"
      FROM (
        SELECT json_build_object(
          'id', "comments_1"."id",
          'body', "comments_1"."body"
        ) AS "json"
        FROM (
          SELECT
            "comments"."id" AS "t1_id",
            "comments"."body" AS "t1_body"
          FROM "public"."comments"
          WHERE ("comments"."product_id") = ("products_0"."id")
        ) "comments_1"
      ) "__sj_1"
    ) "__sj_1" ON 1=1
  ) "__sj_0"
) "__root"
```

**一对多 vs 一对一的区别**：

| 维度 | 一对一 (owner) | 一对多 (comments) |
|------|---------------|-------------------|
| 子查询最外层 | `json_build_object` | `json_agg(json_build_object(...))` |
| 空结果处理 | `coalesce(..., 'null')` | `coalesce(..., '[]')` |
| 父层隐式列 | `owner_id`（FK 列） | `id`（PK 列，被子表引用） |
| 子查询 WHERE | `users.id = products_0.owner_id` | `comments.product_id = products_0.id` |

**一对多的关键设计**：
- 子查询多了一层 `json_agg` 聚合，将多行变成 JSON 数组
- `coalesce(..., '[]')`：保证没有评论时返回空数组而非 null
- **不会产生笛卡尔积**：因为 `json_agg` 在子查询中完成聚合，父行始终是一对一的

### 4.4 场景三：深层嵌套 (三级关联)

**GraphQL**：

```graphql
query {
  products(limit: 5) {
    id
    name
    owner {
      id
      name
      company {
        id
        name
      }
    }
  }
}
```

**生成的 SQL** 结构：

```
__root
  └→ __sj_0 (json_agg: products 数组)
       └→ products_0 (基础列)
            ├→ __sj_1 (LATERAL JOIN: owner JSON 对象)
            │    └→ users_1 (基础列)
            │         └→ __sj_2 (LATERAL JOIN: company JSON 对象)
            │              └→ companies_2 (基础列)
            │                   WHERE companies_2.id = users_1.company_id
            │
            │  WHERE users_1.id = products_0.owner_id
            │
            └→ json_build_object(
                 'id', products_0.id,
                 'name', products_0.name,
                 'owner', __sj_1.json
               )
```

**深层嵌套的 LATERAL 链**：

```sql
-- 第三级：company
LEFT OUTER JOIN LATERAL (
  SELECT json_build_object('id', ..., 'name', ...) AS "json"
  FROM (
    SELECT ... FROM companies
    WHERE ("companies"."id") = ("users_1"."company_id")  -- 引用第二层
  ) "companies_2"
) "__sj_2" ON 1=1

-- 第二级：owner (内嵌第三级)
LEFT OUTER JOIN LATERAL (
  SELECT coalesce(json_build_object(
    'id', "users_1"."id",
    'name', "users_1"."name",
    'company', "__sj_2"."json"  -- 嵌入第三级 JSON
  ), 'null') AS "json"
  FROM (
    SELECT ... FROM users
    WHERE ("users"."id") = ("products_0"."owner_id")  -- 引用第一层
  ) "users_1"
  -- 第三级 LATERAL JOIN 嵌套在第二级内部
  LEFT OUTER JOIN LATERAL (...) "__sj_2" ON 1=1
) "__sj_1" ON 1=1
```

**关键观察**：每一层 LATERAL 子查询通过**别名引用其直接父层**的列，形成清晰的词法作用域链。这正是 LATERAL JOIN 的核心语义 — 子查询可以引用左侧所有已出现的表别名。

### 4.5 场景四：exists / none 过滤器

**GraphQL**：

```graphql
query {
  products(where: { comments: { exists: { body: { ilike: "%great%" } } } }) {
    id
    name
  }
}
```

**编译过程**（`qcode/exp.go:946` `processNestedTable`）：

1. 识别 `comments` 不是 products 表的列 → 调用 `FindPath("comments", "products", "")`
2. 找到路径：`comments.product_id → products.id`（RelOneToMany）
3. 构建 Join 链：`Join{Rel: RelOneToMany, Filter: join_filter}`
4. 将表达式标记为 `OpSelectExists`

**生成的 SQL**（`psql/exp.go:110` `renderNestedExp`）：

```sql
SELECT
  "products"."id" AS "t0_id",
  "products"."name" AS "t0_name"
FROM "public"."products"
WHERE EXISTS (
  SELECT 1 FROM "public"."comments"
  WHERE ("comments"."product_id") = ("products"."id")
  AND ("comments"."body" ILIKE '%great%')
)
```

**`none` 过滤器**：生成 `WHERE NOT EXISTS (...)`，结构完全相同。

### 4.6 场景五：多对多（通过中间表）

**数据库结构**：

```sql
products ← product_tags → tags
```

**GraphQL**：

```graphql
query {
  products(limit: 5) {
    id
    name
    tags {
      id
      name
    }
  }
}
```

**关系推导**（`qcode/qcode.go:844`）：

`FindPath("tags", "products", "")` 返回两条边：

```
Path[0]: products.id → product_tags.product_id  (RelOneToMany)
Path[1]: product_tags.tag_id → tags.id           (RelOneToOne)
```

**处理逻辑**（`qcode/qcode.go:872`）：

```go
// 主关系 = Path[0]（最后一跳到目标表）
sel.Rel = PathToRel(path[0])  // tags.id = product_tags.tag_id

// 中间表 = Path[1:] 的反向遍历
for i := len(rpath) - 1; i >= 0; i-- {
    rel := PathToRel(rpath[i])
    sel.Joins = append(sel.Joins, Join{
        Rel:    rel,
        Filter: buildFilter(rel, -1),  // product_tags.product_id = products.id
    })
}
```

**生成的 SQL**：

```sql
LEFT OUTER JOIN LATERAL (
  SELECT coalesce(json_agg("__sj_1"."json"), '[]') AS "json"
  FROM (
    SELECT json_build_object('id', "tags_1"."id", 'name', "tags_1"."name") AS "json"
    FROM (
      SELECT
        "tags"."id" AS "t1_id",
        "tags"."name" AS "t1_name"
      FROM "public"."tags"
      -- 中间表 JOIN 自动注入
      INNER JOIN "public"."product_tags"
        ON (("product_tags"."tag_id") = ("tags"."id"))
    ) "tags_1"
    WHERE ("product_tags"."product_id") = ("products_0"."id")
  ) "__sj_1"
) "__sj_1" ON 1=1
```

**中间表处理的关键**：
- `INNER JOIN product_tags ON product_tags.tag_id = tags.id` — 自动注入到子查询的 FROM 子句中
- `WHERE product_tags.product_id = products_0.id` — 通过 LATERAL 引用父层列
- 中间表不出现在 JSON 输出中 — 它只是 SQL 层面的桥接

---

## 5. Dialect 抽象层

### 5.1 接口设计

```go
// core/internal/dialect/dialect.go
type Dialect interface {
    Name() string
    SupportsLateral() bool
    QuoteIdentifier(string) string
    RenderJSONRoot(ctx Context, sel *qcode.Select)
    RenderJSONRootField(ctx Context, name string, renderVal func())
    RenderJSONPlural(ctx Context, sel *qcode.Select)
    RenderJSONSelect(ctx Context, sel *qcode.Select)
    RenderJSONField(ctx Context, alias, table, col string, isNull, isJSON bool)
    RenderInlineChild(ctx Context, fullCtx Context, psel, sel *qcode.Select)
    RenderLimit(ctx Context, sel *qcode.Select)
    RenderOrderBy(ctx Context, sel *qcode.Select)
    RenderDistinctOn(ctx Context, sel *qcode.Select)
    RenderCursorCTE(ctx Context, sel *qcode.Select)
    RenderSetSessionVar(ctx Context, name, value string) bool
    // ...更多方法
}
```

### 5.2 PostgreSQL vs MySQL 的 JSON 函数映射

| 功能 | PostgreSQL | MySQL 8.0+ |
|------|-----------|------------|
| 构建 JSON 对象 | `json_build_object('k', v)` | `JSON_OBJECT('k', v)` |
| 聚合为 JSON 数组 | `json_agg(col)` | `JSON_ARRAYAGG(col)` |
| LATERAL JOIN | `LEFT OUTER JOIN LATERAL (...)` | `LEFT JOIN LATERAL (...)` |
| 标识符引用 | `"name"` | `` `name` `` |
| 游标分页 CTE | `WITH __cur AS (SELECT ...)` | `WITH __cur AS (SELECT ...)` |
| 空数组默认值 | `coalesce(..., '[]'::json)` | `COALESCE(..., JSON_ARRAY())` |

### 5.3 不支持 LATERAL 的方言（MSSQL, Oracle）

```go
// core/internal/psql/query.go:246
if !c.dialect.SupportsLateral() {
    // 使用内联子查询替代 LATERAL JOIN
    c.dialect.RenderInlineChild(c, c, nil, sel)
}
```

对于不支持 LATERAL 的数据库，GraphJin 将子查询内联到 SELECT 列表中：

```sql
-- MSSQL 风格（无 LATERAL）
SELECT
  "products"."id",
  "products"."name",
  (
    SELECT JSON_OBJECT('id', "users"."id", 'name', "users"."name")
    FROM "users"
    WHERE "users"."id" = "products"."owner_id"
    FOR JSON PATH
  ) AS "owner"
FROM "products"
```

---

## 6. 执行期：零反序列化的秘密

### 6.1 数据库返回格式

GraphJin 生成的 SQL，最终通过 `json_build_object` / `json_agg` 在数据库内部完成嵌套 JSON 构建。数据库返回的结果是：

```
单行、单列，类型为 text/jsonb
内容是完整的嵌套 JSON 字符串
```

例如：

```json
{"products": [{"id": 1, "name": "Widget", "owner": {"id": 42, "name": "Alice"}}]}
```

### 6.2 Go 侧处理

```go
// 数据库返回的 bytes 直接作为 json.RawMessage
result.Data = json.RawMessage(rawBytes)

// 无需：
// 1. Scan 到 struct
// 2. 实例化子对象
// 3. 内存 Hydration
// 4. 再序列化为 JSON
```

**对比传统 ORM**：

| 步骤 | 传统 ORM (GORM/xorm) | GraphJin |
|------|---------------------|----------|
| DB 返回 | N*M 行（笛卡尔积） | 1 行 |
| Go Scan | N*M 次 struct 赋值 | 1 次 []byte 读取 |
| Hydration | 内存中 N*M 次对象组装 | 无（DB 已完成） |
| JSON 序列化 | reflect 遍历 struct | 无（已是 JSON） |
| 内存分配 | O(N*M) | O(1) |

---

## 7. 完整生命周期：一次查询的端到端追踪

以 `GET /api/graphql?query={ products { id name owner { id name } } }` 为例：

```
1. HTTP 请求到达
     ↓
2. api.go: GraphQL() 方法
     │  - FastParseBytes: 快速提取 operation name 和 type
     │  - 生产模式: 检查 AllowList
     ↓
3. gstate.go: newGState()
     │  - 解析变量（解密加密字段）
     │  - 确定角色（anon/user/admin）
     ↓
4. gstate.go: compile()
     │  - compileQueryForRole()
     │    ├→ qcode.Compiler.Compile()  ← Phase 1+2+3
     │    │   ├→ graph.Parse(query)     → Operation AST
     │    │   ├→ compileQuery()         → QCode IR
     │    │   │   ├→ addRelInfo()       → 关系推导
     │    │   │   ├→ compileFields()     → 列收集
     │    │   │   ├→ addFilters()        → 权限注入
     │    │   │   └→ setRelFilters()    → JOIN 条件
     │    │   └→ 返回 QCode
     │    │
     │    └→ psql.Compiler.Compile()   ← Phase 4
     │        ├→ CompileQuery()
     │        │   ├→ 渲染 SELECT json_build_object(...)
     │        │   ├→ 渲染 FROM (subquery)
     │        │   └→ renderQuery()      → 递归渲染 LATERAL JOIN
     │        └→ 返回 SQL 字符串 + Metadata
     ↓
5. compileAndExecute()
     │  - 获取 DB 连接
     │  - 执行 SQL
     │  - Scan 单行 → []byte
     ↓
6. 返回 Result
     │  - Data: json.RawMessage (零拷贝)
     │  - 包装为 {"data": ...}
     ↓
7. HTTP Response
```

---

## 8. 源码文件索引

| 阶段 | 文件 | 核心函数/结构体 |
|------|------|----------------|
| Phase 1 | `core/internal/graph/parse.go` | `Parse()`, `Operation`, `Field` |
| Phase 2 | `core/internal/qcode/qcode.go` | `Compile()`, `compileQuery()`, `QCode`, `Select` |
| Phase 2 | `core/internal/qcode/fields.go` | `compileFields()`, `addRelColumns()` |
| Phase 2 | `core/internal/qcode/exp.go` | `compileExpNode()`, `processNestedTable()`, `Exp` |
| Phase 2 | `core/internal/sdata/schema.go` | `NewDBSchema()`, `addColumnRels()`, `DBSchema`, `DBRel` |
| Phase 3 | (Phase 2 内联) | `Select.ID` 分配 |
| Phase 4 | `core/internal/psql/query.go` | `CompileQuery()`, `renderQuery()` |
| Phase 4 | `core/internal/psql/columns.go` | `renderColumns()`, `renderBaseColumns()` |
| Phase 4 | `core/internal/psql/exp.go` | `renderExp()`, `renderNestedExp()` |
| Phase 4 | `core/internal/psql/util.go` | `aliasWithID()`, `colWithTableID()` |
| Dialect | `core/internal/dialect/postgres.go` | `PostgresDialect` |
| Dialect | `core/internal/dialect/mysql.go` | `MySQLDialect` |
| Dialect | `core/internal/dialect/dialect.go` | `Dialect` 接口 |
| 执行 | `core/gstate.go` | `compileAndExecute()` |
| 入口 | `core/api.go` | `GraphQL()` |

---

## 9. xorm 改造的关键对应关系

| GraphJin 概念 | xorm 对应 | 改造难度 |
|---------------|----------|---------|
| `sdata.DBSchema`（自动加载） | `xorm.Engine.DBMetas()` | **低** — DBMetas 返回 `*schemas.Table`，含 PK/FK 信息 |
| `graph.Parse()`（GraphQL 解析） | 直接复用或自研轻量 DSL | **中** — GraphJin parser 是 MIT 协议可复用 |
| `qcode.QCode`（IR） | 自研 SQLBuilder IR | **中** — 需设计 Select 树 + 别名生成 |
| `psql.Compiler`（SQL 生成） | 基于 `strings.Builder` 的 SQL 渲染器 | **高** — 这是最复杂的部分，需处理 JSON 函数 + LATERAL |
| `Dialect` 接口（方言抽象） | xorm 已有 `Dialect` 接口 | **低** — 可复用 xorm 现有抽象 |
| `json.RawMessage`（零拷贝） | xorm 的 `Iterate` + 自定义 callback | **中** — 需绕过 xorm 的 struct scan |

**建议的改造顺序**：
1. **先验证** `DBMetas()` 的 FK 信息完整性
2. **先硬编码** SQL 拼接的 Hello World（跳过解析器）
3. **再引入** GraphJin parser 或自研 DSL
4. **最后** 实现 Dialect 抽象（PostgreSQL → MySQL 适配）