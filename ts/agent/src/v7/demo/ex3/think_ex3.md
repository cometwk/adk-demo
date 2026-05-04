# V6 Demo ex3：图书馆借书决策支持系统设计

## 一、场景概述

### 1.1 业务场景

📚 **小明想借一本书**

图书馆借阅规则：

1. **借阅上限**：每个读者最多只能借 3 本书
2. **新书限制**：新书（刚上架不到 7 天）不能外借，只能在馆内阅读
3. **逾期阻止**：如果读者有逾期未还的书，就不能再借新书

这是一个典型的**规则密集型决策场景**，涉及：

- 多个硬约束（hard_constraint）
- 事实绑定（读者状态 + 图书状态）
- 时间维度（上架天数计算）
- 双轨判决（系统规则评估 + LLM 综合判断）

### 1.2 为什么选择这个场景

| 特性     | 图书馆场景             | ex1 工程场景            | ex2 数据管道场景 |
| -------- | ---------------------- | ----------------------- | ---------------- |
| 规则类型 | 硬约束为主             | 混合（hard + soft）     | 混合             |
| 事实依赖 | 读者 + 图书（双向）    | 项目 + 工程师（多向）   | 模型 + 数据源    |
| 时间维度 | 上架天数（关键）       | 截止日期压力            | SLA 窗口         |
| 候选答案 | 二元（ALLOWED/DENIED） | 三元（HIGH/MEDIUM/LOW） | 二元或三元       |
| 诊断价值 | "为什么被拒绝"         | "为什么延期"            | "为什么数据错误" |

图书馆场景的**简洁性**使其成为验证 V6 框架的理想选择：

- 规则逻辑清晰，易于验证正确性
- 候选答案二元化，便于理解判决过程
- 时间维度简单（仅上架天数），不涉及复杂事件链

---

## 二、本体设计（Ontology）

### 2.1 类型（Types）

```typescript
// 读者
type Reader = {
  borrowedCount: number // 当前已借阅数量
  hasOverdue: boolean // 是否有逾期未还
  overdueCount: number // 逾期数量
}

// 图书
type Book = {
  title: string
  category: 'fiction' | 'nonfiction' | 'reference' | 'textbook'
  isNew: boolean
  shelvedAt: string // 上架日期（ISO）
  canCheckout: boolean // 是否可外借
  status: 'available' | 'borrowed' | 'in_library_only'
}

// 图书馆
type Library = {
  name: string
  borrowLimit: number // 借阅上限（默认 3）
  newBookRestrictionDays: number // 新书限制天数（默认 7）
}

// 借阅记录
type BorrowRecord = {
  borrowedAt: string
  dueDate: string
  returnedAt: string | null
  isOverdue: boolean
}
```

### 2.2 关系（Relations）

```
Reader ──member_of──> Library      // 读者是图书馆会员
Reader ──borrows──> Book           // 读者借阅图书（当前借阅）
Book   ──borrowed_by──> Reader     // 图书被读者借阅（反向）
Reader ──has_record──> BorrowRecord // 读者有借阅记录
BorrowRecord ──for_book──> Book    // 记录对应某图书
Library ──holds──> Book            // 图书馆收藏图书
```

### 2.3 方法（Methods）

| 实体类型 | 方法                                      | 参数 | 返回值                                         | 相关规则               |
| -------- | ----------------------------------------- | ---- | ---------------------------------------------- | ---------------------- |
| Reader   | `checkBorrowCapacity()`                   | -    | `{ canBorrow, remainingSlots }`                | `reader_borrow_limit`  |
| Reader   | `checkOverdueBlock()`                     | -    | `{ blocked, reason }`                          | `reader_overdue_block` |
| Book     | `checkNewBookStatus(currentTime)`         | 时间 | `{ isNewBook, daysSinceShelved, canCheckout }` | `new_book_restricted`  |
| Book     | `checkAvailability()`                     | -    | `{ available, reason }`                        | `book_availability`    |
| Library  | `evaluateBorrowRequest(readerId, bookId)` | -    | `{ allowed, blockedBy, reasons }`              | 全部                   |

---

## 三、规则设计（Rules）

### 3.1 规则列表

#### R1: `reader_borrow_limit`（借阅上限）

