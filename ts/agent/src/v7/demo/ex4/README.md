# Ex4 — 图书馆借书决策 Demo

## 场景

> **小明想借《人工智能简史》**

图书馆规定：

| 编号 | 规则                                              | 类型            |
| ---- | ------------------------------------------------- | --------------- |
| R1   | 每个读者最多只能借 **3 本书**                     | hard_constraint |
| R2   | **新书（上架不到 7 天）**不能外借，只能在馆内阅读 | hard_constraint |
| R3   | 如果读者**有逾期未还的书**，就不能再借新书        | hard_constraint |

当前小明的状态：

- 已借 2 本（《飘》《三体》）→ R1 **未触发**（未满上限）
- 有 1 本逾期未还（《老人与海》借期超 3 天）→ R3 **触发**
- 目标书《人工智能简史》上架仅 3 天 → R2 **触发**

预期系统判决：**DENIED**

---

## 如何运行

```bash
npx tsx src/v6/demo/ex4/main.ts
```

---

## 设计文档

### 一、场景分析

#### 1.1 决策问题分解

借阅申请本质上是一个**多规则合取约束检查**问题：

```
Decision = "小明能借这本书吗"

约束集合（C）：
  C1: reader.currentBorrowCount < library.maxBorrowPerReader
  C2: book.daysOnShelf >= library.newBookProtectionDays
  C3: reader.hasOverdueBook == false

Result = ALLOWED ↔ C1 ∧ C2 ∧ C3 全部为真
Result = DENIED  ↔ 任意一条 Ci 为假
```

三条约束全是 **hard_constraint**（任意一条触发即 veto ALLOWED 候选），这正是 V6 `Rule` 系统中 `veto` 机制的典型用例。

#### 1.2 为什么选这个场景

| 维度                                      | 价值                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| **规则全是 hard_constraint**              | 验证 veto 机制：只要一条规则触发，结论就固定是 DENIED，不依赖打分权重 |
| **多规则并发触发（R2 + R3）**             | 验证"多因并存"下的 Diagnostic 溯因，而不是唯一原因                    |
| **存在未触发规则（R1）**                  | 验证系统不会误报未触发规则，evidence 要精确                           |
| **时间维度（新书上架天数 + 逾期时间线）** | 验证 EventStore 的时间溯源能力                                        |
| **反事实入口清晰**                        | "归还逾期书" / "等书过了保护期" 是两个独立的解锁路径                  |

---

### 二、实体设计

#### 2.1 Reader（读者）

| 属性                 | 类型    | 说明                                                  |
| -------------------- | ------- | ----------------------------------------------------- |
| `name`               | string  | 读者姓名                                              |
| `currentBorrowCount` | number  | 当前已借未还书籍数量（来源：`borrows` 边聚合）        |
| `hasOverdueBook`     | boolean | 是否存在逾期未还（来源：`overdue` 边 + 截止日期检查） |

关键方法：`checkBorrowEligibility()`

#### 2.2 Book（书籍）

| 属性          | 类型    | 说明                               |
| ------------- | ------- | ---------------------------------- |
| `title`       | string  | 书名                               |
| `isbn`        | string  | ISBN                               |
| `daysOnShelf` | number  | 上架距今天数（关键！新书判断依据） |
| `lendable`    | boolean | 馆员手动标注的外借许可             |

关键方法：`checkNewBookStatus({ newBookThresholdDays: 7 })`

#### 2.3 Library（图书馆）

| 属性                    | 类型   | 说明                        |
| ----------------------- | ------ | --------------------------- |
| `maxBorrowPerReader`    | number | 借阅上限（配置值 = 3）      |
| `newBookProtectionDays` | number | 新书保护期（配置值 = 7 天） |

关键方法：`evaluateBorrowRequest()` — 作为文档入口，真实计算委托给 rule engine。

#### 2.4 图谱结构

```
xiao_ming  ──borrows──>  book_gone_with_wind
           ──borrows──>  book_three_body
           ──overdue──>  book_old_man_and_sea
           ──requests──> book_ai_history
                               └──managed_by──> city_library
```

