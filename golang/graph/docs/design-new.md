# Semantic Graph Runtime 设计改进方案

## 一、分析结论

### 1.1 是否存在不可逾越的障碍？

**不存在理论上不可逾越的障碍。** Graph Traversal → SQL 的映射本质是关系代数编译，当前设计覆盖了关系完备性中绝大多数业务场景。

但存在 **5 个语义硬限制**，它们不是"不可逾越"的，但解决成本差异巨大：

| # | 限制 | 严重程度 | 解决难度 | 建议 |
|---|------|---------|---------|------|
| 1 | 线性管道无法表达 DAG/菱形遍历 | **高** | 中 | V1.5 引入 |
| 2 | 跨 alias OR 谓词不可表达 | 中 | 中 | V2 引入 |
| 3 | 递归遍历（Closure）不可表达 | 低 | 高 | V3+ |
| 4 | 环路检测缺失 | **高** | 低 | **V1 立即修复** |
| 5 | 聚合存在性不可表达 | 中 | 中 | V2 引入 |

---

## 二、当前设计的核心优点（必须保留）

1. **Traversal / Projection 解耦** —— 最核心的设计洞察，避免 GraphQL 嵌套爆炸
2. **require 四态语义** —— always/optional/exists/none 覆盖绝大多数 JOIN 语义
3. **Root Pagination First** —— 正确解决 1:N 展开后分页失真
4. **IR 缓存而非 SQL 缓存** —— 同一 Traversal 驱动多种投影
5. **Existential Scope 边界** —— EXISTS/NOT EXISTS 从 JOIN 中分离，语义清晰

---

## 三、改进方案

### 3.1 【V1 立即修复】环路检测

**问题**：如果 Relation Registry 中存在 `A → B → A` 的环路，当前 Planner 不检测，可能导致无限遍历或 SQL 中的循环 JOIN。

**方案**：在 `CompilePlan` Phase 2（Traverse Step Processing）中增加环路检测。

```go
// 在 Phase 2 处理每个 traverse step 时，检查从 root 到当前 step 的路径
// 是否已经访问过目标表（同一表在同一 scope chain 中出现两次）
func detectCycle(aliasChain []string, targetTable string) error {
    // 构建从 root 到当前 from alias 的表链
    // 如果 targetTable 已在链中出现，且不在不同的 existential scope 内，则报错
    // existential scope 内的重复访问是允许的（因为不展开行）
}
```

**IR 扩展**：`TraversalStep` 增加 `DepthInTable int` 字段，记录同一表在路径中的第几次出现（0=首次，1=第二次...）。SQL Compiler 可据此生成唯一 alias。

**错误码**：`ErrCyclicTraversal`

---

### 3.2 【V1.5】分支遍历（DAG 支持）

**问题**：当前 DSL 是线性管道 `traverse[0] → traverse[1] → ...`，无法从同一节点沿两条 relation 同时展开。

**业务场景**：

```
rel ──for_merch──> m ──has_order──> od    （订单）
                  └──has_settle──> st    （结算）
```

"找出有订单但无结算的商户对应的 agent_rel"——需要从 `m` 同时展开两条边。

**方案：允许 traverse 数组中多个 step 的 `from` 指向同一 alias**

当前校验规则不禁止这一点——`from` 只是引用已有 alias，不需要唯一。**关键变化在于 Existential Scope 的构建逻辑**：

```json
{
  "traverse": [
    { "from": "rel", "relation": "for_merch", "alias": "m", "require": "always" },
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "always" },
    { "from": "m", "relation": "has_settle", "alias": "st", "require": "none" }
  ]
}
```

**编译结果**：

```sql
SELECT rel.agent_no, rel.obj_no
FROM agent_rel rel
INNER JOIN merch m ON rel.merch_id = m.id
INNER JOIN order_daily od ON od.merch_id = m.id
WHERE NOT EXISTS (
    SELECT 1 FROM settle st
    WHERE st.merch_id = m.id
)
```

**Planner 变化**：

- Phase 2 不变——`from` 引用已有 alias 本来就允许
- Phase 3（Existential Scope Construction）不变——每个 existential step 独立构建 scope
- Phase 4（Cardinality Analysis）不变——每个 step 独立判断 IsFanOut
- **关键变化**：`AliasBinding.ParentAlias` 不再唯一——同一 parent 可以有多个 child