```typescript
{
  id: "reader_borrow_limit",
  kind: "hard_constraint",
  appliesTo: ["Reader"],
  description: "每个读者最多只能借 3 本书",
  requiredFacts: [{ property: "borrowedCount", scope: "entity" }],
  direction: "risk_up",  // 触发 → 拒绝（风险上升）
  weight: 1.0,
  veto: { candidatesByLabel: ["ALLOWED"] },  // 触发时直接否决 ALLOWED
  evaluator(ctx) {
    const borrowedCount = ctx.facts.getValue(entityId, "borrowedCount");
    const triggered = borrowedCount >= 3;
    return { triggered, severity: triggered ? "high" : "low" };
  }
}
```

**关键设计点**：

- `veto` 字段：触发时直接否决 `ALLOWED` 候选，不再参与后续评分
- `direction: "risk_up"`：触发时推高风险（在图书馆场景中，风险 = DENIED）

#### R2: `new_book_restricted`（新书限制）

```typescript
{
  id: "new_book_restricted",
  kind: "hard_constraint",
  appliesTo: ["Book"],
  description: "新书（上架不到 7 天）不能外借",
  requiredFacts: [
    { property: "shelvedAt", scope: "entity" },
    { property: "daysSinceShelved", scope: "entity" }  // 派生事实
  ],
  direction: "risk_up",
  weight: 1.0,
  veto: { candidatesByLabel: ["ALLOWED"] },
  evaluator(ctx) {
    const daysSinceShelved = ctx.facts.getValue(entityId, "daysSinceShelved");
    const triggered = daysSinceShelved < 7;
    return { triggered, severity: triggered ? "high" : "low" };
  }
}
```

**关键设计点**：

- `daysSinceShelved` 是派生事实，由 `compute_days_since_shelved` 规则计算
- 体现 V6 的 **Rule DAG** 设计：inference_rule 先执行，hard_constraint 后执行

#### R3: `reader_overdue_block`（逾期阻止）

```typescript
{
  id: "reader_overdue_block",
  kind: "hard_constraint",
  appliesTo: ["Reader"],
  description: "有逾期未还的书，不能借新书",
  requiredFacts: [
    { property: "hasOverdue", scope: "entity" },
    { property: "overdueCount", scope: "entity" }
  ],
  direction: "risk_up",
  weight: 1.0,
  veto: { candidatesByLabel: ["ALLOWED"] },
  evaluator(ctx) {
    const hasOverdue = ctx.facts.getValue(entityId, "hasOverdue");
    const triggered = hasOverdue === true;
    return { triggered, severity: triggered ? "high" : "low" };
  }
}
```

#### R4: `book_availability`（图书可借性）

```typescript
{
  id: "book_availability",
  kind: "soft_criterion",
  appliesTo: ["Book"],
  description: "图书必须处于可借状态",
  requiredFacts: [
    { property: "status", scope: "entity" },
    { property: "canCheckout", scope: "entity" }
  ],
  direction: "risk_up",
  weight: 0.8,
  evaluator(ctx) {
    const status = ctx.facts.getValue(entityId, "status");
    const canCheckout = ctx.facts.getValue(entityId, "canCheckout");
    const triggered = status === "borrowed" || canCheckout === false;
    return { triggered, severity: triggered ? "high" : "low" };
  }
}
```

**关键设计点**：

- 作为 `soft_criterion` 而非 `hard_constraint`
- 因为图书状态可能变化（被归还），不是绝对阻止

#### R5: `compute_days_since_shelved`（派生事实）

```typescript
{
  id: "compute_days_since_shelved",
  kind: "inference_rule",
  appliesTo: ["Book"],
  description: "计算上架天数",
  requiredFacts: [
    { property: "shelvedAt", scope: "entity" },
    { property: "currentTime", scope: "global" }
  ],
  direction: "neutral",
  evaluator(ctx) {
    const shelvedAt = ctx.facts.getValue(entityId, "shelvedAt");
    const currentTime = ctx.facts.getValue("global", "currentTime");
    const daysSinceShelved = computeDaysBetween(shelvedAt, currentTime);
    return {
      triggered: true,
      derivedFacts: [{
        entityId,
        property: "daysSinceShelved",
        value: daysSinceShelved,
        source: { kind: "derived", ref: "compute_days_since_shelved" }
      }]
    };
  }
}
```

**关键设计点**：

- 体现 V6 的 **FactStore + 派生事实** 设计
- Rule DAG 保证此规则在 `new_book_restricted` 之前执行

### 3.2 规则 DAG

