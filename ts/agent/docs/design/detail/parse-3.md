# rules.ts 与 ruleDag.ts 生命周期分析

## 一、初始化流程

### 1.1 规则注册机制（rules.ts）

```ts
// rules.ts:77
const rules: Rule[] = []

export function registerRule(rule: Rule): void {
  rules.push(rule)
}
```

规则存储在内存数组中，通过 `registerRule` 函数动态添加。

### 1.2 Demo 场景初始化

**入口**：`src/v6/demo/ex4/seed.ts:355-370`

```ts
export function setupLibraryScenario(): {
  graph, factStore, eventStore, causalGraph
} {
  clearRules()              // 清空旧规则
  registerLibraryRules()    // 注册图书馆规则

  return {
    graph: seedLibraryGraph(),
    factStore: seedLibraryFactStore(),
    ...
  }
}
```

**规则定义**：`src/v6/demo/ex4/rules.ts:12-173`

```ts
export function registerLibraryRules(): void {
  registerRule({
    id: 'borrow_limit_exceeded',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    ...
  })

  registerRule({
    id: 'new_book_not_lendable',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    ...
  })

  registerRule({
    id: 'overdue_blocks_borrow',
    kind: 'hard_constraint',
    ...
  })

  registerRule({
    id: 'good_borrow_record',
    kind: 'soft_criterion',
    ...
  })
}
```

---

## 二、调用时机

### 2.1 调用链总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  index.ts                                                            │
│    runDecisionAssistant()                                            │
│         │                                                            │
│         ▼                                                            │
│    runTaskSession()                                                  │
│         │                                                            │
│         ├─[predictive]─────────────────────────────────────────────▶│
│         │    runPredictiveSession()                                  │
│         │         │                                                  │
│         │         ▼                                                  │
│         │    Executor (LLM)                                          │
│         │         │                                                  │
│         │         ▼                                                  │
│         │    runCritic() ───────────────────────────────────────────▶│
│         │         │                                                  │
│         │         ▼                                                  │
│         │    criticPredictive.ts                                     │
│         │         │                                                  │
│         │         ├─ evaluateRuleDag(facts, graph, entityIds)        │
│         │         │      │                                           │
│         │         │      └─ getRules()                               │
│         │         │                                                  │
│         │         ├─ getRules()                                      │
│         │         │                                                  │
│         │         └─ scoreCandidates(evaluatedRules, allRules)       │
│         │                                                            │
│         ├─[diagnostic]──────────────────────────────────────────────▶│
│         │    runDiagnosticSession()                                  │
│         │         │                                                  │
│         │         ▼                                                  │
│         │    Executor (LLM)                                          │
│         │         │                                                  │
│         │         ▼                                                  │
│         │    runCritic()                                             │
│         │         │                                                  │
│         │         ▼                                                  │
│         │    criticDiagnostic.ts                                     │
│         │                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 具体调用位置

| 函数 | 调用位置 | 用途 |
|------|---------|------|
| `getRules()` | `criticPredictive.ts:38` | MCDA 评分时获取规则元数据（weight, direction） |
| `getRules()` | `prompt.ts:8` | 构建 Executor system prompt 时生成规则摘要 |
| `getRules()` | `ruleDag.ts:52` | DAG 评估时获取所有规则 |
| `getRuleById()` | `tools/rules.ts:64` | Executor 工具 `evaluate_rule` 查询特定规则 |
| `queryRules()` | `tools/rules.ts:33` | Executor 工具 `inspect_rules` 按条件过滤规则 |
| `evaluateRuleDag()` | `criticPredictive.ts:35` | Critic 对 FactStore 执行规则评估 |
| `evaluateSingleRule()` | `tools/rules.ts:72` | Executor 工具 `evaluate_rule` 评估单条规则 |

### 2.3 Prompt 中的规则摘要

`prompt.ts:7-17`：

```ts
export function buildPredictiveSystemPrompt(task, ontology): string {
  const rules = getRules().filter((r) =>
    r.appliesTo.some((t) => task.scope.typesOfInterest.includes(t))
  )

  const rulesSummary = rules
    .map((r) =>
      `  - [${r.id}] ${r.kind.toUpperCase()} | applies to: ${r.appliesTo.join('/')} | direction: ${r.direction} | weight: ${r.weight ?? 'N/A'}\n    ${r.description}`
    )
    .join('\n')
  ...
}
```

规则摘要注入到 Executor 的 system prompt，让 LLM 知道有哪些规则可用。

---

## 三、结果去向

### 3.1 ruleDag.ts 输出

`DagEvaluationOutput` 结构：

```ts
type DagEvaluationOutput = {
  results: EvaluatedRule[]    // 每条规则的评估结果
  facts: FactStore            // 更新后的 FactStore（含 derived facts）
  vetoedLabels: Set<string>   // 被 hard_constraint 否决的候选标签
}
```