**SQL Compiler 变化**：

- JOIN 生成逻辑不变——遍历 Steps，每个 materialized step 生成一个 JOIN
- EXISTS/NOT EXISTS 生成逻辑不变——每个 scope 独立生成子查询

**结论：分支遍历的 DSL 语法和编译逻辑几乎不需要改动，因为当前设计天然支持！** 唯一需要修改的是文档中"V1 语义限制"的标注，以及确保测试覆盖。

---

### 3.3 【V2】跨 alias OR 谓词

**问题**：当前 `where` 数组仅 AND，跨 alias OR 不可表达。

**方案：引入嵌套布尔表达式树**

```json
{
  "where": {
    "logic": "or",
    "conditions": [
      { "alias": "rel", "field": "agent_no", "op": "eq", "value": "A001" },
      {
        "logic": "and",
        "conditions": [
          { "alias": "m", "field": "name", "op": "like", "value": "%测试%" },
          { "alias": "m", "field": "status", "op": "eq", "value": 1 }
        ]
      }
    ]
  }
}
```

**IR 变化**：`Predicate` 扩展为 `PredicateNode`（递归结构）：

```go
type PredicateNode struct {
    // 叶子节点
    Alias *string `json:"alias,omitempty"`
    Field *string `json:"field,omitempty"`
    Op    *string `json:"op,omitempty"`
    Value any     `json:"value,omitempty"`

    // 内部节点
    Logic      *string          `json:"logic,omitempty"`       // "and" | "or"
    Conditions []*PredicateNode `json:"conditions,omitempty"`
}

func (n *PredicateNode) IsLeaf() bool {
    return n.Logic == nil
}
```

**SQL Compiler 变化**：WHERE 子句生成从扁平列表改为递归遍历 `PredicateNode` 树，用括号包裹 OR 分组。

**向后兼容**：V1 的 `where: [{...}, {...}]` 数组格式等价于 `{logic: "and", conditions: [...]}`，Planner 在解析时自动转换。

---

### 3.4 【V2】聚合存在性

**问题**：`require: exists` 只支持行级存在性，不支持"聚合满足条件才存在"。

**业务场景**："找出5月订单总额 > 10000 的商户"

**方案：引入 `require: agg_exists` + 聚合条件**

```json
{
  "from": "m",
  "relation": "has_order_daily",
  "alias": "od",
  "require": "agg_exists",
  "agg_filter": {
    "func": "sum",
    "field": "trans_amt",
    "op": "gt",
    "value": 10000
  }
}
```

**编译结果**：

```sql
WHERE EXISTS (
    SELECT 1
    FROM order_daily od
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
      AND od.report_date <= ?
    HAVING SUM(od.trans_amt) > ?
)
```

**ScopeType 扩展**：增加 `ScopeAggExists`

**关键约束**：`agg_exists` 产生的 alias 同样不可出现在 `return.select` 中。

---

### 3.5 【V1.5】Existential Scope 内继续遍历（取消 Existential Leaf 限制）

**问题**：V1 禁止从 `require: exists/none` 的 alias 继续 traverse，导致全称量必须手动构造双重否定。

**方案：允许 existential alias 作为 `from`，后续 step 自动归入同一 Existential Scope**

```json
{
  "traverse": [
    { "from": "m", "relation": "has_order_daily", "alias": "od", "require": "none" },
    { "from": "od", "relation": "has_detail", "alias": "d", "require": "always" }
  ]
}
```

**语义**：商户 m 不存在这样的日订单 od——od 有明细 d。

**编译结果**：

```sql
AND NOT EXISTS (
    SELECT 1
    FROM order_daily od
    INNER JOIN order_detail d ON d.order_id = od.id
    WHERE od.merch_id = m.id
)
```

**Planner 变化（Phase 3）**：

```
当 step.FromAlias 的 ScopeType 不是 ScopeMaterialize 时：
  1. 找到 fromAlias 所属的 ExistentialScope
  2. 将 step.ToAlias 加入该 scope 的 ContainedAliases
  3. step.ScopeIndex = 该 scope 的索引
  4. step 的 ScopeType 继承 scope.Type
```

**SQL Compiler 变化**：EXISTS/NOT EXISTS 子查询内部，除了 BoundaryAlias 的表，还需要 JOIN 同 scope 内其他 step 的表。

