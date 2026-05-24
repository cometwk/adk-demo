# Rule Runtime — V8 规则推理与确定性评价模块设计文档

> 本文档描述 V8 Rule 模块的核心架构：
>
> - RuleRuntime（规则执行运行时）
> - RuleRegistry（规则注册表）
> - RuleEvaluator（规则执行器）
> - MCDA Scoring（方向感知评分器）
> - Veto Engine（硬约束否决）
> - Reconciler（模型 / 系统判决协调器）
>
> 本设计延续 V6 中"System Verdict 与 LLM Verdict 双轨并存"的核心思想，但对 Rule DAG、动态推导与复杂校准机制进行大幅简化，以适配 V8 第一阶段（Phase 1）的语义推理运行时。
>
> 与 V8 已有模块的集成：
>
> - `engine/stores/fact-store` — 消费 FactStore 不可变快照
> - `engine/stores/graph-store` — 通过 GraphStore 解析实体类型
> - `engine/runtime/workspace` — 通过 Workspace 管理候选与绑定
> - `engine/runtime/types` — 复用 ToolResult、FactBinding 等公共类型
> - `ontology/registry` — 遵循 AgentRegistry 注册模式
> - `policy/context` — 通过 PolicyContext 控制规则访问权限

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
                       │ collect facts (via engine tools)
                       ▼
              ┌──────────────────┐
              │    Workspace     │
              │ (bindings +      │
              │  candidates)     │
              └────────┬─────────┘
                       │
                       │ getFacts() → immutable snapshot
                       ▼
              ┌──────────────────┐
              │   FactStore      │
              │ (Immutable Facts)│
              └────────┬─────────┘
                       │
                       │ evaluate (read-only)
                       ▼
              ┌──────────────────┐
              │ Rule Runtime     │──────────────────┐
              │ (Deterministic)  │                  │
              └────────┬─────────┘                  │
                       │                            │
         ┌─────────────┼─────────────┐              │
         ▼             ▼             ▼              ▼
   RuleRegistry   RuleEvaluator   MCDA Scoring   Veto Engine
         │             │             │              │
         └─────────────┴─────────────┴──────────────┘
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
Workspace             → 管理运行时可变状态 (bindings, candidates)
FactStore             → 提供不可变推理态事实快照
RuleRuntime           → 执行确定性规则评价
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
| 状态管理 | 直接持有 FactStore | 通过 Workspace 间接访问 |
| Tool 输出 | 自定义格式 | 统一 ToolResult<T> 信封 |
| 注册模式 | 模块级数组 | 类 AgentRegistry 注册表 |

---

# 2. RuleRuntime

## 2.1 定位

RuleRuntime 是 V8 Rule 模块的门面（Facade），负责：

1. **Rule Evaluation** - 执行规则判定
2. **Direction-aware Scoring** - 基于方向映射计算候选得分
3. **Hard Constraint Veto** - 执行硬约束否决
4. **Confidence Estimation** - 基于缺失事实估算置信度
5. **System Verdict Generation** - 输出确定性系统判决
6. **Reconciliation Support** - 为模型一致性检查提供基准

其核心原则：

```text
LLM 负责"推理与解释"
RuleRuntime 负责"确定性裁决"
```

V8 中，RuleRuntime 不调用 LLM，不允许自修改，不依赖 Agent 当前思维链。

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

## 2.2 与 Engine 的集成方式

RuleRuntime 作为 Engine 的下游消费者，其数据流为：

```text
Engine Orchestrator
  → 查询注入 → workspace.bindings
  → workspace.getFacts() → FactStore (immutable snapshot)
  → FactStore 传入 RuleRuntime
  → RuleRuntime 输出 SystemVerdict
```

RuleRuntime 不直接持有 Workspace 引用，只消费 FactStore 快照。
这保持了 V8 的"Runtime 注入、Agent 绑定、Rule 只读"三层隔离。

## 2.3 接口定义

```typescript
interface RuleRuntime {
  // 规则评估
  evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput>

  // 候选评分
  scoreCandidates(input: CandidateScoringInput): Promise<ScoredCandidate[]>

  // 系统判决
  generateVerdict(input: VerdictInput): Promise<SystemVerdict>

  // 单条规则调试
  evaluateRule(ruleId: string, ctx: RuleContext): Promise<ToolResult<RuleResult>>

  // 规则元数据
  inspectRules(filter?: RuleFilter): ToolResult<RuleMetadata[]>

  // 模型/系统一致性检查
  reconcile(input: ReconcileInput): Promise<ReconcileResult>
}
```