**流向**：`criticPredictive.ts:35-44`

```ts
const dagOutput = evaluateRuleDag(facts, graph, entityIds, ruleIds)

const allRules = getRules()
const scored = scoreCandidates({
  candidates,
  evaluatedRules: dagOutput.results,   // ← 传入评分器
  allRules,
  vetoedLabels: dagOutput.vetoedLabels, // ← 传入评分器
  profile: scoringProfile,
})
```

### 3.2 EvaluatedRule 结构

```ts
type EvaluatedRule = {
  ruleId: string
  entityId?: string         // 规则在哪个实体上评估
  result: RuleResult        // 触发状态、严重度、解释
  isSubsumed: boolean       // 是否被更高层规则蕴含（评分时排除）
}
```

### 3.3 评分流向（scoring.ts）

`scoreCandidates` 接收 `evaluatedRules`：

```ts
for (const evaluated of evaluatedRules) {
  if (evaluated.isSubsumed) continue  // 被蕴含的规则不计分

  const rule = ruleById.get(evaluated.ruleId)
  if (!rule || rule.kind === 'explanation_policy') continue

  if (!evaluated.result.triggered) continue

  triggeredRuleIds.push(evaluated.ruleId)

  const effectiveWeight = getEffectiveWeight(rule, profile)
  const severityMult = profile.severityWeights[evaluated.result.severity ?? 'low']
  const dirContrib = dirMapping[rule.direction] ?? 0

  rawScore += effectiveWeight * severityMult * dirContrib
}
```

评分逻辑：
1. **Veto 检查**：被 `vetoedLabels` 包含的候选直接 `-Infinity`
2. **Direction 映射**：`risk_up` 规则对 HIGH 候选加分，对 LOW 候选扣分
3. **Severity 加权**：`high` severity 权重 1.5，`medium` 1.0，`low` 0.5
4. **Subsumed 排除**：被蕴含的规则只用于解释，不参与打分

### 3.4 最终输出（SystemVerdict）

`criticPredictive.ts:62-72`：

```ts
return {
  source: 'system',
  mode: 'predictive',
  ruleSetVersion: ontology.version,
  ranking: scored,                           // ScoredCandidate[]
  recommendedCandidateId: top?.candidateId,
  confidence: top?.confidence,
  vetoedLabels: [...dagOutput.vetoedLabels],
  notes,
}
```

**流向**：`index.ts:181-194`

```ts
const criticOutput = runCritic({...})
const systemVerdict = criticOutput.verdict

// Reconciliation
const reconciliation = reconcilePredictive(systemVerdict, modelVerdict)

// 最终返回给用户
return {
  systemVerdict,
  modelVerdict,
  reconciliation,
  ...
}
```

---

## 四、核心设计要点

### 4.1 规则类型与评估顺序

`ruleDag.ts:17-23`：

```ts
const KIND_ORDER: RuleKind[] = [
  'inference_rule',      // 1. 产生 derived facts
  'hard_constraint',     // 2. 可能 veto 候选
  'soft_criterion',      // 3. 加权打分
  'conflict_policy',     // 4. 元数据
  'explanation_policy',  // 5. 元数据
]
```

拓扑排序保证：
- `inference_rule` 先评估，产生的 `derivedFacts` 写入 FactStore
- `hard_constraint` 在有 derived facts 后评估，触发则 veto
- `soft_criterion` 最后评估，用于 MCDA 打分

### 4.2 Veto 机制

`ruleDag.ts:77-79`：

```ts
if (result.triggered && rule.veto) {
  for (const label of rule.veto.candidatesByLabel) vetoedLabels.add(label)
}
```

例如 `borrow_limit_exceeded` 规则：

```ts
veto: { candidatesByLabel: ['ALLOWED'] }
```

当读者借书超过 3 本时，`ALLOWED` 候选被 veto，评分时直接 `-Infinity`。

### 4.3 Direction-aware 评分（修复 V5 bug）

V5 的 bug（`think_v6.md:50-51`）：

```ts
// V5: 硬编码 label 字符串
if (label === "HIGH") score = triggeredCount / totalCriteria
if (label === "LOW")  score = 1 - triggeredCount / totalCriteria
```

V6 改用 `directionMapping`：

```ts
// scoring.ts:43-50
directionMapping: {
  HIGH: { risk_up: +1, risk_down: -0.5, neutral: 0 },
  LOW:  { risk_up: -0.5, risk_down: +1, neutral: 0 },
}
```

`risk_up` 规则触发 → HIGH 得 +分，LOW 得 -分。不再依赖 label 字符串匹配。

### 4.4 Subsumed 规则（防止重复计数）

`think_v6.md:389-390`：