```
[compute_days_since_shelved] (inference_rule)
         │
         │ 产生 derivedFacts: daysSinceShelved
         ▼
[new_book_restricted] (hard_constraint) ←── 依赖 daysSinceShelved
         │
         │
         ▼
[reader_borrow_limit] (hard_constraint)
         │
         │
         ▼
[reader_overdue_block] (hard_constraint)
         │
         │
         ▼
[book_availability] (soft_criterion)
```

执行顺序：

1. 先执行 inference_rule，派生 `daysSinceShelved`
2. 执行 hard_constraint，进行 veto 检查
3. 执行 soft_criterion，参与 MCDA 评分

---

## 四、评分设计（MCDA）

### 4.1 候选答案

```typescript
type BorrowCandidate = {
  id: string
  label: 'ALLOWED' | 'DENIED'
  description: string
}

const candidates = [
  { id: 'cand_allowed', label: 'ALLOWED', description: '可以借阅' },
  { id: 'cand_denied', label: 'DENIED', description: '拒绝借阅' },
]
```

### 4.2 Direction Mapping

由于框架的 RuleDirection 类型限制为 `"risk_up" | "risk_down" | "neutral"`，我们需要适配：

在图书馆场景中，"风险"概念对应"拒绝借阅"：

- `risk_up`：触发时推高风险 → 推高 DENIED 候选得分
- `risk_down`：触发时降低风险 → 推高 ALLOWED 候选得分（本场景未使用）

```typescript
const directionMapping = {
  ALLOWED: {
    risk_up: -1, // 触发 risk_up 规则 → ALLOWED 得分下降
    risk_down: +1, // 触发 risk_down 规则 → ALLOWED 得分上升
  },
  DENIED: {
    risk_up: +1, // 触发 risk_up 规则 → DENIED 得分上升
    risk_down: -1,
  },
}
```

### 4.3 评分流程

```typescript
function scoreCandidates(input: ScoringInput): ScoredCandidate[] {
  // Step 1: 检查 veto
  for (const rule of input.rules.filter((r) => r.kind === 'hard_constraint')) {
    const result = rule.evaluator(ctx)
    if (result.triggered && rule.veto?.candidatesByLabel) {
      for (const label of rule.veto.candidatesByLabel) {
        vetoed.add(`cand_${label.toLowerCase()}`)
      }
    }
  }

  // Step 2: MCDA 加权评分
  for (const candidate of candidates) {
    if (vetoed.has(candidate.id)) {
      scores[candidate.id] = { normalizedScore: 0, blocked: true }
      continue
    }
    let score = 0.5 // 基准分
    for (const rule of input.rules) {
      if (rule.kind === 'hard_constraint' || rule.kind === 'soft_criterion') {
        const result = rule.evaluator(ctx)
        if (result.triggered) {
          const delta =
            directionMapping[candidate.label][rule.direction] * rule.weight * severityWeight[result.severity]
          score += delta
        }
      }
    }
    scores[candidate.id] = { normalizedScore: clamp(score, 0, 1), blocked: false }
  }

  return Object.entries(scores).map(([id, s]) => ({ candidateId: id, ...s }))
}
```

### 4.4 示例评分

**场景**：小明（2本，无逾期）想借新书（上架2天）

| 规则                         | 触发 | severity | 对 ALLOWED 影响 | 对 DENIED 影响 |
| ---------------------------- | ---- | -------- | --------------- | -------------- |
| `compute_days_since_shelved` | ✓    | -        | 0               | 0 (neutral)    |
| `new_book_restricted`        | ✓    | high     | vetoed!         | +1.0           |
| `reader_borrow_limit`        | ✗    | low      | 0               | 0              |
| `reader_overdue_block`       | ✗    | low      | 0               | 0              |
| `book_availability`          | ✗    | low      | 0               | 0              |

**结果**：

- ALLOWED: vetoed, normalizedScore = 0
- DENIED: normalizedScore = 1.0

**System Verdict**: `DENIED`, confidence = 0.95+

---

## 五、因果图设计（Causal Graph）

用于诊断模式：分析"借阅被拒绝"的原因。

### 5.1 Causal Edges