## 2.4 核心实现骨架

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
      // 按实体类型过滤：仅评估 appliesTo 匹配的规则
      const matchingEntities = this.filterMatchingEntities(
        rule, input.entityIds, input.context.graph
      )

      if (matchingEntities.length === 0) {
        // 全局规则（无特定实体匹配）
        const result = await this.evaluateSingleRule(rule, input.context)
        evaluated.push({ rule, result })

        if (rule.kind === 'hard_constraint' && result.triggered && rule.veto) {
          for (const label of rule.veto.candidatesByLabel) {
            vetoedLabels.add(label)
          }
        }
      } else {
        // 逐实体评估
        for (const entityId of matchingEntities) {
          const result = await this.evaluateSingleRule(
            rule, { ...input.context, entityId }
          )
          evaluated.push({ rule, entityId, result })

          if (rule.kind === 'hard_constraint' && result.triggered && rule.veto) {
            for (const label of rule.veto.candidatesByLabel) {
              vetoedLabels.add(label)
            }
          }
        }
      }
    }

    return { evaluatedRules: evaluated, vetoedLabels }
  }

  async scoreCandidates(input: CandidateScoringInput): Promise<ScoredCandidate[]> {
    return this.scorer.score(input)
  }

  async generateVerdict(input: VerdictInput): Promise<SystemVerdict> {
    const evaluation = await this.evaluateRules({
      context: input.context,
      entityIds: input.entityIds,
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

  async evaluateRule(
    ruleId: string,
    ctx: RuleContext,
  ): Promise<ToolResult<RuleResult>> {
    const rule = this.registry.get(ruleId)
    if (!rule) {
      return toolErr('NOT_FOUND', `Rule '${ruleId}' not found`, {
        expected: { availableRuleIds: this.registry.list().map(r => r.id) },
      })
    }

    try {
      const result = await rule.evaluator(ctx)
      return toolOk(result)
    } catch (err) {
      return toolErr('INTERNAL_ERROR', err instanceof Error ? err.message : String(err), {
        retryable: false,
      })
    }
  }

  inspectRules(filter?: RuleFilter): ToolResult<RuleMetadata[]> {
    const rules = this.registry.list(filter)
    return toolOk(rules.map(toMetadata))
  }

  async reconcile(input: ReconcileInput): Promise<ReconcileResult> {
    return this.reconciler.compare(input)
  }

  // ── 内部方法 ──

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

  private async filterMatchingEntities(
    rule: Rule,
    entityIds: string[],
    graph?: GraphStore,
  ): Promise<string[]> {
    if (!graph || entityIds.length === 0) return []
    const matching: string[] = []
    for (const eid of entityIds) {
      const nodeData = await graph.getNode(eid)
      if (nodeData && rule.appliesTo.includes(nodeData.type)) {
        matching.push(eid)
      }
    }
    return matching
  }
}
```

## 2.5 配置参数

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

const DEFAULT_RULE_RUNTIME_CONFIG: RuleRuntimeConfig = {
  maxRulesPerEvaluation: 100,
  enableReconciler: true,
  enableDirectionMapping: true,
  enableVeto: true,
  missingFactPenalty: 0.8,
  includeRuleTrace: true,
}
```

---

# 3. RuleRegistry

## 3.1 定位

RuleRegistry 是 V8 的规则注册中心，遵循 V8 Ontology 模块的 `AgentRegistry` 注册模式。

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

## 3.2 接口定义

```typescript
interface RuleRegistry {
  register(rule: Rule): void
  get(ruleId: string): Rule | undefined
  resolve(ruleIds?: string[]): Rule[]
  list(filter?: RuleFilter): Rule[]
  clear(): void
}
```

## 3.3 实现

```typescript
class InMemoryRuleRegistry implements RuleRegistry {
  private rules = new Map<string, Rule>()

  register(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule '${rule.id}' already registered`)
    }
    this.rules.set(rule.id, rule)
  }

  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId)
  }

  resolve(ruleIds?: string[]): Rule[] {
    if (!ruleIds || ruleIds.length === 0) {
      return Array.from(this.rules.values())
    }
    return ruleIds
      .map(id => this.rules.get(id))
      .filter((r): r is Rule => r !== undefined)
  }

  list(filter?: RuleFilter): Rule[] {
    const all = Array.from(this.rules.values())
    if (!filter) return all

    return all.filter(rule => {
      if (filter.entityType && !rule.appliesTo.includes(filter.entityType)) return false
      if (filter.kind && rule.kind !== filter.kind) return false
      if (filter.intent) {
        const keywords = INTENT_KEYWORDS[filter.intent] ?? []
        if (keywords.length > 0) {
          const text = `${rule.id} ${rule.description}`.toLowerCase()
          if (!keywords.some(k => text.includes(k))) return false
        }
      }
      return true
    })
  }

  clear(): void {
    this.rules.clear()
  }
}
```

## 3.4 RuleFilter

```typescript
type RuleFilter = {
  entityType?: string   // 按实体类型过滤
  kind?: RuleKind       // 按规则类型过滤
  intent?: string       // 按意图关键词过滤
}

