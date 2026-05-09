# inference_rule


在 V6/V7 架构中，**`inference_rule`（推理规则）确实是事先定义好的**，它被视为系统的“代码资产”，遵循“**本体即代码（Ontology-as-code）**”的原则。

以下是针对你提供的“小明借书”场景，关于 `inference_rule` 的产生方式及定义示例的详细说明：

### 1. 推理规则是事先定义好的吗？
**是的。** 在 V6 设计中，规则（无论是推理规则、硬约束还是软准则）都不是 LLM 在运行时随意生成的，而是由业务专家预先编写并注册在系统中的。
*   **执行顺序**：在规则有向无环图（Rule DAG）中，推理规则会**优先于**硬约束和软准则执行。
*   **目的**：它的唯一职责是产生“**推导事实（Derived Facts）**”，并将结果写回事实库（FactStore），供后续的 R1、R2、R3 等评分规则使用。

### 2. 在该例子中，如何定义 `inference_rule`？

在你的例子中，R3 规则提到“如果有逾期未还的书”。在底层数据中，这可能涉及复杂的计算（例如对比借书日期和当前日期）。我们可以定义一个推理规则来简化这个逻辑。

#### 例子：定义“逾期严重性”推理规则
假设系统不仅想知道是否逾期，还想推导出一个语义化的“信用风险等级”。

**规则定义示例（伪代码）：**
```typescript
registerRule({
  id: 'calculate_reader_credit_status',
  kind: 'inference_rule', // 标注为推理规则
  appliesTo: ['Reader'],
  requiredFacts: [
    { property: 'overdueBooks', scope: 'entity' } // 需要已逾期的书籍列表
  ],
  evaluator(ctx) {
    const overdueBooks = ctx.facts.getValue(ctx.entityId, 'overdueBooks');
    
    // 执行推导逻辑：
    // 如果有书逾期超过 3 天，则标记为 "RESTRICTED"（受限）
    const isSerious = overdueBooks.some(book => book.overdueDays > 3);
    const status = isSerious ? 'RESTRICTED' : 'NORMAL';

    return {
      triggered: true,
      derivedFacts: [
        { property: 'creditStatus', value: status } // 产生推导事实
      ],
      explanation: `由于读者有书逾期超过3天，信用状态推导为：${status}`
    };
  }
})
```

### 3. 该推理规则如何在该场景下运行？

1.  **事实绑定**：系统首先发现小明有《老人与海》逾期 3 天，这是**原始事实**（Source: `graph_property`）。
2.  **触发推理**：由于 `calculate_reader_credit_status` 是预先定义好的，它检测到小明有逾期事实，立即执行。
3.  **产生推导事实**：它在 FactStore 中写入一条新记录：`Reader(小明).creditStatus = 'RESTRICTED'`，来源标注为 `derived`。
4.  **下游消费**：此时，你的 **R3（硬约束）** 就不需要再去计算日期了，它可以直接引用这个推导出来的语义事实：
    *   **R3 逻辑简化为**：`if (creditStatus === 'RESTRICTED') return triggered: true`。

### 总结
在你的场景中，`inference_rule` 扮演了“**数据预处理器**”的角色。它预先将原始的逾期天数推导为“信用受限”这一高阶结论。这样做的价值在于：**R3 规则的定义变得极其简单且可重用**，而复杂的计算逻辑被封装在了预先定义好的推理规则资产中。


---

## 一、规则类型：都是事先定义好的

所有规则类型都是**事先定义好的**，它们是业务知识的固化，不是 LLM 运行时生成的。这正符合 V6 的设计哲学：**本体即代码（ontology-as-code）**。

---

## 二、图书馆借书场景完整举例

### 场景设定

```text
小明想借《人工智能简史》

候选答案：
- ALLOW  (允许借阅)
- DENY   (拒绝借阅)
- HOLD   (暂时保留，需人工确认)
```

### 规则 DAG 执行流程图

