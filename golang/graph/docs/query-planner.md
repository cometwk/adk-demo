# Graph Traversal Planner + Traversal IR 详细设计

## 1. 概述

Graph Traversal Planner 是 Semantic Graph Runtime 的**第一阶段编译器**。

它接收 DSL 的 `match + traverse` 部分，执行语义绑定与校验，输出平台无关的 **Traversal IR**（`TraversalPlan`）。

核心约束：

- **不生成 SQL**，只做语义绑定
- **不执行数据库**，纯内存计算
- 输出的 `TraversalPlan` 可缓存复用，供 Projection Planner / Metric Planner 消费
- 与 Projection Layer 完全解耦 —— 同一个 TraversalPlan 可驱动 Query、Aggregate、Count 等多种投影

架构位置：

```text
DSL (match + traverse)
        │
        ▼
Graph Traversal Planner    ◄── 本文档范围
        │
        ▼
TraversalPlan (IR)         ◄── 本文档范围
        │
   Redis / Memory 缓存
        │
   plan_token 引用
        │
    ┌───┴───┐
    ▼       ▼
Projection  Metric
Planner     Planner
```

---

## 2. 职责边界

### 负责

| 职责 | 说明 |
|------|------|
| Alias 唯一性校验 | 所有 alias 全局唯一 |
| Relation 解析与校验 | relation 必须在 Registry 中存在，from_table 必须匹配 |
| Scope 类型标注 | 每个 alias 标注 ScopeType：materialize / exists / not_exists |
| Existential Scope 构建 | 构建 EXISTS / NOT EXISTS 子查询边界 |
| Cardinality 分析 | 标记 one_to_many 路径，供下游分页/聚合决策 |
| TraversalPlan IR 生成 | 输出完整的、自包含的 IR |

### 不负责

| 职责 | 归属 |
|------|------|
| SELECT 字段选择 | Projection Planner |
| 聚合表达式 (SUM/COUNT/AVG) | Metric Planner |
| 分页 (LIMIT/OFFSET) 与排序 (ORDER BY) | Projection Planner / SQL Compiler |
| SQL 字符串生成 | SQL Compiler |
| 数据库执行 | Xorm Engine |

---

## 3. 输入数据结构

输入为 DSL 解析后的 Go 结构体，与 JSON DSL 一一对应。

### 3.1 GraphTraversalQuery

```go
// GraphTraversalQuery 是 Planner 的完整输入，对应 DSL 的 match + traverse 部分。
type GraphTraversalQuery struct {
    Match    *MatchClause      `json:"match"`
    Traverse []*TraverseClause `json:"traverse"`
}
```

### 3.2 MatchClause

```go
// MatchClause 定义 Traversal 起点（Root Scope）。
type MatchClause struct {
    Type  string             `json:"type"`  // 表名
    Alias string             `json:"alias"` // 全局唯一别名
    Where []*WherePredicate  `json:"where"` // 根节点过滤条件
}
```

### 3.3 TraverseClause

```go
// TraverseClause 定义单步遍历。
type TraverseClause struct {
    From     string            `json:"from"`     // 来源 alias
    Relation string            `json:"relation"`  // Relation Registry 中的关系名
    Alias    string            `json:"alias"`     // 本步骤产生的全局唯一别名
    Require  string            `json:"require"`   // "always" | "optional" | "exists" | "none"
    Where    []*WherePredicate `json:"where"`     // 本步骤节点的过滤条件
}
```

### 3.4 WherePredicate

```go
// WherePredicate 是通用的谓词结构，match.where 和 traverse[].where 共享。
type WherePredicate struct {
    Field string `json:"field"` // 字段名
    Op    string `json:"op"`    // 操作符：eq | neq | gt | gte | lt | lte | in | not_in | like | is_null
    Value any    `json:"value"` // 值，类型取决于 op
}
```

---

## 4. Traversal IR 数据结构

TraversalPlan 是 Planner 的输出 IR，也是下游所有 Planner 的输入。

设计原则：

- **自包含**：IR 内嵌 RelationSchema，下游无需再访问 Registry
- **可序列化**：支持 JSON 序列化，用于 Redis 缓存
- **不可变**：Plan 生成后不被修改，Projection 只读取

### 4.1 TraversalPlan

