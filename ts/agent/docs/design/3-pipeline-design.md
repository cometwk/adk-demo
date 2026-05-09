# Pipeline 模块设计文档

## 1. 定位与问题背景

Pipeline 模块是 V6 决策助手的**推理执行层**。它将用户的自然语言提问转化为结构化决策任务，驱动 LLM 在图上受控推理，最终产出一个**双轨判决 + 冲突暴露 + 反事实入口**的完整决策响应。

### 为什么需要一个端到端 Pipeline？

V5 的推理链路只有"一段式 LLM loop"——把 goal 和 entryEntities 塞进 prompt，LLM 自由跑 tool-calling，最终自行总结。这导致三个问题：

1. **入口硬编码**：调用方必须手动传 entryEntities，用户说"小明能借书吗？"需要人工翻译成 `['xiao_ming', 'book_ai_history']`。
2. **LLM 无约束**：从探索到打分再到判决，全由同一个 LLM loop 完成，模型可以看到中间分数、可以自行覆盖系统结论。
3. **无冲突检测**：当规则系统和模型判断不一致时，模型静默胜出，用户不知道存在分歧。

V6 Pipeline 把"一段式 loop"拆成**五阶段流水线**，每个阶段有明确边界和职责：

```
用户自然语言
    │
    ▼
Frontend（意图识别 + 实体链接 + 澄清）
    │ DecisionTask
    ▼
Planner（轻量 LLM 调用，只读，不调工具）
    │ ExplorationPlan / DiagnosticPlan
    ▼
Executor（LLM + tools，受控探索图 + 绑定事实）
    │ FactStore + Candidates/Causes + ModelVerdict
    ▼
Critic（纯确定性，Rule DAG + MCDA / Attribution）
    │ SystemVerdict
    ▼
Reconciler（比较双轨判决，生成最终响应）
    │ DecisionResponse
    ▼
用户 UI
```

---

## 2. 设计原则

| 原则 | 做法 |
|------|------|
| **阶段边界清晰** | Frontend 输出 DecisionTask、Executor 输出 ModelVerdict + FactStore、Critic 输出 SystemVerdict——每个阶段的输入输出是确定类型 |
| **Critic 必须确定性** | 不调用 LLM，纯函数；相同 FactStore 输入永远产出相同判决 |
| **LLM 不看中间分** | Executor prompt 明确写"最终评分由系统完成"，防止模型绕过 Critic |
| **双模式对称** | Predictive 和 Diagnostic 共享同一 Pipeline 骨架，仅在 Executor 工具集、Critic 评分算法、Prompt 三处分叉 |
| **冲突必须 surface** | Reconciler 检测双轨判决分歧时强制展示给用户，不允许任何一方静默胜出 |
| **澄清优先于猜测** | Frontend 在意图置信度 < 0.6 或实体歧义 > 0.5 时返回结构化选择题，而不是猜一个答案往下跑 |

---

## 3. 模块文件结构

```
src/v6/
├── index.ts                       — 顶层入口 runDecisionAssistant，模式路由
│
├── frontend/
│   ├── index.ts                   — frontEnd()：意图 + 实体链接 + 澄清 → DecisionTask
│   ├── intent.ts                  — classifyIntent()：双通道意图识别（规则 + LLM fallback）
│   ├── entityLinker.ts            — linkEntities()：NER + 实体解析 + 歧义评分
│   └── clarify.ts                 — 结构化澄清问题生成
│
├── agent/
│   ├── prompt.ts                  — 四套 Prompt：predictive/diagnostic × system/planner
│   ├── planner.ts                 — runPlanner()：预测模式探索计划
│   ├── plannerDiagnostic.ts       — runDiagnosticPlanner()：诊断模式回溯计划
│   ├── executor.ts                — runPredictiveExecutor() / runDiagnosticExecutor()
│   ├── critic.ts                  — runCritic()：模式路由入口
│   ├── criticPredictive.ts        — 确定性 Predictive Critic（Rule DAG + MCDA）
│   ├── criticDiagnostic.ts        — 确定性 Diagnostic Critic（Attribution + but-for）
│   ├── reconciler.ts              — reconcilePredictive() / reconcileDiagnostic()
│   └── tools/
│       ├── graph.ts               — inspect_node / query_neighbors / search_nodes
│       ├── method.ts              — call_method / describe_method（含 precondition 校验）
│       ├── facts.ts               — bind_fact / lookup_fact / aggregate_facts
│       ├── rules.ts               — inspect_rules / evaluate_rule
│       ├── candidates.ts          — propose_candidates / record_evidence / declare_uncertainty
│       ├── counterfactual.ts      — simulate（what_if / but_for）
│       ├── events.ts              — query_events / walk_causal_graph / propose_causes / record_event
│       └── ontology.ts            — inspect_schema
│
├── ontology/
│   └── decision.ts                — DecisionTask / Verdict / Reconciliation / DecisionWorkspace 类型
│
└── runtime/
    └── trace.ts                   — DecisionTrace 持久化（审计 + 反馈闭环）
```

