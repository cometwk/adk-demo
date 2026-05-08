# Rule 模块设计文档

## 1. 定位与问题背景

Rule 模块是 V6 决策助手的**确定性评价器（Deterministic Critic）**核心。它负责在 LLM（Executor）完成证据收集之后，以纯函数方式对所有候选答案打分、否决，产出一个**可重放、不可篡改**的系统判决（System Verdict），与模型判决并列呈现。

### 为什么需要一个独立的确定性评价器？

V5 的评分逻辑直接依赖 LLM 自报分数，存在两个致命缺陷：

1. **评分荒谬**：只统计触发规则数，无法区分"支持高风险"和"支持低风险"的规则。同一批规则触发后，LOW 候选可能得到比 HIGH 更高的分数。
2. **模型越权修正**：LLM 发现分数不符合直觉后会在最终答案中强行改判，绕过系统规则。

V6 通过两个机制解决这两个问题：
- **Direction 映射**：每条规则声明自己推向哪个方向（`risk_up` / `risk_down`），评分器按方向给对应候选加减分，不再盲目计数。
- **双轨判决**：系统判决由纯确定性代码计算，LLM 看不到中间分，只能在最后被告知结果是否与系统一致（Reconciler 负责对比）。

---

## 2. 设计原则

| 原则 | 做法 |
|------|------|
| **确定性** | 不调用 LLM，纯函数；相同 FactStore 输入永远产出相同判决 |
| **可审计** | 每个候选的分数都有 `triggeredRuleIds` 作为证据链；置信度由缺失事实比例计算，不是 LLM 自报 |
| **不过度工程化** | 当前 4 条规则不需要 DAG 拓扑排序；规则数量 < 50 前不引入 `dependsOn` / `subsumedBy` |
| **方向语义明确** | Direction 映射存放在全局常量（`DEFAULT_DIRECTION_MAPPING`），规则定义只关心业务方向，不关心候选细节 |
| **Veto 作为安全闸门** | `hard_constraint` 一票否决，优先于所有加权分数，防止"硬约束候选"被软指标救活 |

---

## 3. 模块文件结构

```
src/v6/ontology/
├── rules.ts      — Rule 类型定义 + 注册表
├── ruleDag.ts    — 线性规则评估（evaluateRuleDag / evaluateSingleRule）
└── scoring.ts    — MCDA 评分（Direction 映射 + Veto + 置信度）

src/v6/agent/
├── criticPredictive.ts       — Critic 入口，串联 DAG → Scoring
└── tools/rules.ts            — Agent 工具（inspect_rules / evaluate_rule）

src/v6/demo/ex4/
└── rules.ts      — Demo 规则注册（图书馆借阅场景）
```

---

## 4. 核心类型

### 4.1 `RuleKind` — 规则种类

```typescript
type RuleKind =
  | 'hard_constraint'  // 触发即否决候选（Veto）
  | 'soft_criterion'   // 触发贡献加权分数
```

两种 kind 职责严格分离：`hard_constraint` 设置红线，`soft_criterion` 调节分值。

> **延迟引入**：`inference_rule`（推导事实）、`conflict_policy`、`explanation_policy` 等在规则数量超过 50 条后再评估是否引入。

### 4.2 `RuleDirection` — 评分方向

```typescript
type RuleDirection = 'risk_up' | 'risk_down' | 'neutral'
```

规则只声明业务意图，不关心具体候选 ID。评分器通过 `DEFAULT_DIRECTION_MAPPING` 将方向翻译为各候选标签的加减分系数。

### 4.3 `Rule` — 规则结构

```typescript
type Rule = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[]        // 适用实体类型，如 ['Reader', 'Book']
  description: string
  requiredFacts: RequiredFact[]  // 声明需要从 FactStore 读取哪些属性

  direction: RuleDirection
  weight?: number            // 0..1，soft_criterion 使用；缺省 0.5

  veto?: VetoConfig          // 仅 hard_constraint 使用

  evaluator: (ctx: RuleContext) => RuleResult
  explanation: (result: RuleResult, ctx: RuleContext) => string
}
```