```go
// TraversalPlan 是 Graph Traversal Planner 的输出 IR。
// 它完整描述了 Traversal 语义，独立于 Projection。
type TraversalPlan struct {
    // ID 是 plan 的唯一标识，用于缓存索引。
    // 生成规则：SHA256(canonical_json(match + traverse))
    ID string `json:"id"`

    // RootAlias 是 match 定义的根别名。
    RootAlias string `json:"root_alias"`

    // RootTable 是 match 定义的根表名。
    RootTable string `json:"root_table"`

    // RootPredicates 是 match.where 中的谓词列表。
    RootPredicates []*Predicate `json:"root_predicates"`

    // AliasBindings 记录所有 alias 的绑定信息，key 为 alias 名。
    AliasBindings map[string]*AliasBinding `json:"alias_bindings"`

    // Steps 是有序的遍历步骤列表，与 DSL traverse 数组一一对应。
    Steps []*TraversalStep `json:"steps"`

    // ExistentialScopes 是所有 EXISTS / NOT EXISTS 子查询边界。
    ExistentialScopes []*ExistentialScope `json:"existential_scopes"`

    // HasFanOut 标记整个 Traversal 是否存在物化的 one_to_many 关系。
    // 为 true 时，Query 模式必须采用 Root Pagination First 策略。
    HasFanOut bool `json:"has_fan_out"`
}
```

### 4.2 AliasBinding

```go
// AliasBinding 记录一个 alias 的完整绑定信息。
type AliasBinding struct {
    // Alias 是全局唯一别名。
    Alias string `json:"alias"`

    // Table 是 alias 绑定的目标表名。
    Table string `json:"table"`

    // ParentAlias 是产生此 alias 的父 alias，root alias 此字段为空。
    ParentAlias string `json:"parent_alias"`

    // RelationName 是产生此 alias 的 relation 名，root alias 此字段为空。
    RelationName string `json:"relation_name"`

    // ScopeType 标注本 alias 所在的作用域类型。
    ScopeType ScopeType `json:"scope_type"`
}
```

### 4.3 ScopeType

```go
// ScopeType 标注 alias 所在的作用域类型。
type ScopeType int

const (
    // ScopeMaterialize 表示 alias 的行被物化（always / optional），
    // 对应 INNER JOIN / LEFT JOIN。
    ScopeMaterialize ScopeType = iota

    // ScopeExists 表示 alias 处于 EXISTS 子查询边界内，
    // 对应 SEMI JOIN。
    ScopeExists

    // ScopeNotExists 表示 alias 处于 NOT EXISTS 子查询边界内，
    // 对应 ANTI JOIN。
    ScopeNotExists
)

func (s ScopeType) String() string {
    switch s {
    case ScopeMaterialize:
        return "materialize"
    case ScopeExists:
        return "exists"
    case ScopeNotExists:
        return "not_exists"
    default:
        return "unknown"
    }
}
```

### 4.4 TraversalStep

```go
// TraversalStep 描述单步遍历的完整语义。
// 它是 TraversalPlan.Steps 数组的一个元素。
type TraversalStep struct {
    // FromAlias 是来源 alias。
    FromAlias string `json:"from_alias"`

    // ToAlias 是本步骤产生的目标 alias。
    ToAlias string `json:"to_alias"`

    // Require 是本步遍历的约束类型。
    Require RequireType `json:"require"`

    // Relation 是本步遍历使用的完整 Relation Schema。
    // 内嵌而非引用，使 IR 自包含。
    Relation *RelationSchema `json:"relation"`

    // JoinCondition 是解析后的 JOIN 条件，由 Relation 推导而来。
    JoinCondition *JoinCondition `json:"join_condition"`

    // Predicates 是本步骤节点上的过滤条件（traverse.where）。
    Predicates []*Predicate `json:"predicates"`

    // ScopeIndex 指向本步骤所属的 ExistentialScope 在 plan.ExistentialScopes 中的索引。
    // -1 表示本步骤不在任何 existential scope 内（即 materialized）。
    ScopeIndex int `json:"scope_index"`

    // IsFanOut 标记本步遍历是否为 one_to_many 关系。
    IsFanOut bool `json:"is_fan_out"`
}
```

### 4.5 RequireType