```typescript
const causalEdges = [
  // 新书限制因果链
  {
    id: 'ce_new_book_restricted',
    cause: { type: 'event_type', matcher: 'book_shelved' },
    effect: { type: 'fact_change', matcher: 'isNew=true' },
    mechanism: '新上架的图书被标记为 isNew=true',
    strength: 'strong',
    relatedRuleIds: ['new_book_restricted'],
  },
  {
    id: 'ce_new_book_checkout_blocked',
    cause: { type: 'fact_change', matcher: 'isNew=true && daysSinceShelved<7' },
    effect: { type: 'event_type', matcher: 'borrow_rejected' },
    mechanism: '上架不足 7 天的新书触发规则，阻止外借',
    strength: 'strong',
    relatedRuleIds: ['new_book_restricted'],
  },

  // 逾期阻止因果链
  {
    id: 'ce_due_date_passed',
    cause: { type: 'event_type', matcher: 'due_date_passed' },
    effect: { type: 'fact_change', matcher: 'hasOverdue=true' },
    mechanism: '应还日期已过且未归还，读者被标记为有逾期',
    strength: 'strong',
    relatedRuleIds: ['reader_overdue_block'],
  },
  {
    id: 'ce_overdue_block_borrow',
    cause: { type: 'fact_change', matcher: 'hasOverdue=true' },
    effect: { type: 'event_type', matcher: 'borrow_rejected' },
    mechanism: '逾期读者触发规则，阻止借新书',
    strength: 'strong',
    relatedRuleIds: ['reader_overdue_block'],
  },

  // 借阅上限因果链
  {
    id: 'ce_borrow_count_reached',
    cause: { type: 'fact_change', matcher: 'borrowedCount>=3' },
    effect: { type: 'event_type', matcher: 'borrow_rejected' },
    mechanism: '借阅数量达到上限，触发规则',
    strength: 'strong',
    relatedRuleIds: ['reader_borrow_limit'],
  },
]
```

### 5.2 Diagnostic Pipeline

```text
用户提问: "小明借 book_new_ai 为什么被拒绝"

frontEnd:
  → intent: "rca" (root cause analysis)
  → outcome: { entityId: "xiaoming", eventType: "borrow_rejected", occurredAt: "2026-05-03" }

DiagnosticPlanner:
  → backwardChain(borrow_rejected, maxDepth=2)
  → candidateCauseSpace: ["new_book_restriction", "borrow_limit", "overdue_block", "book_unavailable"]

Executor:
  → query_events(xiaoming, from=T-7d, to=T-0)
  → walk_causal_graph(borrow_rejected, direction="backward")
  → bind_fact(book_new_ai, shelvedAt, ...)
  → bind_fact(book_new_ai, daysSinceShelved, 2)
  → propose_causes([
      { label: "new_book_restriction", causalPath: [...], rationale: "上架仅 2 天" },
    ])

Critic (deterministic):
  → but_for(new_book_restriction): erase event "book_shelved" → daysSinceShelved=32 → ALLOWED
    → necessity = 0.95, sufficiency = 0.90
  → but_for(overdue_block): erase event "due_date_passed" → 无影响（小明无逾期）
    → necessity = 0, sufficiency = 0
  → Attribution: new_book_restriction = 0.85, others = 0

Reconciliation:
  → agree = true
  → final attribution: new_book_restriction (主因)
```

---

## 六、事件时间线（EventStore）

```typescript
const events = [
  // T-10d: 李四借书（用于测试逾期场景）
  { id: "evt_lisi_borrow_1", type: "book_borrowed", occurredAt: "2026-03-01", ... },

  // T-4d: 李四逾期
  { id: "evt_lisi_overdue_1", type: "due_date_passed", occurredAt: "2026-04-01",
    derivedBindings: [{ entityId: "lisi", property: "hasOverdue", value: true }] },

  // T-2d: 新书上架
  { id: "evt_new_book_shelved", type: "book_shelved", occurredAt: "2026-05-01",
    affectedEntities: ["book_new_ai"],
    derivedBindings: [{ entityId: "book_new_ai", property: "isNew", value: true }] },

  // T-0: 小明尝试借书（被拒绝）
  { id: "evt_borrow_rejected", type: "borrow_rejected", occurredAt: "2026-05-03",
    affectedEntities: ["xiaoming", "book_new_ai"],
    payload: { reason: "new_book_restricted", daysSinceShelved: 2 } },
];
```

---

## 七、测试场景矩阵

