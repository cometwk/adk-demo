# Rule 模块(简化版)

即：Ontology 中的 **C** 约束系统.

- see [清晰完备的设计文档](./2-rule-design.md) 

## 9. Demo 示例（图书馆借阅场景）

`src/v6/demo/ex4/rules.ts` 注册 4 条规则，覆盖两种 kind：

| 规则 ID | Kind | Direction | Veto 目标 | 核心逻辑 |
|---------|------|-----------|-----------|----------|
| `borrow_limit_exceeded` | `hard_constraint` | `risk_up` | `ALLOWED` | 当前借书数 ≥ 3 |
| `new_book_not_lendable` | `hard_constraint` | `risk_up` | `ALLOWED` | 上架天数 < 7 |
| `overdue_blocks_borrow` | `hard_constraint` | `risk_up` | `ALLOWED` | 有逾期未还 |
| `good_borrow_record` | `soft_criterion` | `risk_down` | — | 借书数=0 且无逾期 |

**典型场景**：读者当前借了 3 本书，申请再借一本。

1. `evaluateRuleDag` 对 Reader 实体评估 → `borrow_limit_exceeded.triggered = true`
2. `vetoedLabels = Set { "ALLOWED" }`
3. `scoreCandidates` 中 ALLOWED 候选直接被 veto，rawScore = -Infinity
4. `SystemVerdict.recommendedCandidateId` = DENIED 候选

`src/v6/demo/ex4/scoring.ts` 定义了 MCDA 配置:

```ts
  {
    ALLOWED: { risk_up: -0.5, risk_down: +1, neutral: 0 },
    DENIED: { risk_up: +1, risk_down: -0.5, neutral: 0 },
  }
```

---

## 10. 端到端执行追踪

以图书馆借阅场景为例，用两个对比场景完整模拟执行过程，展示 **软评分路径** 和 **Veto 路径** 的区别。

### 前提：初始状态

```
FactStore:
  alice.currentBorrowCount = 0
  alice.hasOverdueBook     = false
  clean_code.daysOnShelf   = 30    ← 场景 A
  typescript.daysOnShelf   = 3     ← 场景 B（新书）

Graph nodes:
  alice      → type: Reader
  clean_code → type: Book
  typescript → type: Book

Candidates:
  { id: "cand_allowed", label: "ALLOWED" }
  { id: "cand_denied",  label: "DENIED"  }
```

---

### 场景 A：借阅资质良好，申请普通旧书

**Step 1 — evaluateRuleDag**

`entityIds = ["alice", "clean_code"]`，按注册顺序线性扫描 4 条规则：

| # | ruleId | appliesTo | 匹配实体 | 取值 | triggered | veto 触发 |
|---|--------|-----------|----------|------|-----------|-----------|
| 1 | `borrow_limit_exceeded` | Reader | alice | count=0, 0≥3? | **false** | — |
| 2 | `new_book_not_lendable` | Book | clean_code | days=30, 30<7? | **false** | — |
| 3 | `overdue_blocks_borrow` | Reader | alice | hasOverdue=false | **false** | — |
| 4 | `good_borrow_record` | Reader | alice | count=0 && overdue=false | **true** | — |

```
vetoedLabels = {}（空集，无 hard_constraint 触发）
```

**Step 2 — scoreCandidates**

方向映射查表（`DEFAULT_DIRECTION_MAPPING`）：

```
ALLOWED → { risk_up: -0.5, risk_down: +1,   neutral: 0 }
DENIED  → { risk_up: +1,   risk_down: -0.5, neutral: 0 }
```

对每个候选逐规则累加（只有 triggered=true 的规则贡献分数）：

**ALLOWED 候选**：

| ruleId | triggered | weight | direction | dirContrib | 贡献 |
|--------|-----------|--------|-----------|------------|------|
| `borrow_limit_exceeded` | false | — | — | — | 0 |
| `new_book_not_lendable` | false | — | — | — | 0 |
| `overdue_blocks_borrow` | false | — | — | — | 0 |
| `good_borrow_record` | **true** | 0.5 | risk_down | +1 | **+0.50** |

```
rawScore(ALLOWED) = 0.50
missingRatio = 0/4 = 0  →  confidence = 1.0
```

**DENIED 候选**：