---

### 3.6 【V2】全称量（ALL）语义

**方案：引入 `require: all` + 条件谓词**

```json
{
  "from": "m",
  "relation": "has_order_daily",
  "alias": "od",
  "require": "all",
  "where": [
    { "field": "status", "op": "eq", "value": "paid" }
  ]
}
```

**Planner 自动编译为双重否定**：

```
require: all + where: [status = 'paid']
  ↓ 自动转换
require: none + where: [status != 'paid']
```

Agent 无需手动构造双重否定。

**ScopeType 扩展**：增加 `ScopeAll`，Planner 在编译时自动转换为 `ScopeNotExists` + 反转谓词。

---

## 四、改进后的 DSL 完整规范

### 4.1 traverse step 完整结构

```json
{
  "from": "<来源别名>",
  "relation": "<关系名>",
  "alias": "<新别名>",
  "require": "<约束类型>",
  "where": [ <谓词列表> ],
  "agg_filter": { <聚合条件，仅 agg_exists 时有效> }
}
```

### 4.2 require 完整语义

| require 值 | SQL 对应 | 语义 | V1 | V1.5 | V2 |
|------------|----------|------|----|------|-----|
| `always` | INNER JOIN | 必须存在 | ✅ | ✅ | ✅ |
| `optional` | LEFT JOIN | 可存在 | ✅ | ✅ | ✅ |
| `exists` | SEMI JOIN (EXISTS) | 存在性检验 | ✅ | ✅ | ✅ |
| `none` | ANTI JOIN (NOT EXISTS) | 不存在性检验 | ✅ | ✅ | ✅ |
| `agg_exists` | EXISTS ... HAVING | 聚合存在性 | ❌ | ❌ | ✅ |
| `all` | NOT EXISTS 反例 | 全称量 | ❌ | ❌ | ✅ |

### 4.3 where 完整结构

**V1**：扁平数组（AND 连接）

```json
"where": [
  { "field": "status", "op": "eq", "value": 1 }
]
```

**V2**：嵌套布尔表达式树

```json
"where": {
  "logic": "and",
  "conditions": [
    { "alias": "rel", "field": "status", "op": "eq", "value": 1 },
    {
      "logic": "or",
      "conditions": [
        { "alias": "m", "field": "type", "op": "eq", "value": "A" },
        { "alias": "m", "field": "type", "op": "eq", "value": "B" }
      ]
    }
  ]
}
```

---

## 五、改进后的 IR 变化汇总

### 5.1 TraversalPlan

```go
type TraversalPlan struct {
    ID              string
    RootAlias       string
    RootTable       string
    RootPrimaryKey  string                      // V1 已有
    RootPredicates []*PredicateNode             // V2: Predicate → PredicateNode
    AliasBindings   map[string]*AliasBinding
    Steps           []*TraversalStep
    ExistentialScopes []*ExistentialScope
    HasFanOut       bool
}
```

### 5.2 TraversalStep

```go
type TraversalStep struct {
    FromAlias    string
    ToAlias      string
    Require      RequireType
    Relation     *RelationSchema
    JoinCondition *JoinCondition
    Predicates   []*PredicateNode              // V2: Predicate → PredicateNode
    ScopeIndex   int
    IsFanOut     bool
    DepthInTable int                           // V1.5: 环路检测辅助
}
```

### 5.3 ExistentialScope

```go
type ExistentialScope struct {
    Type              ScopeType
    BoundaryAlias     string
    ContainedAliases  []string                   // V1.5: 可包含多个 alias
    Correlation       *CorrelationRef
    InnerSteps        []*TraversalStep           // V1.5: scope 内的 JOIN 步骤
    ParentScopeIndex  int                        // V2: 嵌套 scope
    Quantifier        string                     // V2: "exists" | "not_exists" | "all"
}
```

### 5.4 ScopeType 扩展

```go
const (
    ScopeMaterialize ScopeType = iota  // always / optional
    ScopeExists                        // exists
    ScopeNotExists                     // none
    ScopeAggExists                     // V2: agg_exists
    ScopeAll                           // V2: all (编译时转为 ScopeNotExists)
)
```

---

## 六、改进后的 SQL Compiler 变化汇总