```text
                ┌─────────────────────┐
                │  Raw Facts          │
                │  (原始事实)          │
                │  - borrowedCount=2  │
                │  - overdueBooks=1   │
                │  - bookAge=3        │
                └─────────────┬───────┘
                              │
                 ═════════════╧═════════════
                 第一阶段：inference_rule
                 ═════════════╤═════════════
                              │
                ┌─────────────▼───────┐
                │  Derived Facts      │
                │  (派生事实)          │
                │  - borrowingStatus  │
                │    = "restricted"   │
                │  (由 I1 产生)        │
                └─────────────┬───────┘
                              │
                 ═════════════╧═════════════
                 第二阶段：hard_constraint
                 ═════════════╤═════════════
                              │
         ┌────────────────────▼────────────────────┐
         │  Veto 结果                              │
         │  R2 触发 → veto ALLOW                   │
         │  R3 触发 → veto ALLOW (使用派生事实)     │
         │  → ALLOW 被否决                         │
         └────────────────────┬────────────────────┘
                              │
                 ═════════════╧═════════════
                 第三阶段：soft_criterion
                 ═════════════╤═════════════
                              │
         ┌────────────────────▼────────────────────┐
         │  MCDA 打分                              │
         │  S1 触发 → DENY 加分                    │
         │  S3 未触发                              │
         │  → 最终排序: DENY > HOLD > ALLOW(vetoed)│
         └────────────────────┬────────────────────┘
                              │
                 ═════════════╧═════════════
                 第四阶段：conflict_policy
                 ═════════════╤═════════════
                              │
         ┌────────────────────▼────────────────────┐
         │  冲突裁决                              │
         │  CP1: hard veto 存在 → soft 正面无效    │
         └────────────────────┬────────────────────┘
                              │
                 ═════════════╧═════════════
                 第五阶段：explanation_policy
                 ═════════════╤═════════════
                              │
         ┌────────────────────▼────────────────────┐
         │  输出格式化                             │
         │  EP1: DENY → 展示 veto 规则             │
         │  → 用户看到的最终 UI                    │
         └─────────────────────────────────────────┘
```

---

## 三、三种核心规则类型详解

### 1. `hard_constraint` — 硬约束，触发即否决候选

事先定义好，评估时检查事实，触发则直接 veto。

| ID | 规则 | veto 配置 |
|----|------|-----------|
| R1 | 每个读者最多只能借 3 本书 | `candidatesByLabel: ["ALLOW"]` |
| R2 | 新书（上架不到 7 天）不能外借 | `candidatesByLabel: ["ALLOW"]` |
| R3 | 有逾期未还的书就不能借新书 | `candidatesByLabel: ["ALLOW"]` |

```ts
const R1: Rule = {
  id: "max_borrow_limit",
  version: "1.0.0",
  kind: "hard_constraint",
  appliesTo: ["Reader"],
  requiredFacts: [{ property: "borrowedCount", scope: "entity" }],
  veto: { candidatesByLabel: ["ALLOW"] },
  direction: "risk_up",  // 触发 → 风险上升 → DENY 更可能

  evaluator: (ctx) => {
    const count = ctx.facts.get(ctx.entityId!, "borrowedCount")?.value ?? 0
    return {
      triggered: count >= 3,
      explanation: `已借 ${count} 本，达到上限`
    }
  },
  explanation: (result) => result.triggered
    ? `读者已借满 3 本，无法继续借阅`
    : `借阅数量未超限`
}
```

---

### 2. `inference_rule` — 推理规则，产生派生事实

事先定义好，执行时**不否决、不打分**，而是推导新事实供后续规则使用。

| ID | 规则 | 派生事实 |
|----|------|----------|
| I1 | 有逾期未还 → 借阅受限状态 | `borrowingStatus: "restricted"` |
| I2 | 连续 3 次按时归还 → 信用良好 | `creditLevel: "good"` |
| I3 | 书籍被预约次数 > 5 → 热门书标记 | `bookHotness: "hot"` |