const INTENT_KEYWORDS: Record<string, string[]> = {
  risk_assessment: ['risk', 'overload', 'pressure', 'decline', 'chargeback'],
  prioritization: ['priority', 'pressure'],
  diagnosis: ['cause', 'blame', 'attribution'],
  compliance: ['blacklist', 'protect', 'limit', 'expired'],
}
```

---

# 4. Rule 类型系统

## 4.1 Rule

```typescript
type Rule = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[]          // 实体类型名：在哪些类型上生效
  description: string
  requiredFacts?: RequiredFact[]
  direction: RuleDirection
  weight?: number              // 0..1; soft_criterion 使用
  veto?: VetoConfig           // hard_constraint 使用
  evaluator: (ctx: RuleContext) => Promise<RuleResult> | RuleResult
  explanation?: (result: RuleResult, ctx: RuleContext) => string
}
```

## 4.2 RuleKind

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
商户在黑名单
保护期内不可操作
超过限额
```

### soft_criterion

表示：

```text
参与加权评分
```

例如：

```text
交易活跃度高
历史违约率低
连续活跃交易
```

## 4.3 RuleDirection

```typescript
type RuleDirection =
  | 'risk_up'      // 推高风险候选得分
  | 'risk_down'    // 推低风险候选得分
  | 'neutral'      // 无方向效应
```

## 4.4 RequiredFact

```typescript
type RequiredFact = {
  property: string
  scope: 'entity' | 'type' | 'global'
}
```

声明评估此规则需要从 FactStore 中获取哪些属性。
用于缺失事实检测和置信度计算。

## 4.5 VetoConfig

```typescript
type VetoConfig = {
  candidatesByLabel: string[]  // 如 ["LOW", "ALLOWED"] — 触发时直接否决
}
```

仅 `hard_constraint` 可配置。

---

# 5. Rule Evaluator

## 5.1 定位

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
修改 FactStore / Workspace
动态生成规则
```

## 5.2 RuleContext

```typescript
interface RuleContext {
  facts: FactStore              // 来自 engine/stores/fact-store
  graph?: GraphStore            // 来自 engine/stores/graph-store
  entityId?: string             // 逐实体评估时设置
  now?: Date                    // 当前时间（可注入，便于测试）
}
```

与 V6 的差异：

```text
V6: RuleContext = { entityId, facts: FactStore, graph: GraphStore }
V8: RuleContext = { facts, graph?, entityId?, now? }
```

- `graph` 改为可选：某些规则只依赖 FactStore，不需要图查询
- 新增 `now`：便于确定性测试，避免 `new Date()` 导致不可重放

## 5.3 RuleResult

```typescript
type RuleResult = {
  triggered: boolean
  explanation?: string
  missingFacts?: MissingFact[]
  error?: string
}