### 6.1 EXISTS/NOT EXISTS 子查询内部 JOIN

**V1**：子查询内只有单表 + WHERE。

**V1.5**：子查询内可包含 JOIN（来自同一 ExistentialScope 的 InnerSteps）。

```sql
NOT EXISTS (
    SELECT 1
    FROM order_daily od
    INNER JOIN order_detail d ON d.order_id = od.id   -- scope 内的 JOIN
    WHERE od.merch_id = m.id
      AND od.report_date >= ?
)
```

### 6.2 WHERE 子句递归生成

**V1**：扁平 `AND pred1 AND pred2 ...`

**V2**：递归遍历 PredicateNode 树，OR 分组用括号包裹。

```sql
WHERE (rel.agent_no = ? OR (m.name LIKE ? AND m.status = ?))
```

### 6.3 HAVING 子句

**V2**：`agg_exists` 编译为 `EXISTS (... HAVING ...)`。

```sql
WHERE EXISTS (
    SELECT 1
    FROM order_daily od
    WHERE od.merch_id = m.id
    HAVING SUM(od.trans_amt) > ?
)
```

---

## 七、实施路线图

### Phase 1：V1 立即修复（零风险）

- [x] 环路检测（Planner Phase 2 增加校验）
- [x] 分支遍历文档标注修正（当前设计天然支持，仅需更新文档和测试）

### Phase 2：V1.5 语义扩展（低风险）

- [x] Existential Scope 内继续遍历（取消 Existential Leaf 限制）
- [x] ExistentialScope.InnerSteps 字段
- [x] SQL Compiler 支持 EXISTS/NOT EXISTS 子查询内部 JOIN

### Phase 3：V2 语义扩展（中风险）

- [ ] 嵌套布尔表达式树（OR 谓词）
- [ ] 聚合存在性（agg_exists + HAVING）
- [ ] 全称量（all → 自动双重否定）
- [ ] PredicateNode 递归结构

### Phase 4：V3+ 远期扩展（高风险）

- [ ] 递归遍历（递归 CTE）
- [ ] many_to_many relation
- [ ] SQL 方言适配（PostgreSQL）
- [ ] Redis Plan 缓存

---

## 八、关键设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 分支遍历实现方式 | A: 新语法 B: 复用现有 from 引用 | **B** | 当前 DSL 天然支持，无需新语法 |
| OR 谓词实现方式 | A: 扁平 + logic 字段 B: 嵌套布尔树 | **B** | 嵌套树表达力更强，且可向后兼容 |
| 全称量实现方式 | A: Agent 手动双重否定 B: Planner 自动转换 | **B** | 减少出错，Agent 无需理解双重否定 |
| 聚合存在性实现方式 | A: HAVING 子查询 B: CTE 预计算 | **A** | HAVING 更简洁，CTE 过度设计 |
| Existential Leaf 取消 | A: V1 B: V1.5 | **B** | V1 已有手动绕过，V1.5 正式支持 |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 分支遍历导致 JOIN 膨胀 | 性能 | Planner 增加 JOIN 数量上限校验（如最多 8 个 materialized JOIN） |
| OR 谓词导致 SQL 优化器失效 | 性能 | 文档标注：跨 alias OR 可能导致全表扫描，建议用 UNION 替代 |
| Existential Scope 内 JOIN 增加子查询复杂度 | 正确性 | 增加子查询内 JOIN 的集成测试，验证 alias 不冲突 |
| 聚合存在性 HAVING 语义 | 正确性 | HAVING 在空集上的行为需明确：`SUM(NULL set) = NULL`，`NULL > 10000` 为 FALSE |

---

## 十、总结

当前设计 **不存在不可逾越的理论障碍**。Graph Traversal → SQL 的映射在关系代数层面是完备的。

当前设计最核心的优势——**Traversal/Projection 解耦 + require 四态语义 + Root Pagination First**——应该严格保留。

最紧迫的改进是：

1. **V1 立即修复环路检测**（零成本，防止运行时崩溃）
2. **V1.5 取消 Existential Leaf 限制**（低成本，大幅提升表达力）
3. **文档修正：分支遍历已天然支持**（零成本，仅需更新文档）

最远期的扩展是递归遍历（递归 CTE），这需要根本性的架构变化，建议推迟到 V3+。