| #   | 读者              | 图书                                     | 预期   | 阻止规则             | 诊断归因                  |
| --- | ----------------- | ---------------------------------------- | ------ | -------------------- | ------------------------- |
| 1   | 小明 (2本,无逾期) | book_new_ai (上架2天)                    | DENIED | new_book_restricted  | "上架仅2天，新书不可外借" |
| 2   | 小明 (2本,无逾期) | book_design_patterns (上架32天,borrowed) | DENIED | book_availability    | "已被借出"                |
| 3   | 张三 (3本,无逾期) | book_design_patterns                     | DENIED | reader_borrow_limit  | "已借3本，达到上限"       |
| 4   | 李四 (1本,有逾期) | book_new_ai                              | DENIED | reader_overdue_block | "有2本逾期未还"           |
| 5   | 王五 (0本,无逾期) | book_new_ai                              | DENIED | new_book_restricted  | "上架仅2天"               |
| 6   | 王五 (0本,无逾期) | book_reference_manual                    | DENIED | book_availability    | "参考书仅限馆内"          |

---

## 八、文件结构

```
src/v6/demo/ex3/
├── entities.ts        # Reader, Book, Library, BorrowRecord 实体类
├── ontology.ts        # 本体定义（types, relations）
├── rules.ts           # 5 条规则（registerLibraryRules）
├── seed.ts            # Graph, FactStore, EventStore 初始化
├── causal.ts          # 因果图（buildLibraryCausalGraph）
├── main.ts            # 运行 4 轮 demo
├── README.md          # 场景说明
└── __tests__/
    └── ex3.test.ts    # 单元测试
```

---

## 九、与 V6 框架的对应关系

| V6 设计要素             | ex3 实现                                            |
| ----------------------- | --------------------------------------------------- |
| FactStore + FactBinding | `seed.ts`: FactBinding 初始化 + inference_rule 派生 |
| Rule DAG                | `rules.ts`: inference → hard → soft 执行顺序        |
| MCDA 评分               | `direction: "risk_up"` + `veto` + 加权评分          |
| veto 机制               | `hard_constraint` 触发时直接否决 ALLOWED            |
| 双轨判决                | System Verdict (规则评估) + Model Verdict (LLM)     |
| Diagnostic 模式         | `causal.ts`: backwardChain + but-for 测试           |
| EventStore              | `seed.ts`: 事件时间线 + 派生事实                    |

---

## 十、关键设计决策

### 决策 1：候选答案二元化

图书馆场景的答案本质是二元（允许/拒绝），这简化了：

- 评分计算（无需三档分数）
- veto 机制（直接否决 ALLOWED）
- 诊断归因（单主因清晰）

### 册策 2：派生事实前置计算

`daysSinceShelved` 必须在 `new_book_restricted` 之前计算，体现 Rule DAG 的必要性：

- 如果顺序错误，规则会报告 missingFacts
- inference_rule 的 derivedFacts 自动写入 FactStore

### 决策 3：硬约束优先于软准则

`hard_constraint` 使用 veto 机制，确保：

- 达到上限 → 直接拒绝，不参与评分
- 新书限制 → 直接拒绝，不受其他因素影响
- 逾期阻止 → 直接拒绝

`soft_criterion`（book_availability）仅影响评分，不 veto，因为：

- 图书状态可变（可能被归还）
- 不应绝对阻止，而是提示风险

### 决策 4：诊断因果链简洁

因果图只有 3 条主链：

- 新书限制链
- 逾期阻止链
- 借阅上限链

每条链都是强因果（strength: "strong"），便于：

- but-for 测试结果明确
- attribution 计算简单
- 用户理解直观

---

## 十一、扩展方向

### 11.1 增加软准则

当前场景以硬约束为主，可增加：

- `reader_credit_score`: 读者信用评分（影响借阅额度）
- `book_popularity`: 图书热门程度（影响预约优先级）
- `reservation_queue`: 预约排队人数

### 11.2 多图书馆场景

当前只有一个图书馆，可扩展：

- 多图书馆网络
- 跨馆借阅规则
- 图书调拨

### 11.3 时间窗口扩展

当前时间维度简单，可增加：

- 借阅期限（不同类型图书不同期限）
- 续借规则
- 预约有效期

---

## 十二、总结

ex3 图书馆借书场景验证了 V6 框架的以下能力：

1. **FactStore + FactBinding**：事实有归属，派生事实可追溯
2. **Rule DAG**：inference → hard → soft 的正确执行顺序
3. **veto 机制**：硬约束触发时直接否决候选
4. **MCDA 评分**：direction-aware 的加权评分
5. **双轨判决**：System + Model verdict 的 reconciliation
6. **Diagnostic 模式**：backwardChain + but-for 的归因分析

场景简洁性使其成为 V6 框架的理想入门示例，同时覆盖了框架的所有关键设计要素。
