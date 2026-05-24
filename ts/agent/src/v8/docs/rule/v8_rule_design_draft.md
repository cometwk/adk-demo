# Rule Runtime — V8 规则推理与确定性评价模块设计文档

> 本文档描述 V8 Rule Runtime 的核心架构：
>
> - Rule Runtime（规则执行运行时）
> - Deterministic Critic（确定性评价器）
> - Rule Registry（规则注册表）
> - Rule Evaluator（规则执行器）
> - MCDA Scoring（方向感知评分器）
> - Veto Engine（硬约束否决）
> - Reconciler（模型 / 系统判决协调器）
>
> 本设计延续 V6 中“System Verdict 与 LLM Verdict 双轨并存”的核心思想，但对 Rule DAG、动态推导与复杂校准机制进行大幅简化，以适配 V8 第一阶段（Phase 1）的语义推理运行时。

---

# 1. 架构总览

```text
                  User Intent
                        │
                        ▼
              ┌──────────────────┐
              │   Executor LLM   │
              │ (Semantic Agent) │
              └────────┬─────────┘
                       │
                       │ collect facts
                       ▼
              ┌──────────────────┐
              │    FactStore     │
              │ (Immutable Facts)│
              └────────┬─────────┘
                       │
                       │ evaluate
                       ▼
              ┌──────────────────┐
              │ Rule Runtime     │
              │ (Deterministic)  │
              └────────┬─────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   RuleRegistry   RuleEvaluator   MCDA Scoring
         │             │             │
         └─────────────┴─────────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ System Verdict   │
              │ (Immutable)      │
              └────────┬─────────┘
                       │ compare
                       ▼
              ┌──────────────────┐
              │ Reconciler       │
              │ (Conflict Check) │
              └────────┬─────────┘
                       │
                       ▼
                Final Agent Output
```

## 1.1 核心职责边界

```text
Executor LLM          → 收集事实 / 提出候选 / 生成解释
FactStore             → 提供不可变推理态事实
Rule Runtime          → 执行确定性规则评价
MCDA Scoring          → 基于 Direction 做方向感知评分
Veto Engine           → 执行硬约束否决
Reconciler            → 检测模型结论与系统结论冲突
```

## 1.2 与 V6 的关键差异

| 维度 | V6 | V8 Phase 1 |
|---|---|---|
| Rule DAG | 支持复杂 DAG / 推导 | 简化为线性扫描 |
| Rule Kind | 多类型扩展 | 保留 hard / soft |
| 推导规则 | inference_rule | Phase 1 移除 |
| 动态校准 | calibration / feedback | 暂不启用 |
| 规则执行 | DAG + derived facts | 纯只读 deterministic |
| 评分器 | 完整 MCDA | Direction-aware 简化版 |
| Reconciler | 完整冲突分析 | 基础一致性校验 |
| Fact 修改 | 可插入 derived facts | 严格只读 |

---

# 2. Rule Runtime

## 2.1 定位

Rule Runtime 是 V8 的新增独立模块，负责：

1. **Rule Evaluation** - 执行规则判定
2. **Direction-aware Scoring** - 基于方向映射计算候选得分
3. **Hard Constraint Veto** - 执行硬约束否决
4. **Confidence Estimation** - 基于缺失事实估算置信度
5. **System Verdict Generation** - 输出确定性系统判决
6. **Reconciliation Support** - 为模型一致性检查提供基准

其核心原则：

```text
LLM 负责“推理与解释”
Rule Runtime 负责“确定性裁决”
```

V8 中，Rule Runtime 不调用 LLM，不允许自修改，不依赖 Agent 当前思维链。

它是一个：

```text
Pure Function Runtime
```

即：

```text
(FactStore + Rules + Candidates)
          ↓
   Deterministic Verdict
```

相同输入永远得到相同结果。

---

## 2.2 接口定义

```typescript
interface RuleRuntime {
  // 规则评估
  evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput>

  // 候选评分
  scoreCandidates(input: CandidateScoringInput): Promise<ScoredCandidate[]>

  // 系统判决
  generateVerdict(input: VerdictInput): Promise<SystemVerdict>

  // 单条规则调试
  evaluateRule(ruleId: string, ctx: RuleContext): Promise<RuleResult>

  // 规则元数据
  inspectRules(filter?: RuleFilter): Promise<RuleMetadata[]>

  // 模型/系统一致性检查
  reconcile(input: ReconcileInput): Promise<ReconcileResult>
}
```