| ruleId | triggered | weight | direction | dirContrib | 贡献 |
|--------|-----------|--------|-----------|------------|------|
| `good_borrow_record` | **true** | 0.5 | risk_down | -0.5 | **-0.25** |

```
rawScore(DENIED) = -0.25
confidence = 1.0
```

**Step 3 — 归一化**

```
有效候选（非 vetoed）：ALLOWED(0.50)、DENIED(-0.25)
maxScore = 0.50，minScore = -0.25，range = 0.75

normalizedScore(ALLOWED) = (0.50 − (−0.25)) / 0.75 = 1.00
normalizedScore(DENIED)  = (−0.25 − (−0.25)) / 0.75 = 0.00
```

**Step 4 — SystemVerdict**

```
ranking:
  1. ALLOWED  rawScore=+0.50  normalizedScore=1.00  confidence=1.0
  2. DENIED   rawScore=-0.25  normalizedScore=0.00  confidence=1.0

recommendedCandidateId: "cand_allowed"
confidence:  1.0
vetoedLabels: []
notes:       []
triggeredRuleIds(ALLOWED): ["good_borrow_record"]
rationale:   "ALLOWED 由以下规则支持：读者当前借书数为 0 且无逾期历史，表明借阅习惯良好"
```

> 结论：good_borrow_record（direction=risk_down）为 ALLOWED 加了 +0.5 分，同时为 DENIED 扣了 -0.25 分，使得两者的归一化分数拉开到 1.0 vs 0.0，方向语义完整传递。

---

### 场景 B：申请新书（上架仅 3 天）

只改变一个事实：`typescript.daysOnShelf = 3`，实体换为 `typescript`。

**Step 1 — evaluateRuleDag**

| # | ruleId | 匹配实体 | 取值 | triggered | veto 触发 |
|---|--------|----------|------|-----------|-----------|
| 1 | `borrow_limit_exceeded` | alice | count=0, 0≥3? | false | — |
| 2 | `new_book_not_lendable` | typescript | days=3, 3<7? | **true** | **ALLOWED** |
| 3 | `overdue_blocks_borrow` | alice | hasOverdue=false | false | — |
| 4 | `good_borrow_record` | alice | count=0 && overdue=false | true | — |

```
vetoedLabels = { "ALLOWED" }
```

**Step 2 — scoreCandidates**

```
ALLOWED：命中 vetoedLabels → 跳过加权计算，直接设置：
  rawScore       = -Infinity
  normalizedScore = 0
  confidence      = 0
  rationale       = "候选 ALLOWED 被硬约束否决"
```

DENIED 的加权计算与场景 A 相同（`good_borrow_record` 触发，rawScore = -0.25），但此时有效候选只剩 DENIED 一个：

```
valid = [DENIED(-0.25)]
maxScore = minScore = -0.25，range = 0 → 取 1
normalizedScore(DENIED) = (-0.25 - (-0.25)) / 1 = 0.00
```

**Step 3 — SystemVerdict**

```
ranking:
  1. DENIED   rawScore=-0.25  normalizedScore=0.00  confidence=1.0
  2. ALLOWED  rawScore=-∞     normalizedScore=0.00  confidence=0   ← vetoed，沉底

recommendedCandidateId: "cand_denied"
confidence:  1.0
vetoedLabels: ["ALLOWED"]
notes:       ["Hard constraint veto eliminated: ALLOWED"]
```

> 结论：`new_book_not_lendable`（hard_constraint）触发后，无论 `good_borrow_record` 给 ALLOWED 打了多少软分，ALLOWED 都已被直接排除。Veto 是先于加权评分执行的安全闸门。

---

### 两种路径对比

| | 场景 A（普通旧书） | 场景 B（新书） |
|--|---|---|
| hard_constraint 触发 | 无 | `new_book_not_lendable` |
| soft_criterion 触发 | `good_borrow_record` | `good_borrow_record` |
| vetoedLabels | `{}` | `{ "ALLOWED" }` |
| ALLOWED 最终结果 | rawScore=+0.50，**排第一** | rawScore=**-∞**，被否决 |
| DENIED 最终结果 | rawScore=-0.25，排第二 | rawScore=-0.25，**排第一** |
| 决策路径 | 软评分决定 | Veto 决定，软分数不参与 |

---