---

## 4. 核心类型

### 4.1 `DecisionTask` — 决策任务

```typescript
type DecisionTask = {
  taskId: string
  mode: DecisionMode              // 'predictive' | 'diagnostic'
  intent: DecisionIntent          // 细粒度意图
  goal: string                    // 用户原始问题
  scope: { typesOfInterest?: string[]; maxGraphDepth?: number; maxNodes?: number }
  policyCtx: PolicyContext

  // predictive
  entryEntities?: string[]

  // diagnostic (V6.5)
  outcome?: OutcomeEvent
  timeWindow?: { from: string; to: string }
}
```

`DecisionTask` 是 Frontend 的输出、后续所有阶段的输入。它把用户的自然语言问题结构化为机器可路由的任务描述。

### 4.2 `DecisionIntent` — 意图矩阵

```typescript
type DecisionIntent =
  // predictive
  | 'risk_assessment' | 'prioritization' | 'recommendation'
  | 'capacity_planning' | 'what_if_planning'
  // diagnostic
  | 'rca' | 'post_mortem' | 'anomaly_explanation'
  | 'regression_attribution' | 'incident_diagnosis'
  | 'unknown'
```

Frontend 先做 mode 一级分类（predictive vs diagnostic），再做细粒度 intent 分类。不同 intent 影响 Planner 的探索策略和 Executor 的 prompt。

### 4.3 `DecisionResponse` — 最终响应

```typescript
type DecisionResponse = {
  taskId: string
  mode: DecisionMode
  systemVerdict: SystemVerdict_Predictive | DiagnosticVerdict
  modelVerdict: ModelVerdict_Predictive | DiagnosticVerdict
  reconciliation: Reconciliation
  evidence: Evidence[]
  uncertainties: Uncertainty[]
  counterfactuals: CounterfactualOffer[]
  traceId: string
  feedbackToken: string
}
```

响应同时包含双轨判决（system + model）、冲突分析（reconciliation）、反事实入口（counterfactuals）和反馈通道（feedbackToken）。

### 4.4 `Reconciliation` — 冲突调和

```typescript
type Reconciliation = {
  agree: boolean
  surfacedToUser: boolean
  diff?: {
    systemPick: string
    modelPick: string
    likelyCause: ReconciliationLikelyCause
    explanation: string
  }
}

type ReconciliationLikelyCause =
  | 'missing_facts'              // 系统缺失事实导致低置信
  | 'rule_weight_misalignment'   // 规则权重与模型直觉不匹配
  | 'model_overrides_system'     // 模型选了更高风险选项
  | 'system_too_coarse'          // 规则粒度不足
  | 'attribution_rank_mismatch'  // 诊断归因排名不同
  | 'unknown'
```

一致时 `surfacedToUser = false`（UI 可简短渲染）；不一致时 `surfacedToUser = true`（UI 必须展示冲突 + 反馈通道）。

### 4.5 `DecisionWorkspace` — 运行时工作区

```typescript
class DecisionWorkspace {
  readonly mode: DecisionMode
  addCandidate(label, description): CandidateAnswer    // predictive
  addCause(input): CandidateCause                      // diagnostic
  addEvidence(input): Evidence
  addUncertainty(input): Uncertainty
  linkEvidenceToCandidate(candidateId, evidenceId): boolean
}
```

`DecisionWorkspace` 是 Executor 运行期间的可变状态容器。候选、证据、不确定性在 tool 调用过程中累积，最终交给 Critic 和 Reconciler 消费。

---

## 5. 阶段 1：Frontend（意图识别 + 实体链接 + 澄清）