```go
// RequireType 决定遍历步骤对父节点的影响方式。
type RequireType int

const (
    // RequireAlways 表示必须存在，对应 INNER JOIN。
    RequireAlways RequireType = iota

    // RequireOptional 表示可存在，对应 LEFT JOIN。
    RequireOptional

    // RequireExists 表示存在性检验，对应 SEMI JOIN (EXISTS)。
    RequireExists

    // RequireNone 表示不存在性检验，对应 ANTI JOIN (NOT EXISTS)。
    RequireNone
)

func (r RequireType) String() string {
    switch r {
    case RequireAlways:
        return "always"
    case RequireOptional:
        return "optional"
    case RequireExists:
        return "exists"
    case RequireNone:
        return "none"
    default:
        return "unknown"
    }
}

// ParseRequireType 将 DSL 字符串转为 RequireType。
func ParseRequireType(s string) (RequireType, error) {
    switch s {
    case "always":
        return RequireAlways, nil
    case "optional":
        return RequireOptional, nil
    case "exists":
        return RequireExists, nil
    case "none":
        return RequireNone, nil
    default:
        return 0, fmt.Errorf("invalid require type: %s", s)
    }
}
```

### 4.6 JoinCondition

```go
// JoinCondition 描述两个 alias 之间的 JOIN 条件。
// 由 RelationSchema 推导，而非独立定义。
type JoinCondition struct {
    // LeftAlias 是 JOIN 条件左侧的 alias。
    LeftAlias string `json:"left_alias"`

    // LeftField 是左侧的关联字段。
    LeftField string `json:"left_field"`

    // RightAlias 是 JOIN 条件右侧的 alias。
    RightAlias string `json:"right_alias"`

    // RightField 是右侧的关联字段。
    RightField string `json:"right_field"`
}
```

推导规则：

```text
Relation.FromTable == FromAlias.Table 时：
    LeftAlias  = FromAlias,  LeftField  = Relation.FromField
    RightAlias = ToAlias,    RightField = Relation.ToField

Relation.FromTable == ToAlias.Table 时（反向引用）：
    LeftAlias  = ToAlias,    LeftField  = Relation.ToField
    RightAlias = FromAlias,  RightField = Relation.FromField
```

> V1 中 traverse 总是从 Relation 的 from_table 侧跳转到 to_table 侧，
> 因此 JoinCondition 始终为：`FromAlias.FromField = ToAlias.ToField`。

### 4.7 ExistentialScope

```go
// ExistentialScope 定义一个 EXISTS / NOT EXISTS 子查询边界。
type ExistentialScope struct {
    // Type 标注子查询类型。
    Type ScopeType `json:"type"` // ScopeExists 或 ScopeNotExists

    // BoundaryAlias 是触发此 scope 的 alias（require=exists/none 的那一步）。
    BoundaryAlias string `json:"boundary_alias"`

    // ContainedAliases 是落在此 scope 内的所有 alias。
    // V1 中恰好包含 1 个元素（BoundaryAlias 自身），因为 existential alias 不可继续遍历。
    // V2 扩展：允许从 existential alias 继续遍历，此列表将包含多个 alias。
    ContainedAliases []string `json:"contained_aliases"`

    // Correlation 描述此子查询与父作用域的关联条件。
    // 即 EXISTS / NOT EXISTS 子查询中的 WHERE correlated_field = parent.field
    Correlation *CorrelationRef `json:"correlation"`
}
```

### 4.8 CorrelationRef

```go
// CorrelationRef 描述子查询与父作用域的关联引用。
type CorrelationRef struct {
    // ParentAlias 是父作用域中的 alias。
    ParentAlias string `json:"parent_alias"`

    // ParentField 是父 alias 上用于关联的字段。
    ParentField string `json:"parent_field"`

    // ChildAlias 是子查询中的 alias。
    ChildAlias string `json:"child_alias"`

    // ChildField 是子 alias 上用于关联的字段。
    ChildField string `json:"child_field"`
}
```

### 4.9 Predicate

```go
// Predicate 是 IR 中的谓词表示，从 WherePredicate 转换而来。
type Predicate struct {
    // Alias 标注此谓词所属的 alias。
    Alias string `json:"alias"`

    // Field 是目标字段名。
    Field string `json:"field"`

    // Op 是操作符。
    Op string `json:"op"`

    // Value 是谓词值。
    Value any `json:"value"`
}
```

### 4.10 RelationSchema

```go
// RelationSchema 是全局注册的边定义。
// 在 TraversalPlan 中内嵌副本，使 IR 自包含。
type RelationSchema struct {
    Name        string `json:"name"`
    FromTable   string `json:"from_table"`
    FromField   string `json:"from_field"`
    ToTable     string `json:"to_table"`
    ToField     string `json:"to_field"`
    Cardinality string `json:"cardinality"` // "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many"
}
```