`evaluator` 是纯函数：从 `ctx.facts` 读取事实，返回 `triggered` + 可选的 `explanation` 和 `missingFacts`。

### 4.4 `RuleResult` — 评估结果

```typescript
type RuleResult = {
  triggered: boolean
  explanation?: string
  missingFacts?: Array<{ entityId?: string; property: string }>
}
```

`missingFacts` 不为空表示评估所需事实未在 FactStore 中找到，该条规则不参与置信度正常计算。

---

## 5. 评估流程

### 5.1 整体调用链

```
Executor (LLM) 收集事实 → FactStore
         ↓
criticPredictive.ts
  ├─ evaluateRuleDag(facts, graph, entityIds)    [ruleDag.ts]
  │    └─ rule.evaluator() × N → EvaluatedRule[]
  │                             → vetoedLabels
  └─ scoreCandidates(candidates, evaluatedRules, vetoedLabels)  [scoring.ts]
       └─ ScoredCandidate[]  →  SystemVerdict_Predictive

tools/rules.ts
  ├─ inspect_rules  →  规则元数据（只读）
  └─ evaluate_rule  →  单条规则在当前 FactStore 的评估结果（只读）
```

### 5.2 `evaluateRuleDag`：线性规则扫描

```typescript
// ruleDag.ts
export function evaluateRuleDag(
  initialFacts: FactStore,
  graph: Graph,
  entityIds: string[],
  ruleIds?: string[]          // 可选：Planner 提示的规则子集
): DagEvaluationOutput
```

**执行逻辑（按注册顺序线性扫描）：**

1. 若 `ruleIds` 非空，只评估指定规则子集
2. 对每条规则，找出 `entityIds` 中类型匹配 `rule.appliesTo` 的实体
   - 无匹配实体 → 全局评估（无 `entityId`）
   - 有匹配实体 → 对每个实体各评估一次
3. 若规则触发 (`triggered = true`) 且有 `veto` 配置，将 `veto.candidatesByLabel` 加入 `vetoedLabels`

**为什么不做拓扑排序？**

当前 Demo 有 4 条规则，无规则间推导依赖，线性扫描足够。当规则数量增长、出现 `dependsOn` 需求时，再引入 DAG。`evaluateRuleDag` 函数签名保持不变，届时只需修改内部排序逻辑。

---

## 6. MCDA 评分算法

### 6.1 Direction 映射（全局常量）

```typescript
// scoring.ts
export const DEFAULT_DIRECTION_MAPPING: DirectionMapping = {
  HIGH:        { risk_up: +1,   risk_down: -0.5, neutral: 0 },
  MEDIUM:      { risk_up: +0.3, risk_down: +0.3, neutral: 0 },
  LOW:         { risk_up: -0.5, risk_down: +1,   neutral: 0 },
  ALLOWED:     { risk_up: -0.5, risk_down: +1,   neutral: 0 },
  DENIED:      { risk_up: +1,   risk_down: -0.5, neutral: 0 },
  // ...
}
```

规则只需声明 `direction: 'risk_up'`，评分器自动知道：这条规则触发时 HIGH 候选 +1、LOW 候选 -0.5。

**设计动机**：V5 在每条规则内部硬编码候选字符串判断（`if label == "HIGH" then +1`），导致规则和候选强耦合。全局映射将方向语义与候选细节解耦，新增规则只需写业务方向，不需要了解候选 ID 体系。

### 6.2 评分公式

```
rawScore(candidate) = Σ { weight(rule) × dirContrib(rule.direction, candidate.label) }
                      for each triggered rule (non-vetoed candidates only)
```

其中 `weight(rule)` 优先取 `profile.calibration.weightOverrides[rule.id]`，再取 `rule.weight`，最后缺省 `0.5`。

### 6.3 Veto 机制

`hard_constraint` 触发时，对应候选标签进入 `vetoedLabels`。