---

## 2.3 核心实现骨架

```typescript
class SemanticRuleRuntime implements RuleRuntime {
  constructor(
    private registry: RuleRegistry,
    private scorer: MCDAScorer,
    private reconciler: Reconciler,
    private config: RuleRuntimeConfig,
  ) {}

  async evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput> {
    const rules = this.registry.resolve(input.ruleIds)

    const evaluated: EvaluatedRule[] = []
    const vetoedLabels = new Set<string>()

    for (const rule of rules) {
      const result = await this.evaluateSingleRule(rule, input.context)

      evaluated.push({
        rule,
        result,
      })

      // Hard Constraint Veto
      if (rule.kind === 'hard_constraint' && result.triggered && rule.veto) {
        for (const label of rule.veto.candidatesByLabel) {
          vetoedLabels.add(label)
        }
      }
    }

    return {
      evaluatedRules: evaluated,
      vetoedLabels,
    }
  }

  async scoreCandidates(input: CandidateScoringInput): Promise<ScoredCandidate[]> {
    return this.scorer.score(input)
  }

  async generateVerdict(input: VerdictInput): Promise<SystemVerdict> {
    const evaluation = await this.evaluateRules({
      context: input.context,
      ruleIds: input.ruleIds,
    })

    const scored = await this.scoreCandidates({
      candidates: input.candidates,
      evaluatedRules: evaluation.evaluatedRules,
      vetoedLabels: evaluation.vetoedLabels,
    })

    return {
      candidates: scored,
      recommendedCandidateId: scored[0]?.candidateId,
      vetoedLabels: [...evaluation.vetoedLabels],
      generatedAt: Date.now(),
    }
  }

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    return this.reconciler.compare(input)
  }

  private async evaluateSingleRule(
    rule: Rule,
    ctx: RuleContext,
  ): Promise<RuleResult> {
    try {
      return await rule.evaluator(ctx)
    } catch (err) {
      return {
        triggered: false,
        error: String(err),
      }
    }
  }
}
```

---

## 2.4 配置参数

```typescript
interface RuleRuntimeConfig {
  // Rule Runtime
  maxRulesPerEvaluation: number      // 默认 100
  enableReconciler: boolean          // 默认 true

  // Scoring
  enableDirectionMapping: boolean    // 默认 true
  enableVeto: boolean                // 默认 true

  // Confidence
  missingFactPenalty: number         // 默认 0.8

  // Debug
  includeRuleTrace: boolean          // 默认 true
}
```

---

# 3. Rule Registry

## 3.1 定位

RuleRegistry 是 V8 的规则注册中心。

负责：

```text
规则注册
规则查找
规则过滤
规则版本管理
规则元数据暴露
```

V8 第一阶段不支持：

```text
动态热更新
规则依赖图
规则推导链
规则覆盖策略
```

---

## 3.2 接口定义

```typescript
interface RuleRegistry {
  register(rule: Rule): void

  resolve(ruleIds?: string[]): Rule[]

  get(ruleId: string): Rule | undefined

  list(filter?: RuleFilter): Rule[]
}
```

---

## 3.3 Rule 类型

```typescript
type Rule = {
  id: string

  version: string

  kind: RuleKind

  appliesTo: string[]

  description: string

  requiredFacts?: RequiredFact[]

  direction: RuleDirection

  weight?: number

  veto?: VetoConfig

  evaluator: (ctx: RuleContext) => Promise<RuleResult> | RuleResult

  explanation?: (result: RuleResult, ctx: RuleContext) => string
}
```

---

## 3.4 RuleKind

V8 第一阶段只保留两种：

```typescript
type RuleKind =
  | 'hard_constraint'
  | 'soft_criterion'
```

### hard_constraint

表示：

```text
触发即否决候选
```

例如：

```text
有逾期未还
新书保护期
超过借阅上限
```

### soft_criterion

表示：

```text
参与加权评分
```

例如：

```text
借阅历史良好
历史违约率低
连续活跃交易
```

---

# 4. Rule Evaluator

## 4.1 定位

Rule Evaluator 负责：

```text
读取 FactStore
执行规则 evaluator
收集 missing facts
生成 RuleResult
```