### 5.1 整体流程

```
userQuery + FrontEndContext
    │
    ├── Step 1: classifyIntent(userQuery)
    │           规则匹配 → LLM fallback → IntentResult { mode, intent, confidence }
    │
    ├── Step 2: linkEntities(userQuery, graph, config)
    │           NER 提取 → 实体解析 → 歧义评分 → LinkEntitiesResult { bestPick, ambiguity }
    │
    ├── Step 3: 置信度/歧义判断
    │           confidence < 0.6 或 ambiguity > 0.5 → 返回 ClarifyQuestion[]
    │
    └── Step 4: 构造 DecisionTask
                合并 intent + entities + scope + policy → DecisionTask
```

### 5.2 意图识别：双通道

意图分类采用**两遍策略**（Two-pass）：

**Pass 1：规则匹配（快速、确定性）**

```typescript
const INTENT_RULES: IntentRule[] = [
  { intent: 'risk_assessment', mode: 'predictive', keywords: ['风险', 'risk', '评估', ...], weight: 1.0 },
  { intent: 'rca',             mode: 'diagnostic', keywords: ['原因', '为什么', '导致', ...], weight: 1.0 },
  // ...
]
```

每条规则的得分 = `weight × matchedKeywordsCount`，归一化后得到 `confidence`。

**Pass 2：LLM Fallback（当 confidence < 0.8）**

```typescript
if (ruleResult.confidence < 0.8) {
  ruleResult = await classifyIntentWithLLM(userQuery, ruleResult)
}
```

LLM 以 `generateObject` 方式输出结构化 `{ mode, intent, confidence }`，利用规则系统的初步判断作为提示。

**设计动机**：大多数查询能被关键词规则高置信命中（"风险" → `risk_assessment`），只有模糊查询才需要 LLM，这既省 token 又保持确定性。

### 5.3 实体链接：NER + 解析 + 歧义

**Phase 1：NER（命名实体识别）**

两种提取器按优先级：
1. **规则提取**：书名号 `《...》`、引号字符串、与已知节点 ID 的精确匹配
2. **LLM 提取**：当规则提取为空时，调用 LLM 做 NER，提示中包含可用的实体类型名

**Phase 2：解析（Mention → EntityId）**

按优先级尝试四种匹配：

| 优先级 | 匹配方式 | 置信度 | 示例 |
|--------|----------|--------|------|
| 1 | 精确匹配（ID 直接命中） | 1.0 | `"xiao_ming"` → `xiao_ming` |
| 2 | 别名表（中文名 → ID） | 0.95 | `"小明"` → `xiao_ming` |
| 3 | 子字符串匹配（上下文实体优先） | 0.70-0.85 | `"ai_history"` → `book_ai_history` |
| 4 | 类型过滤 + 名称相似度 | 0.70 | hint=`Book` + `"人工智能简史"` → 匹配 |

**Phase 3：歧义评分**

```
ambiguity = min(1, (multiCandidateCount + unlinkedCount × 2) / (mentionCount × 2))
```

多候选实体和未链接实体都会抬高歧义分数。`ambiguity > 0.5` 触发澄清。

### 5.4 结构化澄清

澄清不是自由对话，而是**结构化选择题**：

| 类型 | 触发条件 | 示例 |
|------|----------|------|
| `entity_select` | 实体有多个候选 | "小明" 匹配到多个：A. xiao_ming (Reader) B. xiao_ming_2 (Reader) |
| `intent_confirm` | 意图置信度低 | 我理解你的问题是"风险评估"，对吗？ |
| `time_window` | 诊断模式缺时间窗口 | 请指定归因分析的时间范围 |
| `outcome_describe` | 诊断模式缺 outcome | 请描述已经发生的事件 |

---

## 6. 阶段 2：Planner（探索计划）

### 6.1 职责与约束

Planner 做一次**轻量 LLM 调用**，产出探索计划。核心约束：

- **不能调用工具**：Planner 只读 Ontology + DecisionTask，不访问图数据
- **不能执行半步**：输出必须是纯 plan，不能夹带执行结果
- **有 fallback**：LLM 输出解析失败时，退化为"从 entryEntities 向外展开 2 层"

### 6.2 Predictive：ExplorationPlan