```ts
const I1: Rule = {
  id: "overdue_infers_restricted",
  version: "1.0.0",
  kind: "inference_rule",
  appliesTo: ["Reader"],
  requiredFacts: [
    { property: "overdueBooks", scope: "entity" },
    { property: "overdueDays", scope: "entity" }
  ],
  derives: [{ property: "borrowingStatus", scope: "entity" }],

  evaluator: (ctx) => {
    const overdue = ctx.facts.get(ctx.entityId!, "overdueBooks")?.value ?? 0
    const days = ctx.facts.get(ctx.entityId!, "overdueDays")?.value ?? 0

    let status = "normal"
    if (overdue > 0 && days > 3) status = "restricted"
    if (overdue > 0 && days > 30) status = "suspended"

    return {
      triggered: true,
      derivedFacts: [{
        entityId: ctx.entityId!,
        property: "borrowingStatus",
        value: status,
        source: { kind: "derived", ref: "I1" },
        confidence: 1.0
      }]
    }
  },
  explanation: (result) => `根据逾期情况，借阅状态推导为 ${result.derivedFacts?.[0]?.value}`
}
```

**执行顺序**：Rule DAG 会拓扑排序，`inference_rule` 先执行，产生的 `borrowingStatus` 再被 `hard_constraint` 使用。

---

### 3. `soft_criterion` — 软准则，加权打分

事先定义好，有 weight 和 direction，触发时贡献 MCDA 分数，不直接否决。

| ID | 规则 | weight | direction |
|----|------|--------|-----------|
| S1 | 读者信用等级高 → 更倾向允许借阅 | 0.3 | `risk_down` |
| S2 | 书籍热门程度高 → 借阅期限缩短 | 0.2 | `neutral` |
| S3 | 读者近期借阅频率高 → 可能过度借阅 | 0.15 | `risk_up` |

```ts
const S1: Rule = {
  id: "good_credit_favors_borrow",
  version: "1.0.0",
  kind: "soft_criterion",
  appliesTo: ["Reader"],
  requiredFacts: [{ property: "creditLevel", scope: "entity" }],
  weight: 0.3,
  direction: "risk_down",  // 触发 → 风险下降 → ALLOW 更可能

  evaluator: (ctx) => {
    const credit = ctx.facts.get(ctx.entityId!, "creditLevel")?.value
    return {
      triggered: credit === "good",
      explanation: credit === "good" ? "信用良好" : "信用一般"
    }
  },
  explanation: (result) => result.triggered
    ? "信用良好，倾向允许借阅（加分）"
    : "信用等级不影响"
}
```

**打分逻辑**：
- `risk_down` 触发 → ALLOW 候选分数 +weight × severity
- `risk_up` 触发 → DENY 候选分数 +weight × severity

---

## 四、inference_rule 的 entityId 来源：scope 决定

`FactBinding` 要求 entityId 必填，但 inference_rule 的 `derives` 配置只有 `scope`。entityId 由 `scope` 决定：

### 1. `scope: "entity"` — 实体级派生事实

entityId 从 **RuleContext.entityId** 获取（规则在某个具体实体上评估）

```ts
// 图书馆场景
const I1: Rule = {
  kind: "inference_rule",
  appliesTo: ["Reader"],
  derives: [{ property: "borrowingStatus", scope: "entity" }],

  evaluator: (ctx) => {
    // ctx.entityId 是 "小明"（当前评估的 Reader 实体）
    const overdue = ctx.facts.get(ctx.entityId!, "overdueBooks")?.value

    return {
      triggered: true,
      derivedFacts: [{
        entityId: ctx.entityId!,       // ← "小明"
        property: "borrowingStatus",
        value: overdue > 0 ? "restricted" : "normal",
        source: { kind: "derived", ref: "I1" },
        confidence: 1.0
      }]
    }
  }
}

// 结果：FactStore 存储 key = "小明.borrowingStatus"
```

### 2. `scope: "type"` — 类型级派生事实

entityId 需要构造为 `"type:{TypeName}"`，表示该类型的全局属性

```ts
// 图书馆场景：统计该类型所有实体
const I2: Rule = {
  kind: "inference_rule",
  appliesTo: ["Reader"],
  derives: [{ property: "avgBorrowCount", scope: "type" }],

  evaluator: (ctx) => {
    // 需要聚合所有 Reader 的 borrowCount
    const allReaders = ctx.graph.query({ type: "Reader" })
    const avg = allReaders.reduce(...)

    return {
      triggered: true,
      derivedFacts: [{
        entityId: "type:Reader",       // ← 构造的类型级 entityId
        property: "avgBorrowCount",
        value: avg,
        source: { kind: "derived", ref: "I2" },
        confidence: 1.0
      }]
    }
  }
}

// 结果：FactStore 存储 key = "type:Reader.avgBorrowCount"
```