`scoreCandidates` 中对 vetoed 候选**跳过加权计算**，直接设置：

```typescript
rawScore       = -Infinity
normalizedScore = 0
confidence      = 0
rationale       = "候选 X 被硬约束否决"
```

Veto 先于所有软指标评分执行，是系统的**安全闸门**：不论 soft_criterion 打多高的分，只要触犯了 hard_constraint，候选就出局。

**Reconciler 价值**：当 Veto 候选恰好是 LLM 的首选时，Reconciler 可以给出明确解释——"系统因硬约束否决了模型推荐的候选，请用户确认"。

### 6.4 置信度计算

```
confidence = max(0, 1 - missingRatio × 0.8)
missingRatio = 缺失事实的规则数 / 总评估规则数
```

`missingFacts` 表示 evaluator 声明需要但在 FactStore 中未找到的属性。置信度降低意味着判决依据不完整，不代表评分错误。

**为什么不交给 LLM 自报置信度？** LLM 会根据语气调整置信度，不可重放。确定性计算让置信度成为客观的数据完整度指标。

### 6.5 归一化与排序

```
normalizedScore = (rawScore - minScore) / (maxScore - minScore)
// 只在非 vetoed 候选之间归一化；vetoed 候选 normalizedScore = 0
```

最终 `ScoredCandidate[]` 按 `normalizedScore` 降序排列，vetoed 候选沉底。

---

## 7. 输出结构

### `ScoredCandidate`

| 字段 | 含义 |
|------|------|
| `candidateId` | 候选唯一 ID |
| `label` | 候选标签（如 `ALLOWED` / `DENIED`） |
| `rawScore` | 加权求和原始分（vetoed = -Infinity） |
| `normalizedScore` | 归一化到 [0, 1]（便于 UI 展示） |
| `confidence` | 置信度（由 missingRatio 计算） |
| `triggeredRuleIds` | 触发了哪些规则（证据链） |
| `blockingRuleIds` | vetoed 候选的否决标签集合 |
| `rationale` | 人类可读的评分理由 |

`triggeredRuleIds` 是解释性的核心：界面可以渲染"系统判定为 DENIED，是因为触发了'新书保护期'规则"。

---

## 8. Agent 工具接口

Executor（LLM）通过两个只读工具与规则系统交互，**无法修改规则或权重**：

### `inspect_rules`

```
输入: entityType?, intent?, kind?
输出: { rules: [{ id, version, kind, appliesTo, description, direction, weight, requiredFacts }] }
```

用于 Executor 在开始工作前了解适用规则，再决定收集哪些事实。

### `evaluate_rule`

```
输入: ruleId, entityId?
输出: { triggered, explanation, missingFacts, kind, direction }
```

用于 Executor 确认某条规则在当前证据下是否触发，返回触发状态和解释文本。

**Note 字段**：返回值附带 `"The critic uses this result for scoring. Do not attempt to infer the final score."` ——明确告知模型不要自行推断最终分数，防止 LLM 绕过 Critic 直接判决。

---

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

## 11. 扩展边界

以下功能已识别、**刻意推迟**，等规则规模超过 50 条后再引入：

| 功能 | 推迟原因 | 扩展入口 |
|------|----------|----------|
| `dependsOn` DAG 排序 | 当前规则无推导依赖关系 | 在 `ruleDag.ts` 中恢复 `sortRules` |
| `subsumedBy` 蕴含检测 | 当前无重叠规则 | `EvaluatedRule.isSubsumed` 字段保留，现为 `false` |
| `inference_rule` 推导事实 | 当前规则直接从 FactStore 读取 | 在 `RuleKind` 中补充类型，`ruleDag` 恢复 `facts.withDerived` |
| 动态权重校准 | 用户反馈体系未建立 | `ScoringProfile.calibration.weightOverrides` 接口已预留 |
| Severity 分级加权 | 4 条规则无细分需求 | 在 `RuleResult` 中补充 `severity` 字段 |