```typescript
type ExplorationPlan = {
  expectedSubgraphs: SubgraphSpec[]     // 需要展开的子图
  methodsToInvoke: MethodInvocationHint[]  // 可能需要调用的方法
  rulesetOfInterest: string[]           // 最相关的规则 ID
  estimatedSteps: number                // 预估 tool call 次数
}
```

Planner 根据 Ontology 中的类型/关系结构，预判 Executor 需要探索哪些子图、调用哪些方法。这避免了 Executor "边走边发现"的反复——Planner 应该在第一步就预判完整的探索范围。

### 6.3 Diagnostic：DiagnosticPlan

```typescript
type DiagnosticPlan = {
  rootOutcome: string           // outcome 事件类型
  backwardChains: string[]      // 从 outcome 回溯的因果链模式
  eventsToReconstruct: string[] // 需要 query_events 检索的事件类型
  candidateCauseSpace: string[] // 候选原因空间
}
```

诊断模式的 Planner 沿因果图反向规划，列出需要检索的事件类型和候选原因空间。

---

## 7. 阶段 3：Executor（LLM 受控推理）

### 7.1 职责边界

Executor 是 Pipeline 中唯一的 LLM-driven 阶段。其职责被**严格限定**为：

- 探索图（`inspect_node` / `query_neighbors` / `search_nodes`）
- 绑定事实（`bind_fact` / `lookup_fact` / `aggregate_facts`）
- 提议候选/原因（`propose_candidates` / `propose_causes`）
- 记录证据和不确定性（`record_evidence` / `declare_uncertainty`）
- 给出综合理由（`ModelVerdict`）

**明确不做的事**：
- 不打分——评分由 Critic 完成
- 不看中间分——prompt 写明"最终评分由系统完成"
- 不做最终判决——只输出 ModelVerdict，与 SystemVerdict 并列

### 7.2 工具集差异

| 工具 | Predictive | Diagnostic |
|------|:----------:|:----------:|
| inspect_node / query_neighbors / search_nodes | ✓ | ✓ |
| bind_fact / lookup_fact / aggregate_facts | ✓ | ✓ |
| call_method / describe_method | ✓ | — |
| inspect_rules / evaluate_rule | ✓ | — |
| propose_candidates / record_evidence | ✓ | ✓ |
| declare_uncertainty / list_workspace | ✓ | ✓ |
| simulate (what_if / but_for) | ✓ | ✓ |
| query_events / walk_causal_graph | — | ✓ |
| propose_causes / record_event | — | ✓ |

诊断模式不注册 `call_method` 和 `inspect_rules`，因为不需要评估规则触发；取而代之注册 `query_events` 和 `walk_causal_graph` 以重建事件时间线和因果链。

### 7.3 Prompt 设计

Predictive prompt 核心指令：

1. **事实收集**：每次读取属性后立即 `bind_fact`；调用方法前先 `lookup_fact` 确认参数
2. **候选与证据**：第一步 `propose_candidates` 声明候选，收集到证据时 `record_evidence`
3. **评分边界**：不负责计算最终分数，不需要知道规则权重数值
4. **输出格式**：以 JSON 输出 `ModelVerdict`，严禁在 JSON 之外给出判定

Diagnostic prompt 增加四条守则：

1. **Outcome 已发生**——不要推断"是否"，只推断"为什么"
2. **相关 ≠ 因果**——必须通过 `walk_causal_graph` 找到已登记的因果路径
3. **多因可以并存**——`propose_causes` 可提出多个候选原因
4. **警惕后见之明偏差**——不因"最显眼"就给最高分

### 7.4 执行控制

```typescript
const result = await generateText({
  model,
  system: systemPrompt,
  prompt: userMessage,
  tools,
  stopWhen: stepCountIs(30),  // 最多 30 步 tool call
  temperature: 0,
})
```

`stepCountIs(30)` 作为 budget 上限，防止 LLM 无限循环。`temperature: 0` 保证确定性。

### 7.5 ModelVerdict 解析

Executor 完成后从最后一条 assistant 消息中解析 JSON：

- **Predictive**：提取 `recommendedCandidateId` + `confidence` + `rationale` + `citedEvidenceIds` + `citedRuleIds`
- **Diagnostic**：提取 `rankedCauses` + `overdetermined` + `rationale`

解析失败时 fallback：选择第一个候选，`confidence = 0.3`，标注 "Failed to parse"。