V8 中 Rule Evaluator：

```text
严格只读
```

禁止：

```text
插入 derived facts
修改 FactStore
动态生成规则
```

---

## 4.2 RuleContext

```typescript
interface RuleContext {
  facts: FactStore

  graph?: GraphStore

  workspace?: Workspace

  entityId?: string

  now?: Date
}
```

---

## 4.3 RuleResult

```typescript
type RuleResult = {
  triggered: boolean

  explanation?: string

  missingFacts?: MissingFact[]

  error?: string
}
```

---

## 4.4 执行流程

```text
1. Rule Runtime 获取 Rule
2. 构建 RuleContext
3. evaluator(ctx)
4. 返回 triggered / missingFacts
5. 收集 veto / score contribution
```

---

# 5. MCDA Scoring

## 5.1 定位

MCDA（Multi-Criteria Decision Analysis）是 V8 的方向感知评分器。

其目标不是：

```text
复杂数学优化
```

而是：

```text
避免 V5 的“评分荒谬”问题
```

即：

```text
风险上升规则触发时
HIGH 候选必须获得更高支持
```

---

## 5.2 Direction Mapping

V8 保留 V6 中最关键的设计：

```text
Direction-aware scoring
```

即：

```typescript
type RuleDirection =
  | 'risk_up'
  | 'risk_down'
  | 'neutral'
```

---

## 5.3 DEFAULT_DIRECTION_MAPPING

```typescript
export const DEFAULT_DIRECTION_MAPPING = {
  HIGH: {
    risk_up: +1,
    risk_down: -0.5,
    neutral: 0,
  },

  MEDIUM: {
    risk_up: +0.3,
    risk_down: +0.3,
    neutral: 0,
  },

  LOW: {
    risk_up: -0.5,
    risk_down: +1,
    neutral: 0,
  },

  ALLOWED: {
    risk_up: -0.5,
    risk_down: +1,
    neutral: 0,
  },

  DENIED: {
    risk_up: +1,
    risk_down: -0.5,
    neutral: 0,
  },
}
```

---

## 5.4 为什么必须保留 Direction

Direction 不是“高级特性”。

它是：

```text
评分系统具备业务逻辑合理性的前提
```

没有 Direction 时：

```text
系统只能统计：
触发了多少规则
```

但无法理解：

```text
这些规则到底支持 HIGH 还是 LOW
```

最终会导致：

```text
LOW 风险候选
得到比 HIGH 更高的分
```

这是 V5 最大的问题。

因此：

```text
Direction Mapping 是 V8 必保留资产
```

即使：

```text
DAG
动态校准
feedback learning
```

都被移除。

---

## 5.5 评分公式

```text
rawScore(candidate)
  = Σ [
      weight(rule)
      × dirContrib(rule.direction, candidate.label)
    ]
```

只统计：

```text
triggered = true
```

的规则。

---

## 5.6 示例：风险评估

### 规则

```text
rule_overload
```

```typescript
{
  id: 'rule_overload',
  direction: 'risk_up',
  weight: 0.8,
}
```

### 事实

```text
Alice.workload = 90
```

规则条件：

```text
workload > 85
```

因此：

```text
triggered = true
```

---

### HIGH 候选

```text
risk_up → +1
```

得分：

```text
0.8 × (+1) = +0.8
```

---

### LOW 候选

```text
risk_up → -0.5
```

得分：

```text
0.8 × (-0.5) = -0.4
```

最终：

```text
HIGH > LOW
```

方向语义正确传递。

---

# 6. Veto Engine

## 6.1 定位

Veto 是：

```text
系统安全闸门
```

其目标不是：

```text
调节分数
```

而是：

```text
定义不可突破的边界
```

---

## 6.2 为什么必须保留

即使一个候选：

```text
软指标得分极高
```

但只要违反：

```text
hard_constraint
```

它就必须：

```text
被直接淘汰
```

例如：

```text
新书保护期
```

即使：

```text
用户信用极高
```

也不能借阅。

---

## 6.3 VetoConfig

```typescript
type VetoConfig = {
  candidatesByLabel: string[]
}
```

---

## 6.4 执行逻辑

```typescript
if (
  rule.kind === 'hard_constraint' &&
  result.triggered
) {
  vetoedLabels.add(...)
}
```

---

## 6.5 Veto 后的候选