> `subsumedBy` 关系防止 demo 中那种 `engineer_burnout_threshold` × `project_team_load` × `senior_coverage` 三条规则共享同一团队负载事实造成的重复计数。

评分时：

```ts
if (evaluated.isSubsumed) continue  // 不计分，但保留用于解释
```

---

## 五、数据流图

```
┌──────────────────────────────────────────────────────────────────────┐
│  初始化阶段                                                           │
│                                                                       │
│  clearRules()                                                         │
│       │                                                               │
│       ▼                                                               │
│  registerRule(rule_1)                                                 │
│  registerRule(rule_2)                                                 │
│  registerRule(rule_3)                                                 │
│       │                                                               │
│       ▼                                                               │
│  rules: Rule[] = [rule_1, rule_2, rule_3]                             │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Executor 阶段（LLM + tools）                                         │
│                                                                       │
│  buildPredictiveSystemPrompt()                                        │
│       │                                                               │
│       ├─ getRules() → rulesSummary → system prompt                   │
│       │                                                               │
│  Executor 工具调用：                                                   │
│       │                                                               │
│       ├─ inspect_rules() → queryRules()                               │
│       │                                                               │
│       ├─ evaluate_rule(ruleId) → getRuleById()                        │
│       │                      → evaluateSingleRule()                   │
│       │                                                               │
│       ├─ bind_fact() → FactStore                                      │
│       │                                                               │
│       └─ propose_candidates() → candidates[]                          │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          │  execResult: { facts, candidates, modelVerdict }
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Critic 阶段（确定性）                                                 │
│                                                                       │
│  runCritic()                                                          │
│       │                                                               │
│       ▼                                                               │
│  runPredictiveCritic()                                                │
│       │                                                               │
│       ├─ evaluateRuleDag(facts, graph, entityIds)                     │
│       │      │                                                        │
│       │      ├─ getRules()                                            │
│       │      │                                                        │
│       │      ├─ sortRules() (拓扑排序)                                │
│       │      │                                                        │
│       │      ├─ rule.evaluator({ entityId, facts, graph })            │
│       │      │                                                        │
│       │      └─ 输出: { results, facts, vetoedLabels }                │
│       │                                                               │
│       ├─ getRules()                                                   │
│       │                                                               │
│       ├─ scoreCandidates(evaluatedRules, allRules, vetoedLabels)      │
│       │      │                                                        │
│       │      ├─ veto 检查 → -Infinity                                 │
│       │      ├─ direction 映射 → rawScore                             │
│       │      ├─ severity 加权                                         │
│       │      ├─ subsumed 排除                                         │
│       │      └─ 输出: ScoredCandidate[]                               │
│       │                                                               │
│       └─ 输出: SystemVerdict_Predictive                               │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          │  systemVerdict
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Reconciliation 阶段                                                  │
│                                                                       │
│  reconcilePredictive(systemVerdict, modelVerdict)                     │
│       │                                                               │
│       ├─ 比较 recommendedCandidateId                                  │
│       │                                                               │
│       ├─ agree? → surfacedToUser: false                               │
│       │       disagree? → surfacedToUser: true, diff                  │
│       │                                                               │
│       └─ 输出: DecisionResponse                                       │
│              { systemVerdict, modelVerdict, reconciliation }          │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
                        User UI
```

---

## 六、关键函数签名

### 6.1 rules.ts

```ts
registerRule(rule: Rule): void
getRules(): Rule[]
getRuleById(id: string): Rule | undefined
queryRules(opts: { intent?, entityType?, kind? }): Rule[]
clearRules(): void
```

### 6.2 ruleDag.ts

```ts
evaluateRuleDag(
  initialFacts: FactStore,
  graph: Graph,
  entityIds: string[],
  ruleIds?: string[]
): DagEvaluationOutput

evaluateSingleRule(
  ruleId: string,
  facts: FactStore,
  graph: Graph,
  entityId?: string
): EvaluatedRule | null
```

---

## 七、总结

| 维度 | rules.ts | ruleDag.ts |
|------|---------|------------|
| **职责** | 规则注册表（CRUD） | 规则 DAG 评估执行器 |
| **初始化** | `registerRule()` 在 demo/seed.ts | 被 Critic 调用时执行 |
| **调用者** | Prompt、Tools、Critic、Scoring | Critic（criticPredictive.ts） |
| **输出去向** | 规则元数据 → 多消费者 | EvaluatedRule[] → Scoring → SystemVerdict |
| **核心价值** | 规则可版本化、可查询 | 拓扑排序 + veto + derived facts |

V6 规则系统解决了 V5 的三个核心问题：
1. **评分荒谬**（LOW=0.67）→ direction-aware 映射
2. **重复计数** → subsumedBy 蕴含关系
3. **扁平 KV** → FactStore 结构化绑定