---

## 8. 阶段 4：Critic（确定性判决）

### 8.1 模式路由

```typescript
function runCritic(input: CriticInput): CriticOutput
```

`runCritic` 根据 `task.mode` 分发到 `runPredictiveCritic` 或 `runDiagnosticCritic`。

### 8.2 Predictive Critic

执行步骤（全部确定性，无 LLM）：

```
Step 1: evaluateRuleDag(facts, graph, entityIds)
        → EvaluatedRule[] + vetoedLabels

Step 2: scoreCandidates(candidates, evaluatedRules, vetoedLabels, profile?)
        → ScoredCandidate[]（Direction 映射 + Veto + 置信度）

Step 3: 选 top non-vetoed candidate → recommendedCandidateId

Step 4: 输出 SystemVerdict_Predictive
        { ranking, recommendedCandidateId, confidence, vetoedLabels, notes }
```

详细评分算法参见 `2-rule-design.md`。

### 8.3 Diagnostic Critic

执行步骤（全部确定性，无 LLM）：

```
Step 1: scoreCauses(candidateCauses, outcomeEvent, eventStore, causalGraph)
        → AttributionResult[]
        四个维度：necessity（but-for 必要性）/ sufficiency / pathCompleteness / temporalPlausibility

Step 2: isOverdetermined(attributions)
        top-2 attributionScores 都 > 0.4 → overdetermined = true

Step 3: 输出 DiagnosticVerdict
        { rankedAttributions, overdetermined, notes }
```

### 8.4 为什么 Critic 必须确定性

如果 Critic 是另一个 LLM，则整个系统退化为"两个模型互相印证"——无法对抗 LLM 的整体偏置。确定性 Critic 的价值：

- 可重放：相同 FactStore 输入永远产出相同判决
- 可缓存：规则评估结果可以直接缓存
- 可单测：每条规则、每种打分路径都有确定性测试
- 可校准：通过 `ScoringProfile.weightOverrides` 精确调整

---

## 9. 阶段 5：Reconciler（冲突调和）

### 9.1 Predictive Reconciliation

```typescript
function reconcilePredictive(systemVerdict, modelVerdict): Reconciliation
```

1. 比较 `systemVerdict.recommendedCandidateId` vs `modelVerdict.recommendedCandidateId`
2. 一致 → `{ agree: true, surfacedToUser: false }`
3. 不一致 → 启发式诊断冲突原因：
   - 系统置信度 < 0.5 → `missing_facts`
   - 模型引用的 ruleIds 与系统使用的重叠 → `rule_weight_misalignment`
   - 模型选了更高风险选项 → `model_overrides_system`
   - 其他 → `unknown`
4. 生成自然语言解释，附带校准建议

### 9.2 Diagnostic Reconciliation

```typescript
function reconcileDiagnostic(systemVerdict, modelVerdict): Reconciliation
```

比较两份 `DiagnosticVerdict` 的 top attribution：
- Top cause 相同 → `agree: true`
- Top cause 不同 → `attribution_rank_mismatch`，说明 system 的 but-for 路径完整性与 model 的叙事重点不同

### 9.3 冲突暴露的价值

当 Reconciler 检测到冲突，UI 必须展示：

```
⚠️ 系统判定 X，模型判定 Y
差异原因：{explanation}
[告诉系统：模型对] [告诉系统：系统对] [都不对]
```

用户的反馈通过 `feedbackToken` 回流到 calibration log，成为后续规则权重调整的训练样本。

---

## 10. 顶层编排：`runDecisionAssistant`

### 10.1 入口函数

```typescript
async function runDecisionAssistant(input: RunDecisionInput): Promise<DecisionResponse>
```

`RunDecisionInput` 合并了用户查询和运行时上下文：

| 字段 | 说明 |
|------|------|
| `userQuery` | 用户自然语言问题 |
| `entryEntities?` | 显式入口实体（跳过实体链接） |
| `aliases?` | 别名表（中文名 → entityId） |
| `outcome?` | 诊断模式的已发生事件 |
| `graph` | 运行时图 |
| `ontology` | 本体定义 |
| `factStore?` | 初始 FactStore |
| `eventStore?` | 诊断模式必须 |
| `causalGraph?` | 诊断模式必须 |
| `scoringProfile?` | 领域打分配置 |
| `policyCtx?` | 策略上下文 |