```typescript
{
  rawScore: -Infinity,
  normalizedScore: 0,
  confidence: 0,
  rationale: 'Candidate vetoed by hard constraint',
}
```

Veto 优先级：

```text
高于所有 soft score
```

---

# 7. Confidence Estimation

## 7.1 定位

V8 中：

```text
confidence 不由 LLM 自报
```

而由：

```text
事实完整度
```

决定。

---

## 7.2 缺失事实

```typescript
missingFacts?: MissingFact[]
```

例如：

```text
缺少：
merchant.lastTxnDate
```

---

## 7.3 置信度公式

```text
confidence
  = max(0, 1 - missingRatio × 0.8)
```

其中：

```text
missingRatio
  = missingRuleCount / totalRuleCount
```

---

## 7.4 设计原因

LLM 自报 confidence：

```text
不可重放
受语言风格影响
容易过度自信
```

而：

```text
数据完整度
```

是：

```text
确定性的
```

---

# 8. System Verdict

## 8.1 定位

System Verdict 是：

```text
Rule Runtime 的最终输出
```

其目标是：

```text
提供不可篡改的系统裁决
```

---

## 8.2 类型定义

```typescript
type SystemVerdict = {
  candidates: ScoredCandidate[]

  recommendedCandidateId?: string

  vetoedLabels: string[]

  generatedAt: number
}
```

---

## 8.3 ScoredCandidate

```typescript
type ScoredCandidate = {
  candidateId: string

  label: string

  rawScore: number

  normalizedScore: number

  confidence: number

  triggeredRuleIds: string[]

  blockingRuleIds?: string[]

  rationale?: string
}
```

---

## 8.4 排序逻辑

```text
1. 非 vetoed 候选优先
2. normalizedScore 降序
3. confidence 降序
```

---

# 9. Reconciler

## 9.1 定位

Reconciler 是：

```text
模型判决 与 系统判决
之间的一致性检查器
```

它不负责：

```text
重新推理
```

而是：

```text
发现冲突
```

---

## 9.2 为什么需要 Reconciler

V5 最大问题之一：

```text
LLM 发现系统评分荒谬
会强行覆盖系统结论
```

V8 中：

```text
System Verdict
成为不可篡改基准
```

Reconciler 负责：

```text
检测偏离
```

---

## 9.3 接口定义

```typescript
interface Reconciler {
  compare(input: ReconcileInput): Promise<ReconcileResult>
}
```

---

## 9.4 ReconcileResult

```typescript
type ReconcileResult = {
  agreed: boolean

  modelCandidateId?: string

  systemCandidateId?: string

  reason?: string
}
```

---

## 9.5 示例

```text
LLM Verdict:
  ALLOWED

System Verdict:
  DENIED
```

Reconciler 输出：

```text
agreed = false
reason = 'System vetoed candidate ALLOWED due to hard constraint'
```

---

# 10. Agent Tools

## 10.1 工具列表

| Tool | 职责 |
|---|---|
| inspect_rules | 查看规则元信息 |
| evaluate_rule | 执行单条规则 |
| inspect_verdict | 查看 System Verdict |
| reconcile_verdict | 检查模型/系统一致性 |

---

## 10.2 inspect_rules

```typescript
const inspect_rules = tool({
  description:
    '查看规则元信息。用于了解系统有哪些 hard constraint 与 soft criterion。',

  inputSchema: InspectRulesSchema,

  execute: async (input) => {
    return runtime.inspectRules(input)
  },
})
```

---

## 10.3 evaluate_rule

```typescript
const evaluate_rule = tool({
  description:
    '执行单条规则评估。返回 triggered、missingFacts 与 explanation。',

  inputSchema: EvaluateRuleSchema,

  execute: async (input) => {
    return runtime.evaluateRule(input.ruleId, input.context)
  },
})
```

---

## 10.4 reconcile_verdict

```typescript
const reconcile_verdict = tool({
  description:
    '检查模型判决与系统判决是否一致。',

  inputSchema: ReconcileVerdictSchema,

  execute: async (input) => {
    return runtime.reconcile(input)
  },
})
```

---

# 11. Agent 运行模型

## 11.1 整体流程