---

## 5. Planner 编译流程

```text
┌─────────────────────────────────────────┐
│  Phase 1: Match Resolution              │
│  解析 match 子句，创建 root AliasBinding │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Phase 2: Traverse Step Processing      │
│  逐步处理 traverse，校验 + 绑定 + 构建   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Phase 3: Existential Scope Construction│
│  从 Steps 构建 ExistentialScope 列表     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Phase 4: Cardinality Analysis          │
│  计算 HasFanOut 和 Step.IsFanOut         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         TraversalPlan (IR)
```

### 5.1 Phase 1: Match Resolution

```
输入：query.Match
输出：root AliasBinding + RootPredicates

步骤：
1. 校验 match.Type 非空
2. 校验 match.Alias 非空
3. 创建 AliasBinding:
   - Alias  = match.Alias
   - Table  = match.Type
   - ParentAlias  = ""
   - RelationName = ""
   - ScopeType    = ScopeMaterialize
4. 转换 match.Where → RootPredicates（附带 Alias 标注）
5. 将 AliasBinding 加入 aliasBindings map
```

### 5.2 Phase 2: Traverse Step Processing

对 `query.Traverse` 中的每个元素，按顺序处理：

```
输入：query.Traverse[i]
前置状态：aliasBindings 已包含前面所有步骤产生的 alias

步骤：
1. 校验 From alias 存在
   - 遍历 aliasBindings，确认 fromAlias 已定义
   - 否则返回错误：ErrUndefinedAlias

2. 查找 Relation
   - 在 RelationRegistry 中查找 relation 名称
   - 不存在则返回错误：ErrUnknownRelation

3. 校验 From 表匹配
   - 获取 fromAlias 对应的 AliasBinding.Table
   - 比对 Relation.FromTable 是否一致
   - 不一致则返回错误：ErrRelationTableMismatch

4. 校验 To alias 唯一
   - 遍历 aliasBindings，确认 toAlias 未被使用
   - 已存在则返回错误：ErrDuplicateAlias

5. 解析 RequireType
   - 调用 ParseRequireType，默认值为 "always"
   - 无效值返回错误：ErrInvalidRequire

6. V1 约束校验：Existential Leaf
   - 如果 fromAlias 的 ScopeType 不是 ScopeMaterialize
   - 则返回错误：ErrTraverseFromExistential
   - （V1 禁止从 existential alias 继续遍历）

7. 确定 ScopeType
   - require=always   → ScopeMaterialize
   - require=optional  → ScopeMaterialize
   - require=exists    → ScopeExists
   - require=none      → ScopeNotExists

8. 创建 AliasBinding
   - Alias       = toAlias
   - Table       = Relation.ToTable
   - ParentAlias = fromAlias
   - RelationName= Relation.Name
   - ScopeType   = 由步骤 7 确定

9. 创建 TraversalStep
   - FromAlias    = fromAlias
   - ToAlias      = toAlias
   - Require      = 解析后的 RequireType
   - Relation     = Relation 副本（内嵌）
   - JoinCondition= 由 Relation 推导
   - Predicates   = 转换后的谓词列表
   - ScopeIndex   = -1（Phase 3 填充）
   - IsFanOut     = false（Phase 4 填充）

10. 将 AliasBinding 加入 aliasBindings map
11. 将 TraversalStep 加入 steps 列表
```

### 5.3 Phase 3: Existential Scope Construction

遍历 Steps，为每个 existential step 构建 ExistentialScope：

```
输入：plan.Steps
输出：plan.ExistentialScopes + 更新 step.ScopeIndex

步骤：
1. 初始化 scopeIndex = 0

2. 对每个 step：
   a. 如果 step.Require == RequireExists 或 RequireNone：
      - 构建 ExistentialScope：
        Type            = ScopeExists 或 ScopeNotExists
        BoundaryAlias   = step.ToAlias
        ContainedAliases= [step.ToAlias]    // V1: 恰好 1 个
        Correlation     = {
            ParentAlias = step.FromAlias
            ParentField = step.Relation.FromField
            ChildAlias  = step.ToAlias
            ChildField  = step.Relation.ToField
        }
      - 加入 ExistentialScopes 列表
      - step.ScopeIndex = scopeIndex
      - scopeIndex++
   b. 否则：
      - step.ScopeIndex = -1（不在任何 existential scope 内）
```