### 10.2 编排流程

```
runDecisionAssistant(input)
    │
    ├── 1. frontEnd(userQuery, graph, ontology, ctx)
    │      ├── kind='task' → DecisionTask（继续）
    │      └── kind='clarify' → fallback: detectIntent + 构造最小 Task
    │
    ├── 2. merge caller-supplied entryEntities（向后兼容）
    │
    └── 3. runTaskSession(task, ctx)
           ├── mode='predictive' → runPredictiveSession()
           └── mode='diagnostic' → runDiagnosticSession()
```

### 10.3 Session 内部流程

**Predictive Session：**

```
runPredictiveExecutor(task, graph, facts, ontology, modelId)
    → { facts, workspace, modelVerdict }
         │
runCritic({ task, graph, ontology, facts, candidates, scoringProfile })
    → systemVerdict
         │
reconcilePredictive(systemVerdict, modelVerdict)
    → reconciliation
         │
saveTrace(trace)
    → DecisionResponse { systemVerdict, modelVerdict, reconciliation, evidence, counterfactuals, traceId, feedbackToken }
```

**Diagnostic Session：**

```
runDiagnosticExecutor(task, graph, eventStore, ontology, causalGraph, modelId)
    → { facts, workspace, modelVerdict }
         │
runCritic({ task, graph, ontology, eventStore, causalGraph, candidateCauses })
    → systemVerdict (DiagnosticVerdict)
         │
reconcileDiagnostic(systemVerdict, modelVerdict)
    → reconciliation
         │
saveTrace(trace)
    → DecisionResponse
```

### 10.4 Trace 持久化

每次决策运行生成 `DecisionTrace`，记录：

| 字段 | 说明 |
|------|------|
| `traceId` | 唯一追踪 ID |
| `mode` | predictive / diagnostic |
| `ontologyVersion` | 本体版本（可追溯） |
| `goal` | 用户原始问题 |
| `entryEntities` | 入口实体 |
| `factSnapshot` | 运行结束时的 FactStore 快照 |
| `systemVerdictId` | 系统推荐 |
| `modelVerdictId` | 模型推荐 |
| `reconciliationAgreed` | 是否一致 |
| `feedback?` | 用户反馈（事后回填） |

Trace 支持反事实重放和后续校准。

---

## 11. 双模式对称设计

Pipeline 的五阶段在两种模式下的对应关系：

| 阶段 | Predictive | Diagnostic |
|------|------------|------------|
| **Frontend** | 抽取 entryEntities | 抽取 outcome event + timeWindow |
| **Planner** | ExplorationPlan（前向展开子图） | DiagnosticPlan（后向回溯因果链） |
| **Executor 工具** | bind_fact / inspect_node / call_method / evaluate_rule | + query_events / walk_causal_graph / propose_causes |
| **Executor prompt** | "探索图、绑定事实、提议候选" | "重建时间线、回溯因果、提议候选原因" |
| **Critic** | Rule DAG + MCDA → ScoredCandidate[] | Attribution（necessity + sufficiency + path + temporal）→ AttributionResult[] |
| **Reconciler** | candidate ranking 比较 | attribution ranking 比较，关注 overdetermined |
| **Counterfactual** | what_if（snapshot override） | but_for（event erase） |

两种模式共享：DecisionWorkspace、Evidence/Uncertainty 类型、PolicyContext 过滤、Trace 持久化、反馈通道。

---

## 12. Demo 示例：图书馆借阅场景端到端

### 前提

```
用户问："小明可以借《人工智能简史》吗？"

Graph:
  xiao_ming (Reader): currentBorrowCount=2, hasOverdueBook=true
  book_ai_history (Book): daysOnShelf=3, lendable=true
  city_library (Library): maxBorrowPerReader=3, newBookProtectionDays=7

Rules:
  borrow_limit_exceeded (hard_constraint, risk_up, veto ALLOWED)
  new_book_not_lendable (hard_constraint, risk_up, veto ALLOWED)
  overdue_blocks_borrow (hard_constraint, risk_up, veto ALLOWED)
  good_borrow_record    (soft_criterion, risk_down)
```

### Step F — Frontend