---

### 三、规则设计

#### 3.1 Rule 1：借阅数量上限 `borrow_limit_exceeded`

```
kind:      hard_constraint
appliesTo: ["Reader"]
fact:      reader.currentBorrowCount
condition: currentBorrowCount >= 3
veto:      ["ALLOWED"]
weight:    1.0
direction: risk_up
```

在本场景中：小明借了 2 本，**不触发**。

#### 3.2 Rule 2：新书保护期 `new_book_not_lendable`

```
kind:      hard_constraint
appliesTo: ["Book"]
fact:      book.daysOnShelf
condition: daysOnShelf < 7
veto:      ["ALLOWED"]
weight:    1.0
direction: risk_up
```

在本场景中：《人工智能简史》上架 3 天，**触发**，直接 veto ALLOWED。

#### 3.3 Rule 3：逾期阻断 `overdue_blocks_borrow`

```
kind:      hard_constraint
appliesTo: ["Reader"]
fact:      reader.hasOverdueBook
condition: hasOverdueBook == true
veto:      ["ALLOWED"]
weight:    1.0
direction: risk_up
```

在本场景中：小明有《老人与海》逾期，**触发**，直接 veto ALLOWED。

#### 3.4 辅助规则：良好借阅记录 `good_borrow_record`（soft_criterion）

```
kind:      soft_criterion
condition: currentBorrowCount == 0 AND hasOverdueBook == false
direction: risk_down
weight:    0.5
```

当三条 hard_constraint 全未触发时，这条规则给 ALLOWED 候选加分，提升置信度。本场景不触发（小明有逾期）。

---

### 四、MCDA 评分逻辑

候选答案：`ALLOWED` | `DENIED`

由于三条规则均为 `hard_constraint`，评分逻辑极简：

```
if 任意 hard_constraint 触发:
    veto("ALLOWED")
    DENIED.normalizedScore = 1.0
    ALLOWED.normalizedScore = 0.0  (被 veto)

else:
    soft_criterion 参与 weighted_sum
    ALLOWED 可能得高分
```

本场景预期：

- R2 触发（新书） → veto ALLOWED
- R3 触发（逾期） → veto ALLOWED（重复 veto 幂等）
- **systemVerdict: DENIED, confidence ≈ 1.0**

---

### 五、双轨判决与一致性

| 轨道           | 来源                   | 预期判决                             |
| -------------- | ---------------------- | ------------------------------------ |
| systemVerdict  | 确定性 rule DAG + MCDA | DENIED                               |
| modelVerdict   | LLM 综合推理           | DENIED（规则清晰，LLM 应与系统一致） |
| reconciliation | 两者比较               | agree = true                         |

如果 LLM 输出 ALLOWED（例如被"只差 4 天就过保护期"这种叙事误导）：

- reconciliation 标记 `agree = false`
- `likelyCause: "model_overrides_system"` — 系统检测到明确 veto 规则但模型忽略
- UI 强制 surface 冲突，不允许 LLM 静默胜出

---

### 六、Predictive Pipeline（Round 1）

```
用户问题: "小明能借《人工智能简史》吗？"
         │
         ▼
frontEnd:
  intent  = "borrow_eligibility_check"
  entries = ["xiao_ming", "book_ai_history", "city_library"]
         │
         ▼
Planner:
  expectedSubgraphs = [
    { rootId: "xiao_ming", relations: ["borrows", "overdue", "requests"], maxDepth: 1 },
    { rootId: "book_ai_history", relations: ["managed_by"], maxDepth: 1 },
  ]
  rulesetOfInterest = [
    "borrow_limit_exceeded",
    "new_book_not_lendable",
    "overdue_blocks_borrow",
  ]
         │
         ▼
Executor:
  bind_fact("xiao_ming", "currentBorrowCount", 2)
  bind_fact("xiao_ming", "hasOverdueBook", true)
  bind_fact("book_ai_history", "daysOnShelf", 3)
  call_method("city_library", "evaluateBorrowRequest", {...})
  propose_candidates(["ALLOWED", "DENIED"])
  modelVerdict = { recommendedCandidateId: "DENIED", rationale: "..." }
         │
         ▼
Critic（deterministic）:
  evaluate_rule("borrow_limit_exceeded", "xiao_ming") → not triggered
  evaluate_rule("new_book_not_lendable", "book_ai_history") → triggered, veto ALLOWED
  evaluate_rule("overdue_blocks_borrow", "xiao_ming") → triggered, veto ALLOWED
  scoreCandidates → DENIED: 1.0, ALLOWED: 0.0 (vetoed)
  systemVerdict = { recommendedCandidateId: "DENIED", confidence: 1.0 }
         │
         ▼
Reconciliation:
  agree = true
  counterfactuals = [
    { mode: "what_if", description: "如果小明先归还《老人与海》" },
    { mode: "what_if", description: "如果书已上架满 7 天（2026-05-07 后）" },
  ]
```