#### V2 扩展：嵌套 Existential Scope

V2 允许从 existential alias 继续遍历。例如：

```text
rel --always--> m --exists--> od --always--> od_detail
```

此时 `od` 和 `od_detail` 都在同一个 EXISTS scope 内。

扩展算法：

```
维护 currentScope *ExistentialScope

对每个 step：
  a. 如果 step.FromAlias 在某个 existing scope 内：
     - currentScope = 该 scope
     - 将 step.ToAlias 加入 currentScope.ContainedAliases
     - step.ScopeIndex = currentScope 的索引
     - step 的 ScopeType 继承 currentScope.Type
  b. 否则如果 step 自身是 existential：
     - 创建新 scope（同 V1 逻辑）
     - currentScope = 新 scope
  c. 否则：
     - step.ScopeIndex = -1
     - currentScope = nil
```

### 5.4 Phase 4: Cardinality Analysis

```
输入：plan.Steps
输出：plan.HasFanOut + 更新 step.IsFanOut

步骤：
1. plan.HasFanOut = false

2. 对每个 step：
   a. 判断 step.Relation.Cardinality 是否为 "one_to_many" 或 "many_to_many"
   b. 如果是，且 step.ScopeType == ScopeMaterialize：
      - step.IsFanOut = true
      - plan.HasFanOut = true
   c. 否则：
      - step.IsFanOut = false

注意：
- Existential scope 内的 one_to_many 不影响 HasFanOut
  因为 EXISTS / NOT EXISTS 不展开行，不会导致 cardinality 膨胀
- HasFanOut 仅关注物化路径上的 fan-out
```

### 5.5 Plan ID 生成

```go
func generatePlanID(query *GraphTraversalQuery) string {
    // 只取 match + traverse 部分，排除 return
    canonical, _ := json.Marshal(map[string]any{
        "match":    query.Match,
        "traverse": query.Traverse,
    })
    hash := sha256.Sum256(canonical)
    return hex.EncodeToString(hash[:])
}
```

---

## 6. 校验规则与错误定义

### 6.1 校验规则汇总

| 编号 | 规则 | 阶段 | 错误码 |
|------|------|------|--------|
| V1 | match.type 非空 | Phase 1 | ErrEmptyMatchType |
| V2 | match.alias 非空 | Phase 1 | ErrEmptyMatchAlias |
| V3 | traverse[].from 引用已定义的 alias | Phase 2 | ErrUndefinedAlias |
| V4 | traverse[].relation 在 Registry 中存在 | Phase 2 | ErrUnknownRelation |
| V5 | from alias 的表与 relation.from_table 匹配 | Phase 2 | ErrRelationTableMismatch |
| V6 | traverse[].alias 全局唯一 | Phase 2 | ErrDuplicateAlias |
| V7 | require 值合法 | Phase 2 | ErrInvalidRequire |
| V8 | V1：不可从 existential alias 继续遍历 | Phase 2 | ErrTraverseFromExistential |

### 6.2 错误类型

```go
var (
    ErrEmptyMatchType         = errors.New("match.type must not be empty")
    ErrEmptyMatchAlias        = errors.New("match.alias must not be empty")
    ErrUndefinedAlias         = errors.New("traverse.from references undefined alias")
    ErrUnknownRelation        = errors.New("traverse.relation not found in registry")
    ErrRelationTableMismatch  = errors.New("traverse.from alias table does not match relation.from_table")
    ErrDuplicateAlias         = errors.New("traverse.alias is already defined")
    ErrInvalidRequire         = errors.New("traverse.require must be one of: always, optional, exists, none")
    ErrTraverseFromExistential = errors.New("V1: cannot traverse from an existential alias (exists/none)")
)
```

### 6.3 错误上下文增强

每个错误应携带上下文信息，便于调试：

```go
type PlanError struct {
    Code    string // 错误码
    Message string // 错误描述
    Step    int    // 出错的 traverse 步骤索引（-1 表示 match 阶段）
    Alias   string // 相关 alias
    Detail  string // 补充信息
}

func (e *PlanError) Error() string {
    if e.Step >= 0 {
        return fmt.Sprintf("[%s] step=%d alias=%s: %s", e.Code, e.Step, e.Alias, e.Message)
    }
    return fmt.Sprintf("[%s] alias=%s: %s", e.Code, e.Alias, e.Message)
}
```