### 3. `scope: "global"` — 全局派生事实

entityId 固定为 `"global"` 或 `_system`

```ts
// 图书馆场景：系统级统计
const I3: Rule = {
  kind: "inference_rule",
  appliesTo: [],
  derives: [{ property: "libraryBusyLevel", scope: "global" }],

  evaluator: (ctx) => {
    const allActivity = ctx.facts.forProperty("borrowActivity")
    const busyLevel = calculateBusyLevel(allActivity)

    return {
      triggered: true,
      derivedFacts: [{
        entityId: "global",           // ← 固定的全局 entityId
        property: "libraryBusyLevel",
        value: busyLevel,
        source: { kind: "derived", ref: "I3" },
        confidence: 1.0
      }]
    }
  }
}

// 结果：FactStore 存储 key = "global.libraryBusyLevel"
```

### scope 映射表

| scope | entityId 来源 | FactStore key 示例 | 适用场景 |
|-------|--------------|-------------------|----------|
| `"entity"` | `ctx.entityId`（规则评估时的实体） | `"小明.borrowingStatus"` | 每个实体独立推导 |
| `"type"` | 构造 `"type:{TypeName}"` | `"type:Reader.avgBorrowCount"` | 类型级聚合/统计 |
| `"global"` | 固定 `"global"` | `"global.libraryBusyLevel"` | 系统级全局属性 |

---

## 五、事实来源：aggregation vs derived

```ts
export type FactSourceKind =
  | 'graph_property'  // inspect_node 直接读取
  | 'method_result'   // call_method 调用返回
  | 'aggregation'     // aggregate_facts 工具调用（LLM 主动）
  | 'user_input'      // 用户/前端输入
  | 'derived'         // inference_rule 自动推导（规则系统）
```

### 核心区别

| 维度 | aggregation | derived |
|------|-------------|---------|
| **触发方式** | LLM 调用 `aggregate_facts` 工具 | Rule DAG 自动执行 inference_rule |
| **谁来决定** | Executor (LLM) | RuleDag (确定性系统) |
| **是否事先定义** | ❌ 不需要定义，现场调用 | ✅ 需要事先定义 inference_rule |
| **依赖关系** | LLM 自己判断要聚合哪些实体 | 规则声明 `requiredFacts`，系统自动取值 |
| **traceability** | `derivedFrom` 需 LLM 手动指定 | `source.ref` 自动标记规则 ID |

---

### 场景对比：计算项目团队总负载

```text
已知事实：
- alice.workload = 85
- bob.workload = 65

需要：
- project_portal.teamLoad = 150 (团队总负载)
```

#### 方式 1：`aggregation`（LLM 主动调用工具）

LLM 在 executor 阶段**自己决定**要聚合：

```ts
// LLM 调用工具链
1. inspect_node("alice") → 得到 workload=85
2. bind_fact("alice", "workload", 85, "graph_property")
3. inspect_node("bob") → 得到 workload=65
4. bind_fact("bob", "workload", 65, "graph_property")
5. aggregate_facts(["alice", "bob"], "workload", "sum") → result=150
6. bind_fact("project_portal", "teamLoad", 150, "aggregation")
```

**问题**：
- LLM 需要知道"要聚合 alice 和 bob"，需要自己探索图发现团队成员
- `derivedFrom`（依赖哪些原始事实）需要 LLM 手动指定，容易遗漏或出错

#### 方式 2：`derived`（inference_rule 自动推导）

事先定义 inference_rule，RuleDag 自动执行：