```
classifyIntent("小明可以借《人工智能简史》吗？")
  → 规则匹配："借" 未命中高权重关键词 → confidence 低
  → LLM fallback → { mode: 'predictive', intent: 'recommendation', confidence: 0.85 }

linkEntities("小明可以借《人工智能简史》吗？", graph)
  → NER: "小明" (rule: 书名号外), "人工智能简史" (rule: 书名号《》)
  → 解析: "小明" → xiao_ming (substring, 0.7), "人工智能简史" → book_ai_history (alias/substring)
  → ambiguity: 0.0

→ DecisionTask {
    mode: 'predictive',
    intent: 'recommendation',
    entryEntities: ['xiao_ming', 'book_ai_history'],
    scope: { typesOfInterest: ['Reader', 'Book', 'Library'] }
  }
```

### Step E — Executor (LLM + tools)

```
1. inspect_node("xiao_ming") → 读取属性
2. bind_fact("xiao_ming", "currentBorrowCount", 2)
3. bind_fact("xiao_ming", "hasOverdueBook", true)
4. inspect_node("book_ai_history") → 读取属性
5. bind_fact("book_ai_history", "daysOnShelf", 3)
6. propose_candidates([
     { label: "ALLOWED", description: "允许借阅" },
     { label: "DENIED",  description: "拒绝借阅" }
   ])
7. evaluate_rule("new_book_not_lendable", "book_ai_history")
   → triggered=true, "书籍上架仅 3 天，不足 7 天保护期"
8. evaluate_rule("overdue_blocks_borrow", "xiao_ming")
   → triggered=true, "读者有逾期未还书籍"
9. record_evidence(...)  × N
10. 输出 ModelVerdict: { recommendedCandidateId: "cand_2" (DENIED), confidence: 0.9 }
```

### Step C — Critic (确定性)

```
evaluateRuleDag(facts, graph, ["xiao_ming", "book_ai_history"])
  → new_book_not_lendable: triggered → veto ALLOWED
  → overdue_blocks_borrow: triggered → veto ALLOWED
  → borrow_limit_exceeded: not triggered (2 < 3)
  → good_borrow_record: not triggered (hasOverdue=true)
  → vetoedLabels = { "ALLOWED" }

scoreCandidates(...)
  → ALLOWED: rawScore=-∞ (vetoed)
  → DENIED: rawScore=-0.25 → normalizedScore=0.0

→ SystemVerdict {
    recommendedCandidateId: "cand_2" (DENIED),
    confidence: 1.0,
    vetoedLabels: ["ALLOWED"],
    notes: ["Hard constraint veto eliminated: ALLOWED"]
  }
```

### Step R — Reconciler

```
reconcilePredictive(systemVerdict, modelVerdict)
  → system: DENIED, model: DENIED
  → agree: true, surfacedToUser: false
```

### 最终响应

```
DecisionResponse {
  mode: 'predictive',
  systemVerdict: { recommended: DENIED, confidence: 1.0 },
  modelVerdict:  { recommended: DENIED, confidence: 0.9 },
  reconciliation: { agree: true },
  evidence: [...],
  counterfactuals: [
    { mode: 'what_if', description: '如果小明归还逾期书籍', ... },
    { mode: 'what_if', description: '如果等新书保护期结束', ... }
  ],
  traceId: "...",
  feedbackToken: "..."
}
```

---

## 13. 扩展边界

以下功能已识别、**刻意推迟**：

| 功能 | 推迟原因 | 扩展入口 |
|------|----------|----------|
| 多轮对话 | 当前为单轮 query → response | Frontend 增加 session state，保留上下文实体 |
| Planner 输出校验 | 当前仅 JSON.parse fallback | 对 expectedSubgraphs 做图合法性检查 |
| Executor 并行 tool call | AI SDK 的 `generateText` 已支持并行 | Planner 标注 `parallelizable` 后启用 |
| 多 Agent 协作 | V6 是单 LLM Executor | V7 规划：多 LLM 并行评估 + 互相质询 |
| 流式输出 | 当前等 Executor 完成后才返回 | 用 `streamText` 替代 `generateText`，逐步输出 |
| 反馈自动校准 | feedbackToken 已预留但未消费 | calibration job 从 feedback log 更新 ScoringProfile |
| Planner 实际指导 Executor | 当前 Planner 产出的 plan 未注入 Executor prompt | 将 ExplorationPlan 序列化后加入 system prompt |