---

## 7. 编译函数签名

### 7.1 CompilePlan

```go
// CompilePlan 将 DSL 的 match + traverse 编译为 TraversalPlan IR。
// 这是 Graph Traversal Planner 的唯一入口函数。
func CompilePlan(
    query *GraphTraversalQuery,
    registry map[string]*RelationSchema,
) (*TraversalPlan, error)
```

参数说明：

| 参数 | 说明 |
|------|------|
| `query` | DSL 解析后的输入，包含 match 和 traverse |
| `registry` | 全局 Relation Schema Registry |

返回值：

| 返回值 | 说明 |
|--------|------|
| `*TraversalPlan` | 编译成功时的 IR 输出 |
| `error` | 校验失败时返回 `*PlanError` |

---

## 8. 缓存设计

### 8.1 缓存策略

```text
缓存对象：TraversalPlan（IR），不是 SQL String
缓存键：plan.ID = SHA256(match + traverse JSON)
存储：V1 使用进程内 sync.Map；V2 扩展 Redis
```

为什么缓存 IR 而非 SQL：

- 同一个 Traversal 可能被 query / aggregate / count / topk 共用
- SQL 因 Projection 不同而不同，但 Traversal 语义不变
- 缓存 IR 一次编译、多次投影

### 8.2 V1 内存缓存

```go
type PlanCache struct {
    store sync.Map // key: planID, value: *TraversalPlan
}

func (c *PlanCache) Get(planID string) (*TraversalPlan, bool)
func (c *PlanCache) Put(plan *TraversalPlan)
```

### 8.3 V2 Redis 缓存扩展点

```go
type PlanCache interface {
    Get(planID string) (*TraversalPlan, bool)
    Put(plan *TraversalPlan)
}

type RedisPlanCache struct {
    client *redis.Client
    ttl    time.Duration // 默认 30min
}
```

V2 实现：TraversalPlan 通过 JSON 序列化存入 Redis，设置 TTL。

### 8.4 plan_token 流程

```text
1. Agent 调用 POST /graph/plan
   → CompilePlan(match + traverse)
   → 生成 TraversalPlan
   → 存入 PlanCache，返回 plan.ID 作为 plan_token

2. Agent 调用 POST /graph/query?plan_token=xxx
   → 从 PlanCache 取出 TraversalPlan
   → Projection Planner 消费 IR，生成 SQL

3. Agent 调用 POST /graph/aggregate?plan_token=xxx
   → 从 PlanCache 取出同一个 TraversalPlan
   → Metric Planner 消费 IR，生成聚合 SQL
```

---

## 9. 完整示例演练

### 9.1 输入 DSL

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
  ]
}
```

### 9.2 Phase 1: Match Resolution

```text
RootAlias     = "rel"
RootTable     = "AgentRel"
RootPredicates = [
    {Alias: "rel", Field: "apply", Op: "eq", Value: 1}
]

AliasBindings["rel"] = {
    Alias:       "rel",
    Table:       "AgentRel",
    ParentAlias: "",
    RelationName:"",
    ScopeType:   ScopeMaterialize,
}
```

### 9.3 Phase 2: Traverse Step Processing

**Step 0**: `rel --for_merch--> m (always)`

```text
校验：
  ✓ from "rel" 存在于 aliasBindings
  ✓ relation "for_merch" 存在于 registry
  ✓ "rel" 的 Table("AgentRel") == Relation.FromTable("agent_rel")  ✓
  ✓ alias "m" 未被使用
  ✓ require "always" 合法
  ✓ "rel" 的 ScopeType == ScopeMaterialize，允许继续遍历

AliasBindings["m"] = {
    Alias:       "m",
    Table:       "merch",
    ParentAlias: "rel",
    RelationName:"for_merch",
    ScopeType:   ScopeMaterialize,
}

Steps[0] = {
    FromAlias: "rel",
    ToAlias:   "m",
    Require:   RequireAlways,
    Relation:  {Name:"for_merch", FromTable:"agent_rel", FromField:"merch_id",
                ToTable:"merch", ToField:"id", Cardinality:"many_to_one"},
    JoinCondition: {LeftAlias:"rel", LeftField:"merch_id",
                    RightAlias:"m", RightField:"id"},
    Predicates: [],
    ScopeIndex: -1,  // Phase 3 填充
    IsFanOut:   false, // Phase 4 填充
}
```

**Step 1**: `m --has_order_daily--> od (none)`

```text
校验：
  ✓ from "m" 存在于 aliasBindings
  ✓ relation "has_order_daily" 存在于 registry
  ✓ "m" 的 Table("merch") == Relation.FromTable("merch")  ✓
  ✓ alias "od" 未被使用
  ✓ require "none" 合法
  ✓ "m" 的 ScopeType == ScopeMaterialize，允许继续遍历