```text
Step 1
Executor LLM 收集事实

Step 2
Runtime 自动注入 FactStore

Step 3
Rule Runtime 执行规则评估

Step 4
MCDA 评分

Step 5
Veto 过滤

Step 6
生成 System Verdict

Step 7
Reconciler 检查 LLM Verdict

Step 8
输出最终结果
```

---

## 11.2 典型执行路径

用户问题：

```text
这个商户是否应该被列入高风险？
```

---

### Step 1 — Agent 收集事实

```text
merchant.txnDeclineRate = 0.43
merchant.chargebackRate = 0.12
merchant.lastTxnDate = 2026-05-01
```

---

### Step 2 — Rule Runtime 执行规则

规则：

```text
high_decline_rate
```

```typescript
{
  direction: 'risk_up',
  weight: 0.7,
}
```

规则触发：

```text
0.43 > 0.3
```

因此：

```text
triggered = true
```

---

### Step 3 — MCDA 评分

HIGH：

```text
+0.7
```

LOW：

```text
-0.35
```

---

### Step 4 — Veto 检查

若触发：

```text
merchant_blacklisted
```

则：

```text
LOW vetoed
```

---

### Step 5 — System Verdict

```text
HIGH ranked first
```

---

### Step 6 — Reconciler

若 LLM 输出：

```text
LOW RISK
```

则：

```text
agreed = false
```

---

# 12. FactStore 集成

## 12.1 定位

Rule Runtime 不拥有状态。

它只：

```text
消费 FactStore
```

---

## 12.2 只读原则

V8 第一阶段：

```text
Rule Runtime 不允许：

- 写入 FactStore
- 推导新事实
- 修改 bindings
```

其职责严格限制为：

```text
Deterministic Evaluation
```

---

## 12.3 为什么移除 Derived Facts

V6 中：

```text
Rule → Derived Fact → New Rule
```

形成复杂 DAG。

但第一阶段：

```text
规则数量极少
```

因此：

```text
线性扫描足够
```

避免：

```text
DAG
拓扑排序
循环推导
```

带来的复杂度。

---

# 13. Phase 1 延迟能力

以下能力已识别，但 Phase 1 不实现：

| 功能 | 原因 |
|---|---|
| Rule DAG | 当前规则规模太小 |
| dependsOn | 无复杂推导链 |
| inference_rule | 只读 deterministic 更稳健 |
| dynamic calibration | 用户反馈体系尚未建立 |
| feedback learning | 无在线学习需求 |
| rule hot reload | Phase 1 静态规则即可 |
| severity weighting | 当前 weight 已足够 |
| temporal reasoning | 时序推理留到 Phase 2 |
| rule subsumption | 暂无规则重叠问题 |

---

# 14. 目录结构

```text
src/v8/rule/
├── runtime/
│   ├── rule-runtime.ts          — Rule Runtime 核心
│   ├── scoring.ts               — MCDA 评分器
│   ├── veto.ts                  — Hard Constraint Engine
│   ├── reconciler.ts            — 模型/系统协调器
│   └── config.ts                — RuntimeConfig
│
├── registry/
│   ├── registry.ts              — RuleRegistry
│   └── builtin-rules.ts         — 系统规则注册
│
├── evaluator/
│   ├── evaluator.ts             — Rule Evaluator
│   └── context.ts               — RuleContext
│
├── types/
│   ├── rule.ts                  — Rule 类型
│   ├── verdict.ts               — Verdict 类型
│   ├── scoring.ts               — Score 类型
│   └── reconcile.ts             — Reconcile 类型
│
├── tools/
│   ├── inspect-rules.ts
│   ├── evaluate-rule.ts
│   ├── inspect-verdict.ts
│   └── reconcile-verdict.ts
│
└── demo/
    └── library/
        └── rules.ts
```

---

# 15. 总结

V8 Rule Runtime 的目标不是：

```text
做一个复杂规则引擎
```

而是：

```text
为 Semantic Runtime 提供：

- 可重放
- 不可篡改
- 符合业务直觉
- 可解释
- 可审计

的确定性裁决层
```

Phase 1 的核心取舍：

```text
保留：
- FactStore
- Deterministic Critic
- Direction Mapping
- Veto
- Reconciler

移除：
- Rule DAG
- Derived Facts
- Dynamic Calibration
- Feedback Learning
- Complex MCDA
```

最终形成：

```text
LLM for reasoning
Rules for deterministic judgment
```

的双轨架构。