type MissingFact = {
  entityId?: string
  property: string
}
```

## 5.4 执行流程

```text
1. RuleRuntime 从 RuleRegistry 获取 Rule
2. 根据 appliesTo + entityIds 过滤匹配实体
3. 构建 RuleContext (facts, graph, entityId, now)
4. 调用 rule.evaluator(ctx)
5. 返回 triggered / missingFacts / error
6. 收集 veto (hard_constraint) / score contribution (soft_criterion)
```

## 5.5 与 FactStore 的交互

V8 FactStore 使用 `entityId.property` 作为事实键：

```typescript
// Rule evaluator 读取事实的标准模式
const workload = ctx.facts.getValue(entityId, 'workload') as number | undefined
if (workload === undefined) {
  return {
    triggered: false,
    missingFacts: [{ entityId, property: 'workload' }],
  }
}
```

Rule evaluator 不关心 FactBinding 的 source / confidence / validFrom 等元数据，
只通过 `getValue()` 获取事实值。置信度由 RuleRuntime 统一计算。

---

# 6. MCDA Scoring

## 6.1 定位

MCDA（Multi-Criteria Decision Analysis）是 V8 的方向感知评分器。

其目标不是：

```text
复杂数学优化
```

而是：

```text
避免 V5 的"评分荒谬"问题
```

即：

```text
风险上升规则触发时
HIGH 候选必须获得更高支持
```

## 6.2 Direction Mapping

V8 保留 V6 中最关键的设计：

```text
Direction-aware scoring
```

### DEFAULT_DIRECTION_MAPPING

```typescript
const DEFAULT_DIRECTION_MAPPING: Record<string, Record<RuleDirection, number>> = {
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

## 6.3 为什么必须保留 Direction

Direction 不是"高级特性"。

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

## 6.4 评分公式

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

归一化：

```text
normalizedScore
  = rawScore / maxPossibleScore
```

其中：

```text
maxPossibleScore
  = Σ [ weight(rule) ]
    (所有 triggered 的 soft_criterion 之和)
```

## 6.5 评分示例

### 规则

```typescript
{
  id: 'rule_high_decline_rate',
  direction: 'risk_up',
  weight: 0.7,
  kind: 'soft_criterion',
}
```

### 事实

```text
Merch:M001.txnDeclineRate = 0.43
```

规则条件：

```text
txnDeclineRate > 0.3
```

因此：

```text
triggered = true
```

### HIGH 候选

```text
risk_up → +1
得分 = 0.7 × (+1) = +0.7
```

### LOW 候选

```text
risk_up → -0.5
得分 = 0.7 × (-0.5) = -0.35
```

最终：

```text
HIGH > LOW
```

方向语义正确传递。

## 6.6 MCDAScorer 接口

```typescript
interface MCDAScorer {
  score(input: CandidateScoringInput): ScoredCandidate[]
}

type CandidateScoringInput = {
  candidates: Candidate[]
  evaluatedRules: EvaluatedRule[]
  vetoedLabels: Set<string>
}
```

---

# 7. Veto Engine

## 7.1 定位

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

## 7.2 为什么必须保留

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
商户在黑名单
```

即使：

```text
交易历史良好
```

也不允许操作。

## 7.3 执行逻辑

```text
if (rule.kind === 'hard_constraint' && result.triggered) {
  for (const label of rule.veto.candidatesByLabel) {
    vetoedLabels.add(label)
  }
}
```

## 7.4 Veto 后的候选

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

# 8. Confidence Estimation

## 8.1 定位

V8 中：

```text
confidence 不由 LLM 自报
```

而由：

```text
事实完整度
```

决定。

## 8.2 缺失事实

规则 evaluator 在执行时，若发现 FactStore 中缺少必要事实，
应返回 `missingFacts`：

```typescript
{
  triggered: false,
  missingFacts: [{ entityId: 'Merch:M001', property: 'lastTxnDate' }],
}
```

## 8.3 置信度公式

```text
confidence
  = max(0, 1 - missingRatio × missingFactPenalty)
```

其中：

```text
missingRatio
  = rulesWithMissingFacts / totalEvaluatedRules

missingFactPenalty (默认 0.8)
  = config.missingFactPenalty
```

## 8.4 设计原因

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

# 9. System Verdict

## 9.1 定位

System Verdict 是：

```text
Rule Runtime 的最终输出
```

其目标是：

```text
提供不可篡改的系统裁决
```

## 9.2 类型定义

```typescript
type SystemVerdict = {
  candidates: ScoredCandidate[]
  recommendedCandidateId?: string
  vetoedLabels: string[]
  generatedAt: number
}
```

## 9.3 ScoredCandidate

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

## 9.4 Candidate

输入侧的候选类型：

```typescript
type Candidate = {
  candidateId: string
  label: string
}
```

## 9.5 排序逻辑

```text
1. 非 vetoed 候选优先
2. normalizedScore 降序
3. confidence 降序
```

---

# 10. Reconciler

## 10.1 定位

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

## 10.2 为什么需要 Reconciler

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

## 10.3 接口定义

```typescript
interface Reconciler {
  compare(input: ReconcileInput): Promise<ReconcileResult>
}
```

## 10.4 ReconcileInput / ReconcileResult

```typescript
type ReconcileInput = {
  modelVerdict: SemanticVerdict      // 来自 engine/agent/verdict.ts
  systemVerdict: SystemVerdict
}

type ReconcileResult = {
  agreed: boolean
  modelCandidateId?: string
  systemCandidateId?: string
  reason?: string
}
```

与 V8 Engine 的 `SemanticVerdict` 集成：

```text
engine/agent/verdict.ts 定义了 SemanticVerdict
  → { answer, entities, rationale, confidence }

Reconciler 从 SemanticVerdict.answer 提取模型结论
与 SystemVerdict.recommendedCandidateId 对比
```

## 10.5 示例

```text
LLM Verdict:
  answer: "ALLOWED"

System Verdict:
  recommendedCandidateId → label = "DENIED"
```

Reconciler 输出：

```text
agreed = false
reason = 'System vetoed candidate ALLOWED due to hard constraint'
```

---

# 11. Agent Tools

## 11.1 工具列表

| Tool | 职责 | 输出类型 |
|---|---|---|
| inspect_rules | 查看规则元信息 | ToolResult<RuleMetadata[]> |
| evaluate_rule | 执行单条规则 | ToolResult<RuleResult> |
| inspect_verdict | 查看 System Verdict | ToolResult<SystemVerdict> |
| reconcile_verdict | 检查模型/系统一致性 | ToolResult<ReconcileResult> |

所有工具遵循 V8 的 ToolResult 信封模式，与 Engine tools 保持一致。

## 11.2 inspect_rules

```typescript
const InspectRulesSchema = z.object({
  entityType: z.string().optional().describe("按实体类型过滤"),
  intent: z.string().optional().describe("按意图关键词过滤"),
  kind: z.enum(['hard_constraint', 'soft_criterion']).optional().describe('按规则类型过滤'),
})

const inspect_rules = tool({
  description:
    '列出适用于给定实体类型和/或意图的规则。返回规则元数据。' +
    '在调用 evaluate_rule 之前使用此方法，以了解哪些规则适用。',

  inputSchema: InspectRulesSchema,

  execute: async (input): Promise<ToolResult> => {
    maybeLogToolCall('inspect_rules', input, policy)
    return runtime.inspectRules(input)
  },
})
```

## 11.3 evaluate_rule

```typescript
const EvaluateRuleSchema = z.object({
  ruleId: z.string().describe('要评估的规则 ID'),
  entityId: z.string().optional().describe('要评估规则的实体 ID'),
})

const evaluate_rule = tool({
  description:
    '针对特定实体，使用当前 FactStore 评估单个规则。' +
    '返回 triggered, explanation, missingFacts。' +
    '注意：你无法控制评分权重。请记录证据而非解读分数。',

  inputSchema: EvaluateRuleSchema,

  execute: async ({ ruleId, entityId }): Promise<ToolResult> => {
    maybeLogToolCall('evaluate_rule', { ruleId, entityId }, policy)

    const ctx: RuleContext = {
      facts: workspace.getFacts(),
      graph: graphStore,
      entityId,
      now: new Date(),
    }

    return runtime.evaluateRule(ruleId, ctx)
  },
})
```

## 11.4 inspect_verdict

```typescript
const InspectVerdictSchema = z.object({
  // 无参数，返回当前 System Verdict
})

const inspect_verdict = tool({
  description:
    '查看当前 System Verdict（系统裁决）。' +
    '包含所有候选得分、否决标签和推荐候选。',

  inputSchema: InspectVerdictSchema,

  execute: async (): Promise<ToolResult> => {
    if (!currentVerdict) {
      return toolErr('PRECONDITION_FAILED', 'No verdict generated yet')
    }
    return toolOk(currentVerdict)
  },
})
```

## 11.5 reconcile_verdict

```typescript
const ReconcileVerdictSchema = z.object({
  modelAnswer: z.string().describe('模型的结论'),
})

const reconcile_verdict = tool({
  description:
    '检查模型判决与系统判决是否一致。' +
    '在输出最终结论前调用此方法，确认模型与系统裁决无冲突。',

  inputSchema: ReconcileVerdictSchema,

  execute: async ({ modelAnswer }): Promise<ToolResult> => {
    const modelVerdict: SemanticVerdict = {
      answer: modelAnswer,
      entities: workspace.candidates,
      rationale: '',
      confidence: 1.0,
    }

    if (!currentVerdict) {
      return toolErr('PRECONDITION_FAILED', 'No system verdict to reconcile against')
    }

    const result = await runtime.reconcile({
      modelVerdict,
      systemVerdict: currentVerdict,
    })

    return toolOk(result)
  },
})
```

## 11.6 工具创建入口

```typescript
export function createRuleTools(
  runtime: RuleRuntime,
  workspace: Workspace,
  graphStore: GraphStore,
  policy: PolicyContext,
) {
  let currentVerdict: SystemVerdict | null = null

  return {
    inspect_rules,
    evaluate_rule,
    inspect_verdict,
    reconcile_verdict,
  }
}
```

---

# 12. 与 Engine 的集成

## 12.1 集成点

Rule 模块与 Engine 的集成发生在 `engine/agent/executor.ts`：

```text
Executor 运行流程:
  1. Engine tools 收集事实 → workspace.bindings
  2. workspace.getFacts() → FactStore 快照
  3. (可选) RuleRuntime.generateVerdict() → SystemVerdict
  4. LLM 生成 SemanticVerdict
  5. (可选) Reconciler.compare() → ReconcileResult
  6. 输出最终结果
```

## 12.2 Rule 何时介入

Rule 模块是**可选的确定性增强层**，不是每次推理都必须执行。

两种模式：

```text
模式 A — LLM Only:
  LLM 收集事实 → LLM 输出结论

模式 B — LLM + Rule:
  LLM 收集事实 → Rule 评估 → System Verdict → Reconciler → 最终输出
```

是否启用 Rule 由 `RuntimeConfig` 控制（后续可扩展为按 Ontology 声明）。

## 12.3 Executor 集成骨架

```typescript
async function runAgentWithRules(
  task: ReasoningTask,
  engineRuntime: RuntimeOrchestrator,
  ruleRuntime: RuleRuntime,
  ontology: Ontology,
  workspace: Workspace,
  model: any,
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(ontology)

  const engineTools = createEngineTools(engineRuntime, workspace, policy)
  const ruleTools = createRuleTools(ruleRuntime, workspace, graphStore, policy)

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: task.goal,
    tools: { ...engineTools, ...ruleTools },
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  return {
    facts: workspace.getFacts().all(),
    verdict: parseVerdict(result.text),
    rawText: result.text,
  }
}
```

## 12.4 FactStore 只读原则

V8 第一阶段：

```text
Rule Runtime 不允许：

- 写入 FactStore
- 推导新事实
- 修改 Workspace.bindings
```

其职责严格限制为：

```text
Deterministic Evaluation (Read-Only Consumer)
```

## 12.5 为什么移除 Derived Facts

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

# 13. Provider 模式

## 13.1 设计原则

遵循 V8 的 Provider 模式（如 `provider/in-memory/`、`provider/rest-query/`），
Rule 模块的实现分为接口层和 Provider 层。

## 13.2 Provider 列表

| Provider | 位置 | 说明 |
|---|---|---|
| InMemoryRuleRegistry | `rule/provider/in-memory/` | 内存注册表，Phase 1 默认 |
| InMemoryRuleRuntime | `rule/provider/in-memory/` | 内存运行时，Phase 1 默认 |

Phase 1 不需要外部 Provider（如数据库持久化规则），但接口预留。

---

# 14. Phase 1 延迟能力

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
| external rule store | Phase 1 内存注册即可 |
| rule versioning/rollback | 单版本，无需多版本管理 |

---

# 15. 目录结构

```text
src/v8/rule/
├── runtime/
│   ├── rule-runtime.ts          — RuleRuntime 门面 + 接口
│   ├── scoring.ts               — MCDA 评分器 + Direction Mapping
│   ├── veto.ts                  — Veto Engine
│   ├── reconciler.ts            — Reconciler
│   └── config.ts                — RuleRuntimeConfig
│
├── registry/
│   └── registry.ts              — InMemoryRuleRegistry
│
├── types/
│   ├── rule.ts                  — Rule, RuleKind, RuleDirection, RequiredFact, VetoConfig
│   ├── context.ts               — RuleContext, RuleResult, MissingFact
│   ├── verdict.ts               — SystemVerdict, ScoredCandidate, Candidate
│   ├── scoring.ts               — CandidateScoringInput, DirectionMapping
│   └── reconcile.ts             — ReconcileInput, ReconcileResult
│
├── tools/
│   ├── rule-tools.ts            — createRuleTools 入口
│   ├── inspect-rules.ts         — inspect_rules tool
│   ├── evaluate-rule.ts         — evaluate_rule tool
│   ├── inspect-verdict.ts       — inspect_verdict tool
│   └── reconcile-verdict.ts     — reconcile_verdict tool
│
├── provider/
│   └── in-memory/
│       ├── in-memory-registry.ts    — InMemoryRuleRegistry
│       └── in-memory-runtime.ts     — InMemoryRuleRuntime
│
├── demo/
│   └── library/
│       └── rules.ts             — 图书馆领域规则示例
│
└── index.ts                     — 模块导出
```

---

# 16. 完整类型定义

## 16.1 规则核心类型

```typescript
// === rule.ts ===

type RuleKind =
  | 'hard_constraint'
  | 'soft_criterion'

type RuleDirection =
  | 'risk_up'
  | 'risk_down'
  | 'neutral'

type RequiredFact = {
  property: string
  scope: 'entity' | 'type' | 'global'
}

type VetoConfig = {
  candidatesByLabel: string[]
}

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

## 16.2 上下文与结果

```typescript
// === context.ts ===

interface RuleContext {
  facts: FactStore
  graph?: GraphStore
  entityId?: string
  now?: Date
}

type MissingFact = {
  entityId?: string
  property: string
}

type RuleResult = {
  triggered: boolean
  explanation?: string
  missingFacts?: MissingFact[]
  error?: string
}
```

## 16.3 判决与评分

```typescript
// === verdict.ts ===

type Candidate = {
  candidateId: string
  label: string
}

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

type SystemVerdict = {
  candidates: ScoredCandidate[]
  recommendedCandidateId?: string
  vetoedLabels: string[]
  generatedAt: number
}
```

## 16.4 评分输入

```typescript
// === scoring.ts ===

type EvaluatedRule = {
  rule: Rule
  entityId?: string
  result: RuleResult
}

type CandidateScoringInput = {
  candidates: Candidate[]
  evaluatedRules: EvaluatedRule[]
  vetoedLabels: Set<string>
}

type DirectionMapping = Record<string, Record<RuleDirection, number>>
```

## 16.5 协调

```typescript
// === reconcile.ts ===

type ReconcileInput = {
  modelVerdict: SemanticVerdict
  systemVerdict: SystemVerdict
}

type ReconcileResult = {
  agreed: boolean
  modelCandidateId?: string
  systemCandidateId?: string
  reason?: string
}
```

## 16.6 Runtime 输入

```typescript
type RuleEvaluationInput = {
  context: RuleContext
  entityIds: string[]
  ruleIds?: string[]
}

type RuleEvaluationOutput = {
  evaluatedRules: EvaluatedRule[]
  vetoedLabels: Set<string>
}

type VerdictInput = {
  context: RuleContext
  entityIds: string[]
  candidates: Candidate[]
  ruleIds?: string[]
}
```

## 16.7 注册与过滤

```typescript
type RuleFilter = {
  entityType?: string
  kind?: RuleKind
  intent?: string
}

type RuleMetadata = {
  id: string
  version: string
  kind: RuleKind
  appliesTo: string[]
  description: string
  direction: RuleDirection
  weight?: number
  requiredFacts?: RequiredFact[]
}
```

---

# 17. Zod Schema 定义

```typescript
// === Rule Tool Schemas ===

const InspectRulesSchema = z.object({
  entityType: z.string().optional().describe("按实体类型过滤"),
  intent: z.string().optional().describe("按意图关键词过滤"),
  kind: z.enum(['hard_constraint', 'soft_criterion']).optional().describe('按规则类型过滤'),
})

const EvaluateRuleSchema = z.object({
  ruleId: z.string().describe('要评估的规则 ID'),
  entityId: z.string().optional().describe('要评估规则的实体 ID'),
})

const InspectVerdictSchema = z.object({})

const ReconcileVerdictSchema = z.object({
  modelAnswer: z.string().describe('模型的结论'),
})
```

---

# 18. 总结

V8 Rule 模块的目标不是：

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
- FactStore 只读消费
- Deterministic Critic
- Direction Mapping
- Veto
- Reconciler
- ToolResult 统一信封
- AgentRegistry 注册模式

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