```ts
const I_teamLoad: Rule = {
  id: "infer_team_load",
  kind: "inference_rule",
  appliesTo: ["Project"],
  requiredFacts: [
    { property: "workload", scope: "entity" }
  ],
  derives: [{ property: "teamLoad", scope: "entity" }],

  evaluator: (ctx) => {
    // 系统自动从图中找到 project 的所有团队成员
    const team = ctx.graph.queryNeighbors(ctx.entityId!, "assigned_to")
    const workloads = team.map(member =>
      ctx.facts.get(member.id, "workload")?.value ?? 0
    )
    const total = workloads.reduce((a, b) => a + b, 0)

    return {
      triggered: true,
      derivedFacts: [{
        entityId: ctx.entityId!,
        property: "teamLoad",
        value: total,
        source: { kind: "derived", ref: "infer_team_load" },
        derivedFrom: workloads.map((w, i) => `${team[i].id}.workload`),
        confidence: 0.95
      }]
    }
  }
}
```

**执行流程**（RuleDag 自动）：
```text
1. RuleDag 拓扑排序 → inference_rule 最先执行
2. 对 project_portal 执行 I_teamLoad
3. 系统自动查询图找到 alice, bob（通过 assigned_to 关系）
4. 系统自动从 FactStore 取 alice.workload, bob.workload
5. 计算 sum=150，自动写入 FactStore
6. 自动标记 source.kind="derived", source.ref="infer_team_load"
```

---

### 总结对比表

| | aggregation (工具调用) | derived (inference_rule) |
|---|---|---|
| **谁触发** | LLM 主动调用 | 系统自动执行 |
| **定义方式** | 不需要定义 | 事先定义规则 |
| **依赖追溯** | LLM 手动记录，易遗漏 | 系统自动记录 `derivedFrom` |
| **适用场景** | 临时、灵活的聚合 | 固定、可复用的推导逻辑 |
| **可确定性** | ❌ 取决于 LLM 判断 | ✅ 确定性，可重放 |

---

## 六、最佳实践

**两者可以并存**：

```ts
// aggregation：灵活场景，LLM 自己决定聚合什么
// 例如："我想看看这 5 个项目的平均风险等级"
aggregate_facts(["proj1", "proj2", ...], "riskLevel", "avg")

// derived：固定场景，业务规则固化
// 例如：每个 Project 都必须计算 teamLoad（用于后续规则评估）
inference_rule: infer_team_load → 自动为每个 Project 计算 teamLoad
```

**建议**：
- **规则评估需要的事实** → 用 `inference_rule`（确定性、可追溯、规则 DAG 先执行）
- **临时探索性聚合** → 用 `aggregate_facts`（灵活、LLM 自由调用）

---

## 七、关于 conflict_policy 和 explanation_policy

这两种类型**意义不大**，不需要作为"规则"：

### `conflict_policy` — 系统内置逻辑即可

```ts
// 直接硬编码在 reconciler 里
function reconcile(systemVerdict, modelVerdict) {
  // 固定策略：hard veto 存在 → 软准则正面信号无效
  if (systemVerdict.vetoedCandidates.length > 0) {
    return { winner: systemVerdict, reason: "hard_constraint优先" }
  }
  // 固定策略：方向相反且权重相近 → 标记 uncertain
  if (opposingSoftCriteria && weightsSimilar) {
    return { uncertain: true }
  }
}
```

**本质**：这是系统的"裁决逻辑"，不是业务知识。

### `explanation_policy` — UI 渲染配置即可

```ts
// 直接硬编码在 UI renderer 里
function renderDeny(verdict) {
  const vetoRules = verdict.triggeredRules.filter(r => r.kind === "hard_constraint")
  return `拒绝原因：${vetoRules.map(r => r.description).join("；")}`
}
```

**本质**：这是"展示层逻辑"，不是推理层逻辑。

---

## 八、精简后的规则类型建议

```ts
export type RuleKind =
  | 'hard_constraint'   // veto 否决候选
  | 'inference_rule'    // 产生派生事实（推理链）
  | 'soft_criterion'    // MCDA 加权打分

// conflict_policy → 硬编码在 reconciler
// explanation_policy → 硬编码在 UI renderer
```

三种规则就够了：
- `inference_rule` → **有意义**，参与推理链，产生可追溯的派生事实
- `hard_constraint` → **有意义**，直接否决候选
- `soft_criterion` → **有意义**，加权打分参与 MCDA
- `conflict_policy` → **没必要作为规则**，是系统内置的裁决逻辑
- `explanation_policy` → **没必要作为规则**，是 UI 层的展示配置