AliasBindings["od"] = {
    Alias:       "od",
    Table:       "order_daily",
    ParentAlias: "m",
    RelationName:"has_order_daily",
    ScopeType:   ScopeNotExists,
}

Steps[1] = {
    FromAlias: "m",
    ToAlias:   "od",
    Require:   RequireNone,
    Relation:  {Name:"has_order_daily", FromTable:"merch", FromField:"id",
                ToTable:"order_daily", ToField:"merch_id", Cardinality:"one_to_many"},
    JoinCondition: {LeftAlias:"m", LeftField:"id",
                    RightAlias:"od", RightField:"merch_id"},
    Predicates: [
        {Alias:"od", Field:"report_date", Op:"gte", Value:"2026-05-01"},
        {Alias:"od", Field:"report_date", Op:"lte", Value:"2026-05-31"},
    ],
    ScopeIndex: -1,  // Phase 3 填充
    IsFanOut:   false, // Phase 4 填充
}
```

### 9.4 Phase 3: Existential Scope Construction

```text
Step 0: Require == RequireAlways → ScopeIndex = -1

Step 1: Require == RequireNone → 构建 ExistentialScope

ExistentialScopes[0] = {
    Type:             ScopeNotExists,
    BoundaryAlias:    "od",
    ContainedAliases: ["od"],
    Correlation: {
        ParentAlias: "m",
        ParentField: "id",
        ChildAlias:  "od",
        ChildField:  "merch_id",
    },
}

Steps[1].ScopeIndex = 0
```

### 9.5 Phase 4: Cardinality Analysis

```text
Step 0: Cardinality="many_to_one", ScopeType=ScopeMaterialize → IsFanOut=false
Step 1: Cardinality="one_to_many", ScopeType=ScopeNotExists   → IsFanOut=false
        （existential scope 内的 one_to_many 不计为 fan-out）

plan.HasFanOut = false
```

> 此例中 `has_order_daily` 虽为 `one_to_many`，但它在 NOT EXISTS scope 内，
> 不展开行，因此 HasFanOut 仍为 false，不需要 Root Pagination First。

### 9.6 最终 TraversalPlan

```json
{
  "id": "a3f7c2...（SHA256 哈希）",
  "root_alias": "rel",
  "root_table": "AgentRel",
  "root_predicates": [
    { "alias": "rel", "field": "apply", "op": "eq", "value": 1 }
  ],
  "alias_bindings": {
    "rel": {
      "alias": "rel", "table": "AgentRel",
      "parent_alias": "", "relation_name": "", "scope_type": 0
    },
    "m": {
      "alias": "m", "table": "merch",
      "parent_alias": "rel", "relation_name": "for_merch", "scope_type": 0
    },
    "od": {
      "alias": "od", "table": "order_daily",
      "parent_alias": "m", "relation_name": "has_order_daily", "scope_type": 2
    }
  },
  "steps": [
    {
      "from_alias": "rel", "to_alias": "m", "require": 0,
      "relation": {
        "name": "for_merch", "from_table": "agent_rel", "from_field": "merch_id",
        "to_table": "merch", "to_field": "id", "cardinality": "many_to_one"
      },
      "join_condition": {
        "left_alias": "rel", "left_field": "merch_id",
        "right_alias": "m", "right_field": "id"
      },
      "predicates": [],
      "scope_index": -1,
      "is_fan_out": false
    },
    {
      "from_alias": "m", "to_alias": "od", "require": 3,
      "relation": {
        "name": "has_order_daily", "from_table": "merch", "from_field": "id",
        "to_table": "order_daily", "to_field": "merch_id", "cardinality": "one_to_many"
      },
      "join_condition": {
        "left_alias": "m", "left_field": "id",
        "right_alias": "od", "right_field": "merch_id"
      },
      "predicates": [
        { "alias": "od", "field": "report_date", "op": "gte", "value": "2026-05-01" },
        { "alias": "od", "field": "report_date", "op": "lte", "value": "2026-05-31" }
      ],
      "scope_index": 0,
      "is_fan_out": false
    }
  ],
  "existential_scopes": [
    {
      "type": 2,
      "boundary_alias": "od",
      "contained_aliases": ["od"],
      "correlation": {
        "parent_alias": "m", "parent_field": "id",
        "child_alias": "od", "child_field": "merch_id"
      }
    }
  ],
  "has_fan_out": false
}
```

---

## 10. 与下游 Planner 的接口契约

### 10.1 Projection Planner 消费方式

```go
// Projection Planner 从 TraversalPlan 读取：
plan.RootAlias          // 确定 FROM 子句的根表
plan.RootTable          // 根表名
plan.RootPredicates     // WHERE 中根表的谓词
plan.Steps              // 遍历步骤（生成 JOIN / EXISTS / NOT EXISTS）
plan.HasFanOut          // 决定是否采用 Root Pagination First
plan.AliasBindings      // 确认 alias 的表和 scope 类型
plan.ExistentialScopes  // 构建 EXISTS / NOT EXISTS 子查询
```

SQL 生成逻辑（Projection Planner / SQL Compiler 负责）：

```text
FOR each step:
  IF step.ScopeIndex == -1:
    // Materialized step → JOIN
    IF step.Require == RequireAlways:  → INNER JOIN
    IF step.Require == RequireOptional: → LEFT JOIN
  ELSE:
    // Existential step → EXISTS / NOT EXISTS
    scope = plan.ExistentialScopes[step.ScopeIndex]
    IF scope.Type == ScopeExists:   → EXISTS (SELECT 1 FROM ...)
    IF scope.Type == ScopeNotExists: → NOT EXISTS (SELECT 1 FROM ...)