---

### 七、Diagnostic Pipeline（Round 2）

```
用户问题: "小明今天申请借《人工智能简史》被拒了，为什么？"
         │
         ▼
frontEnd:
  mode = "diagnostic"
  intent = "rca"
  outcome = {
    entityId: "xiao_ming",
    eventType: "borrow_request_denied",
    occurredAt: "2026-05-03T10:00:00.000Z"
  }
  timeWindow = { from: "2026-04-12", to: "2026-05-03" }
         │
         ▼
DiagnosticPlanner:
  rootOutcome = "xiao_ming.borrow_request_denied@2026-05-03"
  backwardChains = [
    ce_overdue_request_denied → ce_deadline_missed_overdue → ce_forgot_return_overdue,
    ce_new_book_request_denied → ce_book_recently_added,
  ]
  eventsToReconstruct = [
    { entityIdHint: "xiao_ming", eventTypes: ["book_borrowed", "return_deadline_missed", "return_reminder_ignored"] },
    { entityIdHint: "book_ai_history", eventTypes: ["book_added_to_shelf"] },
  ]
         │
         ▼
Executor:
  query_events("xiao_ming", from, to) →
    [evt_borrow_old_man, evt_return_reminder_sent, evt_return_deadline_missed]
  query_events("book_ai_history", from, to) →
    [evt_book_added_to_shelf]
  walk_causal_graph("borrow_request_denied", "backward", depth=3) →
    [path A: overdue chain, path B: new_book chain]
  propose_causes([
    { id: "new_book_protection", causalPath: B, ... },
    { id: "overdue_book_blocking", causalPath: A, ... },
  ])
         │
         ▼
Diagnostic Critic（deterministic）:
  scoreCauses({
    "new_book_protection":
      necessity=1.0, sufficiency=0.8, pathCompleteness=0.95,
      temporalPlausibility=1.0, attributionScore=0.44
    "overdue_book_blocking":
      necessity=1.0, sufficiency=0.8, pathCompleteness=0.90,
      temporalPlausibility=1.0, attributionScore=0.44
  })
  overdetermined = true  (两者 sufficiency 都 > 0.6，且各自独立充分)
         │
         ▼
Reconciliation:
  agree = true (系统和模型都认为两条原因并列)
  counterfactuals = [
    { mode: "but_for", description: "如果没有逾期事件，拒绝还会发生吗？" → 是（新书保护期仍触发）},
    { mode: "but_for", description: "如果书提前 10 天上架，拒绝还会发生吗？" → 视 overdue 状态而定 },
  ]
```

---

### 八、反事实分析

#### 8.1 What-If（Predictive 模式）

| 假设                                               | 效果                                       |
| -------------------------------------------------- | ------------------------------------------ |
| 小明先归还《老人与海》（`hasOverdueBook = false`） | R3 不触发，但 R2 仍触发（新书），仍 DENIED |
| 书已上架满 7 天（`daysOnShelf = 8`）               | R2 不触发，但 R3 仍触发（逾期），仍 DENIED |
| 同时满足上述两条                                   | R2 和 R3 都不触发，→ ALLOWED               |
| 小明已借 3 本（`currentBorrowCount = 3`）          | R1 也触发，三条规则全触发                  |