```

### 10.2 Metric Planner 消费方式

与 Projection Planner 相同的 TraversalPlan，区别仅在 SELECT 子句：

- Projection：`SELECT alias.field, ...`
- Metric：`SELECT SUM(alias.field), ... GROUP BY alias.field, ...`

Traversal 部分完全复用，无需重新编译。

### 10.3 关键约束传递

| 约束 | 来源 | 消费方 | 用途 |
|------|------|--------|------|
| `HasFanOut` | TraversalPlan | SQL Compiler | 决定分页策略 |
| `ScopeType` | AliasBinding | SQL Compiler | 校验 existential alias 不可出现在 SELECT 中 |
| `JoinCondition` | TraversalStep | SQL Compiler | 生成 ON 子句 |
| `Correlation` | ExistentialScope | SQL Compiler | 生成 EXISTS/NOT EXISTS 中的关联 WHERE |
| `IsFanOut` | TraversalStep | SQL Compiler | 聚合安全分析 |

---

## 11. 存在 Fan-Out 时的示例

当 Traversal 中存在物化的 one_to_many 关系时，HasFanOut=true。

### 11.1 DSL

```json
{
  "match": { "type": "AgentRel", "alias": "rel" },
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
      "require": "always"
    }
  ]
}
```

### 11.2 Cardinality 分析结果

```text
Step 0: for_merch (many_to_one, materialized) → IsFanOut=false
Step 1: has_order_daily (one_to_many, materialized) → IsFanOut=true

plan.HasFanOut = true
```

### 11.3 对下游的影响

SQL Compiler 必须采用 **Root Pagination First** 策略：

```sql
SELECT ...
FROM (
    SELECT rel.id
    FROM agent_rel rel
    LIMIT 200 OFFSET 0
) roots
INNER JOIN agent_rel rel ON rel.id = roots.id
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON od.merch_id = m.id
```

而非直接在 JOIN 结果上 LIMIT：

```sql
-- 错误！1:N 展开后 LIMIT 200 得到的根节点数 < 200
SELECT ...
FROM agent_rel rel
INNER JOIN merch m ON ...
INNER JOIN order_daily od ON ...
LIMIT 200
```

---

## 12. V1 / V2 边界

| 特性 | V1 | V2 |
|------|----|----|
| 从 existential alias 继续遍历 | 禁止 | 允许 |
| 嵌套 existential scope | 不支持 | 支持 |
| OR 谓词组合 | 不支持（仅 AND） | 支持 |
| Plan 缓存 | 进程内 sync.Map | Redis + TTL |
| many_to_many relation | 不支持 | 支持 |
| Predicate 字段校验 | 不校验（信任 DSL） | 可选校验（需要 Table Schema Registry） |