#### 8.2 But-For（Diagnostic 模式）

| 假设（抹除事件）                                  | 结论                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| 抹除 `evt_return_deadline_missed`（假设没有逾期） | 拒绝仍发生（新书保护期仍有效），but-for 不成立 |
| 抹除 `evt_book_added_to_shelf`（假设书早上架）    | 拒绝仍发生（逾期仍有效），but-for 不成立       |
| 同时抹除两个事件                                  | 拒绝不发生，二者联合构成充分必要条件           |

这正是"**overdetermination**"的经典案例：两个原因各自充分，任意一个都能单独导致拒绝，因此 `overdetermined = true`。

---

### 九、设计决策

#### 决策 1：candidates 选 ALLOWED / DENIED，而非 HIGH / MEDIUM / LOW

借阅决策是二元决策（允许/拒绝），不是风险等级评估。V6 框架对 candidates 没有格式限制，这里选 `ALLOWED / DENIED` 更贴合业务语义。`rule.veto` 的目标 label 也直接对应 `DENIED`。

#### 决策 2：三条规则全设为 hard_constraint

图书馆规定是强制合规要求，没有"权衡余地"——不存在"逾期了但书很重要所以还是借"这种情况。用 `hard_constraint + veto` 而不是 `soft_criterion + weight` 精确表达了这种语义，也避免了打分系统人为引入弹性。

#### 决策 3：`currentBorrowCount` 来源标注为 `aggregation`

这个值不是 Reader 节点的直接属性，而是通过统计 `borrows` 边数量得到的派生事实。FactStore 的 `source.kind = "aggregation"` 精确记录了这一点，支持后续追溯和更新。

#### 决策 4：逾期书的 Diagnostic 走 EventStore，不走 FactStore 快照

`hasOverdueBook = true` 是当前状态快照，但为什么会逾期（归还提醒被忽略？出差了？）只能从 EventStore 的历史事件中看到。Diagnostic 模式的核心价值就是把"当前状态"还原成"事件链"，这是 V6.5 EventStore 的设计原点。

#### 决策 5：overdetermined 必须显式标注

两条规则同时触发时，强行归因到"主因"（如"因为新书"或"因为逾期"）是错的——两者都是充分原因。系统应输出 `overdetermined = true` 并告诉用户"两个问题都需要解决才能成功借书"，而不是给出一个"最大原因"误导用户只解决一个就够了。

---

### 十、文件结构

```
src/v6/demo/ex4/
├── entities.ts    — Reader / Book / Library 实体类（带 @agentProperty / @agentMethod）
├── ontology.ts    — libraryOntology（types, relations, methods 定义）
├── rules.ts       — registerLibraryRules()（3 hard_constraint + 1 soft_criterion + 1 explanation_policy）
├── causal.ts      — buildLibraryCausalGraph()（借阅拒绝因果链）
├── seed.ts        — setupLibraryScenario()（Graph + FactStore + EventStore）
├── main.ts        — 两轮运行入口（Predictive + Diagnostic）
└── README.md      — 本文档
```

---

### 十一、与 ex1 / ex2 的对比

| 维度               | ex1（工程师交付风险）           | ex2（dbt 数据质量）         | ex4（图书馆借阅）              |
| ------------------ | ------------------------------- | --------------------------- | ------------------------------ |
| 决策类型           | 风险评估（HIGH/MEDIUM/LOW）     | 风险评估（HIGH/MEDIUM/LOW） | **合规检查（ALLOWED/DENIED）** |
| 规则类型           | 混合（soft + hard + inference） | 混合                        | **全部 hard_constraint**       |
| Veto 机制          | 部分规则有 veto                 | 部分规则有 veto             | **所有规则均 veto**            |
| Diagnostic outcome | milestone_missed                | dashboard_incorrect         | **borrow_request_denied**      |
| Overdetermination  | 否                              | 否                          | **是（两条规则并发触发）**     |
| 时间驱动的 fact    | 工程师 workload 变化            | 模型刷新延迟                | **书籍上架天数 + 逾期天数**    |
