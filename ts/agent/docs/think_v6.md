# V6：从单 Agent 决策闭环到通用化决策助手

## 一、V5 解决了什么，通用化时仍然缺什么

V5 的核心贡献已经很清楚：

- **`C` 一等化**：硬约束、软准则、推理规则、解释策略统一为可查询对象（`ontology/constraints.ts`、`inspect_rules`）。
- **`E` 渐进披露**：System Prompt 不再注入全量节点目录，只给入口实体和 schema；其余通过 `search_nodes` / `inspect_node` / `query_neighbors` 按需发现。
- **决策态显式化**：`DecisionWorkspace` 把候选答案、证据、不确定性、触发规则做成运行时一等对象。
- **输出从单答案到多答案**：`recommendation + alternatives + evidence + uncertainties + nextQueries`。

V5 在 `tmp/v5_2.json` 的 demo 上跑得很漂亮。但仔细看那条轨迹，已经能识别出几个 demo 之所以"看起来 work"是因为占了便宜的地方：

| demo 所享受的便利 | 通用化时的真实情况 |
|----|----|
| 入口实体 `project_portal` 由用户/调用者直接给定 | 用户问"项目风险大吗？"，需要先做意图识别 + 实体链接 |
| 9 个节点、3 类型、4 关系、7 规则，全可塞进 prompt | 真实业务是 10⁶~10⁹ 实体、几十类型、几百关系、上千规则 |
| 数据干净（`workload=85` 整数） | 真实数据脏：缺失、单位不一致、版本冲突 |
| 用户可以看全图 | 不同用户的可见子图不同（HR/项目/合规） |
| 单一意图（评估风险） | 同一句话可能是排期、人员调整、合规检查、客户答复 |

而且 demo 里已经亲口暴露了三个**结构性问题**：

### 问题 1：`evaluate_candidates` 的打分与业务直觉脱节

轨迹中 `evaluate_candidates` 给出：

```
HIGH:   0.33
MEDIUM: 0.50
LOW:    0.67
```

但 LLM 在 final answer 里**直接推翻系统结论**，硬把判断改成 HIGH。原因看 `src/v5/agent/tools/decision.ts:260-271`：

```260:271:src/v5/agent/tools/decision.ts
for (const candidate of candidates) {
    if (!candidate) continue;
    const label = candidate.label.toUpperCase();
    let score: number;

    if (label === "HIGH" || label === "高风险") {
        score = triggeredCount / Math.max(totalCriteria, 1);
    } else if (label === "LOW" || label === "低风险") {
        score = 1 - triggeredCount / Math.max(totalCriteria, 1);
    } else {
        score = 0.5;
    }
```

这是一个**严重的设计漏洞**：评分逻辑是"触发数/总数"，没有 weight、没有 severity、没有 veto，更没有"正面证据 vs 负面证据"的区分。LLM 看到了不合理的得分，于是绕过了系统、靠"自我修正"挽救——**这等于回到了 V3 的状态：系统形同虚设，最终结论只看 LLM 的自由发挥。**

### 问题 2：facts 是扁平 KV，没有实体命名空间

同一段调用中：

```
evaluate_candidates({
  facts: { teamLoad: 150, workload_alice: 85, workload_bob: 65, ... }
})
→ engineer_burnout_threshold: missingFacts: [workload, seniority]
```

facts 已经传了，但因为是扁平的 `workload_alice` / `workload_bob`，规则系统不知道"该规则要找哪个实体的 workload"。规则 `appliesTo: ["Engineer"]` 表示规则要在每个 Engineer 实例上单独评估一次，而不是吃一个全局 `workload`。

通用化时实体一多，扁平 KV 必然崩溃。

### 问题 3：模型用 `{teamLoad: 0, seniorCount: 0}` 盲调依赖项目方法

```
call_method(project_api, evaluateRisk, { teamLoad: 0, seniorCount: 0 })
→ { risk: "HIGH", reasons: ["没有高级工程师", ...] }
```

参数 schema 合法，但语义荒谬。`describe_method` 这个工具只能阻止"参数缺失"，阻止不了"用零做参数"。一旦下游真的把 `risk: HIGH` 当成事实记录到 evidence 里，整条链就毒了。

---

把这三个问题升一级抽象，就是 V6 要解决的真实挑战：

1. **本体规模与质量**：T/R/C 一旦数量上去，就不是 demo 的写死 seed，而是要做版本、演化、依赖、单测。
2. **评分校准**：规则触发到候选打分之间，需要可校准、可解释、可冲突暴露的中间层。
3. **事实绑定**：facts 必须有命名空间和来源，不能是扁平 KV。
4. **意图与实体接入**：用户的自然语言问题不能直接当作 goal，需要前端 pipeline。
5. **权限与隐私**：图访问需要 policy 感知。
6. **长链路 loop 的可信度**：需要 planner / critic 来约束 LLM 的自由发挥。
7. **可重放与反馈**：决策必须可追溯、可反事实、可学习。

---

## 二、V6 设计哲学

### 一句话

> **V6 = V5 的决策闭环 + 工程化本体 + 校准评分 + 双轨判决 + 意图前端 + 策略后端。**

### 五条原则

1. **本体即代码（ontology-as-code）**  
   T、R、C 是有版本、有依赖、有单测、有调用方契约的代码资产，不是 prompt 文本，也不是写死的 seed。

2. **事实有归属（fact-with-binding）**  
   每条 fact 都标注 `(entityId, property, value, source, confidence, validUntil)`，规则在评估时按 binding 自动取值，不再依赖 LLM 拼扁平 KV。

3. **打分要校准（calibrated scoring）**  
   候选打分基于 MCDA（多准则决策分析）：每条规则有 weight、severity、direction、是否 veto，整体打分对业务专家可解释。

4. **判决双轨（dual-track verdict）**  
   System verdict（确定性规则系统）和 Model verdict（LLM 综合判断）并列输出。一致 → 高置信结论；不一致 → 显式呈现冲突，由用户决策。

5. **决策可重放（trace as a first-class artifact）**  
   每次决策保存：使用的本体版本、入口、工具调用、fact binding、verdict、用户反馈。支持反事实重放和后续校准。

---

## 三、重新理解决策辅助系统：从"工具型"到"系统型"

V5 里，Agent 是一个"会用图的工具人"：拿到 goal、用工具探索图、给出多答案。

V6 要把它变成一个**面向用户的决策助手系统**，由四层组成：

```text
┌──────────────────────────────────────────────────────────────┐
│  Front-end Pipeline                                          │
│  - intent classification                                     │
│  - entity linking (NL → entryEntities)                       │
│  - clarification (when ambiguous, ask back)                  │
└────────────────┬─────────────────────────────────────────────┘
                 │  DecisionTask {goal, intent, entryEntities, scope, policy}
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Reasoning Loop (LLM + tools)                                │
│  - Planner: produce a plan (subgraphs, methods, parallelism) │
│  - Executor: graph access + rule evaluation + fact binding   │
│  - Critic:   challenges the executor with rule system        │
└────────────────┬─────────────────────────────────────────────┘
                 │  RawDecision {systemVerdict, modelVerdict, evidence, trace}
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Reconciliation & Explanation                                │
│  - verdict reconciliation (agree / conflict)                 │
│  - explanation generation                                    │
│  - counterfactual offers                                     │
│  - feedback channel                                          │
└────────────────┬─────────────────────────────────────────────┘
                 │  DecisionResponse {finalVerdict, conflict, evidence, ...}
                 ▼
              User UI
```

V5 只有中段（reasoning loop），V6 把前端和后端补齐。

---

## 四、V6 架构对比 V5

```text
V5：
  prompt(goal, ontology summary, entry entities, rules)
        │
        ▼
  generateText({ tools, maxSteps })
        │
        ▼
  decision output (single LLM verdict)


V6：
  user NL query
        │
        ▼
  Front-end:
    intent_classifier → entity_linker → (clarify | task)
        │
        ▼
  DecisionTask {goal, intent, entryEntities, scope, policyCtx}
        │
        ▼
  Planner (small LLM call, dryRun-style)
    → ExplorationPlan {subgraphsToOpen, methodsToCall, expectedSteps}
        │
        ▼
  Executor (generateText with V6 tools)
    - structured fact binding (FactStore)
    - graph tools (policy-aware)
    - rule evaluation (rule DAG)
    - record evidence
        │
        ▼
  Critic
    - re-runs rule DAG with collected facts (deterministic)
    - emits systemVerdict + ruleTrace
        │
        ▼
  Reconciliation
    - compare systemVerdict vs modelVerdict
    - if agree: high-confidence summary
    - if conflict: surface both, ask user / present diff
        │
        ▼
  DecisionResponse
    + counterfactualHooks (e.g. what-if alice.workload=60)
    + feedback channel
        │
        ▼
  Trace + Replay store (immutable)
```

| 维度 | V5 | V6 |
|------|----|----|
| 前端 | 调用方直接给 goal + entryEntities | NL → intent + entity linking + clarify |
| 规则评估 | 扁平 facts, 触发数加权 | (entityId, property) binding + MCDA |
| 判决 | 单一 LLM verdict | systemVerdict + modelVerdict + reconciliation |
| 工具策略 | 单一 LLM 长链 loop | Planner + Executor + Critic |
| 权限 | 无 | PolicyContext 在工具层强制执行 |
| 输出 | recommendation + alternatives | + 冲突暴露 + 反事实入口 + 反馈通道 |
| 可重放 | 无 | Trace store + replay |

---

## 五、文件结构

V6 在 `src/v6/` 下平行展开，不破坏 V5。

```text
src/v6/
├── runtime/
│   ├── types.ts                ← ToolResult / Page / 复用 V5 风格
│   ├── graph.ts                ← 复用 V5，但工具层包裹 PolicyContext
│   ├── registry.ts             ← 复用 V5
│   ├── facts.ts                ← 新建：FactBinding, FactStore
│   └── trace.ts                ← 新建：DecisionTrace, ReplayContext
│
├── ontology/
│   ├── schema.ts               ← T/R schema，加版本号
│   ├── rules.ts                ← C 升级：版本、依赖、weight、veto、direction
│   ├── ruleDag.ts              ← 新建：规则依赖图，topo evaluation
│   ├── scoring.ts              ← 新建：MCDA 评分器
│   └── decision.ts             ← DecisionTask / Verdict / Reconciliation
│
├── frontend/
│   ├── intent.ts               ← intent classifier（小 LLM 调用 / 规则）
│   ├── entityLinker.ts         ← NL → entityIds, 处理别名/消歧
│   └── clarify.ts              ← 模糊意图反问策略
│
├── policy/
│   ├── context.ts              ← PolicyContext: principal, scope, redaction
│   └── filters.ts              ← 工具层的 policy 装饰器
│
├── agent/
│   ├── prompt.ts               ← 重写：分 planner/executor/critic 三套 prompt
│   ├── planner.ts              ← 新建：生成 ExplorationPlan
│   ├── executor.ts             ← 主 loop（generateText + tools）
│   ├── critic.ts               ← 新建：deterministic rule re-run
│   ├── reconciler.ts           ← 新建：systemVerdict ↔ modelVerdict
│   └── tools/
│       ├── graph.ts            ← V5 工具 + policy filter
│       ├── method.ts           ← V5 工具 + precondition assertion
│       ├── facts.ts            ← 新建：bind_fact / lookup_fact
│       ├── rules.ts            ← inspect_rules + evaluate_rule（用 binding）
│       ├── candidates.ts       ← propose_candidates（保留）
│       ├── score.ts            ← 新建：score_candidates（MCDA）
│       └── counterfactual.ts   ← 新建：simulate
│
├── data/
│   ├── seed.ts                 ← 复用 V5 项目场景，加更多实体
│   └── ruleFixtures.ts         ← 新建：规则单测样例
│
└── index.ts                    ← runDecisionAssistant(userQuery, options)
```

---

## 六、核心类型设计

### 6.1 FactBinding 和 FactStore

V5 的 facts 是 `Record<string, any>`。V6 改成结构化绑定：

```ts
export type FactBinding = {
    entityId: string;
    property: string;            // 'workload' | 'seniority' | 'priority' | ...
    value: unknown;
    source: {
        kind: "graph_property" | "method_result" | "aggregation" | "user_input" | "derived";
        ref?: string;              // evidenceId / nodeId / methodCallId
    };
    confidence: number;          // 0..1
    validUntil?: string;         // ISO timestamp; for staleness checks
    derivedFrom?: string[];      // 当 kind=derived 时，依赖的其他 binding 的 hash
};

export class FactStore {
    private bindings = new Map<string, FactBinding>();   // key = `${entityId}.${property}`

    set(b: FactBinding): void;
    get(entityId: string, property: string): FactBinding | undefined;
    forEntity(entityId: string): FactBinding[];
    forProperty(property: string): FactBinding[];
    forType(typeName: string, graph: Graph): FactBinding[];
    snapshot(): ReadonlyMap<string, FactBinding>;
}
```

关键收益：

- 规则评估时，按 `appliesTo` + `requiredFacts`，自动从 FactStore 拉对应实体的 property，**不再让 LLM 拼扁平 KV**。
- `engineer_burnout_threshold` 在每个 Engineer 实例上独立评估，不会再误报 missing。
- 任何 fact 都可追溯到 source，避免"模型自己编一个数字"。
- `validUntil` 让陈旧 fact 自动降权或触发重新拉取。

### 6.2 Rule 升级与 Rule DAG

V5 的 Constraint：

```ts
type Constraint = {
    id: string;
    kind: ConstraintKind;
    appliesTo: string[];
    requiredFacts: string[];
    weight?: number;
    ...
};
```

V6 升级：

```ts
export type Rule = {
    id: string;
    version: string;             // "1.0.0", 跟随 ontology 版本
    kind:
        | "hard_constraint"        // 触发即否决某些候选
        | "inference_rule"         // 产生 derived facts
        | "soft_criterion"         // 加权打分
        | "conflict_policy"
        | "explanation_policy";

    appliesTo: string[];         // 类型名

    requiredFacts: Array<{
        property: string;
        scope: "entity" | "type" | "global";
    }>;

    derives?: Array<{              // 当 kind=inference_rule
        property: string;
        scope: "entity" | "type" | "global";
        // evaluator 函数返回的 value 写入这条 derived fact
    }>;

    direction?: "risk_up" | "risk_down" | "neutral";

    weight?: number;             // 0..1，soft_criterion 用
    severityFn?: (ctx: RuleContext) => "low" | "medium" | "high";

    veto?: {                     // hard_constraint 触发时直接否决某些候选
        candidatesByLabel?: string[];
    };

    evaluator: (ctx: RuleContext) => RuleResult;
    explanation: (res: RuleResult) => string;

    dependsOn?: string[];        // 其他 ruleId；用于构建 DAG，避免重复计数
    subsumedBy?: string[];       // 表示"已经被某条更高层规则蕴含"
};

export type RuleContext = {
    entityId?: string;           // appliesTo 是 entity 时绑定
    facts: FactStore;
    graph: Graph;
};

export type RuleResult = {
    triggered: boolean;
    severity?: "low" | "medium" | "high";
    explanation?: string;
    derivedFacts?: FactBinding[];
    missingFacts?: Array<{ entityId?: string; property: string }>;
};
```

`ruleDag.ts` 提供：

- 拓扑排序：先评估 `inference_rule`（产生 derived facts），再评估 `hard_constraint`（可能 veto），最后 `soft_criterion`（加权）。
- 子图剪枝：根据 intent 和 entryEntities 计算"相关规则集"，避免一次评估所有规则。
- 蕴含合并：`subsumedBy` 关系防止 demo 中那种 `engineer_burnout_threshold` × `project_team_load` × `senior_coverage` 三条规则共享同一团队负载事实造成的重复计数。

### 6.3 MCDA 评分器（取代 V5 的"触发数/总数"）

```ts
export type ScoringInput = {
    candidates: CandidateAnswer[];
    rules: Rule[];               // 已 topo 排序、已剪枝
    facts: FactStore;
    graph: Graph;
    profile?: ScoringProfile;    // 业务可调的权重画像
};

export type ScoringProfile = {
    aggregation: "weighted_sum" | "weighted_min" | "leximin";
    veto: "any_hard" | "majority_hard";
    severityWeights: Record<"low" | "medium" | "high", number>;
    directionMapping: Record<string, Record<string, number>>;
    // e.g. directionMapping["candidate_HIGH"]["risk_up"] = +1
    //      directionMapping["candidate_LOW"]["risk_up"]  = -1
    calibration?: {
        // 历史数据回流时由 calibrator 写入
        weightOverrides?: Record<string, number>;
        version: string;
    };
};

export type ScoredCandidate = {
    candidateId: string;
    rawScore: number;
    normalizedScore: number;     // 0..1
    confidence: number;          // 取决于缺失 fact 比例和规则置信
    triggeredRuleIds: string[];
    blockingRuleIds: string[];   // veto 命中
    rationale: string;           // 自然语言解释，由 explanation policy 生成
};

export function scoreCandidates(input: ScoringInput): {
    ranking: ScoredCandidate[];
    vetoed: string[];
    missingFactImpact: number;   // 0..1
};
```

要点：

- **weighted_sum 不是终点**：当问题里出现 hard_constraint 且 candidate 命中 veto，直接出局；不再是"扣点分"。
- **direction 是必须的**：demo 中的 bug 就源于打分函数靠 label 字符串硬编码 ("HIGH" → 触发数/总数，"LOW" → 1-)；V6 用 `directionMapping` 描述每条规则推哪个候选。
- **confidence 是计算出来的**：基于 `missingFactImpact`，不是 LLM 编一个数字。
- **calibration 是可演化的**：用户反馈可以更新 `weightOverrides`，并附带 version。

### 6.4 Verdict 与 Reconciliation

```ts
export type SystemVerdict = {
    source: "system";
    ruleSetVersion: string;
    ranking: ScoredCandidate[];
    recommendedCandidateId: string;
    confidence: number;
    notes: string[];
};

export type ModelVerdict = {
    source: "model";
    recommendedCandidateId: string;
    confidence: number;          // model 自报，仅参考
    rationale: string;
    citedEvidenceIds: string[];
    citedRuleIds: string[];
};

export type Reconciliation = {
    agree: boolean;
    surfacedToUser: boolean;
    diff?: {
        systemPick: string;
        modelPick: string;
        likelyCause:
            | "missing_facts"
            | "rule_weight_misalignment"
            | "model_overrides_system"
            | "system_too_coarse"
            | "unknown";
        explanation: string;
    };
};

export type DecisionResponse = {
    task: DecisionTask;
    systemVerdict: SystemVerdict;
    modelVerdict: ModelVerdict;
    reconciliation: Reconciliation;
    evidence: Evidence[];
    uncertainties: Uncertainty[];
    counterfactuals: CounterfactualOffer[];
    traceId: string;
    feedbackToken: string;
};
```

设计要点：

- 不再让 LLM 静默覆盖系统结论。**冲突就是冲突**，至少要 surface 给用户一次。
- `likelyCause` 是 reconciler 启发式推断的，例如：
    - 如果 model 引用的证据 system 未触发对应规则 → `rule_weight_misalignment` 或 `system_too_coarse`
    - 如果 system 报了大量 missingFacts 但 model 强行结论 → `model_overrides_system`
- `feedbackToken` 让前端可以一键反馈"系统对" / "模型对" / "都不对"，回流到 calibration log。

### 6.5 PolicyContext

```ts
export type PolicyContext = {
    principal: { userId: string; roles: string[]; tenantId?: string };
    scope: {
        allowedTypes?: string[];
        deniedTypes?: string[];
        allowedEntityIds?: string[];
        deniedEntityIds?: string[];
    };
    redaction: {
        sensitiveProperties: string[];     // e.g. ['salary', 'pii_email']
        mode: "drop" | "mask" | "summarize";
    };
    audit: {
        logToolCalls: boolean;
        logFactReads: boolean;
    };
};
```

`policy/filters.ts` 提供 `withPolicy(tool, ctx)` 装饰器，在 graph 工具的 `execute` 里：

- `inspect_node`：剪掉 deniedEntityIds、对 sensitiveProperties 做 mask
- `query_neighbors`：邻居列表按 scope 过滤
- `aggregate_facts`：聚合前先过滤
- `record_evidence`：禁止把 redacted 字段记入 evidence

### 6.6 ExplorationPlan（Planner 输出）

```ts
export type ExplorationPlan = {
    intent: DecisionIntent;
    entryEntities: string[];
    expectedSubgraphs: Array<{
        rootId: string;
        relations: string[];
        maxDepth: number;
        maxNodes: number;
    }>;
    methodsToInvoke: Array<{
        nodeIdHint: string | "by_type";
        method: string;
        rationale: string;
    }>;
    rulesetOfInterest: string[];
    estimatedSteps: number;
    parallelizable: boolean;
};
```

Planner 是一次轻量 LLM 调用，**不能调用工具**，只能读取 ontology + intent + entryEntities，输出一份计划。Executor 把它当作初始 budget。

这避免了 demo 中"LLM 一边走一边发现 project_api 还有 3 个工程师再回头查"的反复——planner 应该在第一步就预判"depends_on 子图必查"。

### 6.7 CounterfactualOffer

```ts
export type CounterfactualOffer = {
    id: string;
    description: string;          // "如果 alice.workload 降到 60"
    overrides: FactBinding[];
    impactPreview?: {
        candidateDelta: Array<{ candidateId: string; from: number; to: number }>;
        rerunCostHint: "cheap" | "moderate" | "expensive";
    };
};

// tool: simulate({ counterfactualId | overrides })
//   → 用 overrides 替换 FactStore 中的 binding，重跑 ruleDag + scoreCandidates
//   → 不调用 LLM，纯 deterministic
```

V6 不必把反事实做成完整的"模拟器"，只要能在**已绑定的 fact 上做局部替换并重跑确定性规则**，就足够回答 "如果 X 变成 Y，结论会怎么变"。

---

## 七、Pipeline 设计

### 7.1 前端：意图识别 + 实体链接 + 澄清

输入：`userQuery: string` + `userContext: { recentEntities?, defaultProject? }`

```ts
export async function frontEnd(
    userQuery: string,
    ctx: UserContext,
): Promise<
    | { kind: "task"; task: DecisionTask }
    | { kind: "clarify"; questions: ClarifyingQuestion[] }
> {
    const intent = await classifyIntent(userQuery);
    const candidates = await linkEntities(userQuery, ctx);

    if (intent.confidence < 0.6 || candidates.ambiguity > 0.5) {
        return { kind: "clarify", questions: buildClarifyingQuestions(intent, candidates) };
    }

    return {
        kind: "task",
        task: {
            goal: intent.canonicalGoal,
            intent: intent.kind,
            entryEntities: candidates.bestPick,
            scope: deriveScope(intent, candidates),
            policyCtx: ctx.policyCtx,
        },
    };
}
```

实现要点：

- `classifyIntent`：先用规则匹配（"风险" → risk_assessment, "优先" → prioritization, "排查" → diagnosis），匹配不上再走 LLM。
- `linkEntities`：用 ID 模糊匹配 + 别名表 + 上下文最近实体。多候选时返回 `ambiguity > 0`。
- 澄清问题不是 free-form chat，而是**结构化选择题**（"你说的是 A. project_portal (Product) 还是 B. portal_v2 (Marketing)"）。

### 7.2 中段：Planner / Executor / Critic 三段式

```ts
export async function reasoningLoop(
    task: DecisionTask,
    ctx: RuntimeContext,
): Promise<RawDecision> {
    const plan = await planner(task, ctx.ontology);

    const exec = await executor(task, plan, ctx);
    //   exec returns: { facts: FactStore, evidence, modelVerdict, modelTrace }

    const sys = critic(task, exec.facts, ctx.ontology);
    //   critic is deterministic: rule DAG + MCDA, NO LLM

    return {
        task,
        systemVerdict: sys,
        modelVerdict: exec.modelVerdict,
        evidence: exec.evidence,
        modelTrace: exec.modelTrace,
        facts: exec.facts.snapshot(),
    };
}
```

为什么是 deterministic critic 而不是 LLM critic？因为我们要的就是一个**不会被 LLM 自由发挥拐走的对照组**。规则系统再粗糙，至少每次跑结果一样。

**Executor 的 prompt 与 V5 不同：**

- 不再要求 LLM 自己打分（移除 `evaluate_candidates` 这种自评工具）。
- LLM 的职责被严格限定为：探索图、绑定事实、提议候选、给出综合理由。
- 在 prompt 里明确告诉模型："最终评分由系统完成，你的工作是把 fact 绑定齐全。"

### 7.3 后端：Reconciliation + Explanation + Counterfactual

```ts
export function reconcile(raw: RawDecision): DecisionResponse {
    const agree =
        raw.systemVerdict.recommendedCandidateId === raw.modelVerdict.recommendedCandidateId;

    const reconciliation: Reconciliation = agree
        ? { agree: true, surfacedToUser: false }
        : {
                agree: false,
                surfacedToUser: true,
                diff: diagnoseDiff(raw),
            };

    const counterfactuals = buildCounterfactualOffers(raw);

    return {
        task: raw.task,
        systemVerdict: raw.systemVerdict,
        modelVerdict: raw.modelVerdict,
        reconciliation,
        evidence: raw.evidence,
        uncertainties: deriveUncertainties(raw),
        counterfactuals,
        traceId: persistTrace(raw),
        feedbackToken: issueFeedbackToken(raw),
    };
}
```

`diagnoseDiff` 启发式：

- 系统 vetoed model 的选择 → "系统认为命中硬约束，模型未识别"
- 模型引用的 evidence 与系统使用的 binding 矛盾 → "证据冲突"
- 系统 missingFactImpact 高 → "系统证据不足"

`buildCounterfactualOffers`：

- 自动选 1-3 个高敏感度 fact（按规则 weight × severity 排序）作为 what-if 入口。
- 例如本 demo 中："alice.workload 降到 60" / "project_api 风险降为 LOW"。

---

## 八、Tools 演进

### 8.1 保留（V5 已稳定）

- `inspect_schema`、`inspect_rules`
- `search_nodes`、`inspect_node`、`query_neighbors`
- `describe_method`
- `propose_candidates`、`record_evidence`

### 8.2 增强

- `call_method`：
    - 增加 **precondition assertion**。每个方法可声明 `preconditions: { paramName: 'must_be_positive' | 'must_be_in_facts' | ... }`，工具层在调用前检查。
    - 阻止 `evaluateRisk({ teamLoad: 0, seniorCount: 0 })` 这种"语法对、语义错"的盲调。
- `aggregate_facts`：
    - 自动把聚合结果写回 FactStore（带 source: aggregation, derivedFrom）。
- `inspect_rules`：
    - 增加按 intent / appliesTo / kind 三轴过滤；增加 `relatedRules`（DAG 邻居）。

### 8.3 新增

- `bind_fact(entityId, property, value, source, confidence)`  
  显式让 LLM 把发现的事实写入 FactStore；规则系统用这个，而不是再让 LLM 拼 facts dict。

- `lookup_fact(entityId, property)`  
  从 FactStore 查询，返回 binding 与 source。

- `evaluate_rule(ruleId, scope?)`  
  在已绑定的 facts 上评估单条规则；返回 triggered / severity / missingFacts。**注意：不打分，不汇总。** 打分是 critic 的事。

- `simulate(overrides | counterfactualId)`  
  反事实重跑（critic-only，不涉及 LLM）。

### 8.4 移除

- `evaluate_candidates`（V5）  
  原因：它把"评估规则"和"打分排名"耦合在一起，且打分逻辑 demo 已经证明不可信。V6 拆成 `evaluate_rule`（细粒度）+ critic 内部的 `scoreCandidates`（不暴露给 LLM）。

- `record_evidence` 中的 `confidence` 字段由 LLM 自报  
  改为系统根据 `source.kind` 给 base confidence，再由 LLM 选择 `confidence_modifier ∈ {-0.2, 0, +0.2}` 做有限调整，避免 LLM 编 0.95 这种数字。

---

## 九、完整决策链演示（V5 vs V6 同问题对比）

用户提问：

```text
project_portal 的交付风险大吗？
```

### V5 当前行为

1. 直接进入 reasoning loop（goal 当作 user 的话；entryEntities 由调用方写死）
2. LLM 走 ~18 次 tool call，包括一次 `evaluateRisk(0,0)` 盲调
3. `evaluate_candidates` 给 LOW=0.67、HIGH=0.33
4. LLM final answer 强行覆盖为 HIGH
5. 用户看到：HIGH，附 evidence ev_1..ev_8

### V6 期望行为

#### Step F-1：前端

```ts
frontEnd("project_portal 的交付风险大吗？", ctx)
→ intent = { kind: "risk_assessment", confidence: 0.92 }
→ entityLink = { bestPick: ["project_portal"], ambiguity: 0.0 }
→ task = {
    goal: "评估 project_portal 的综合交付风险",
    intent: "risk_assessment",
    entryEntities: ["project_portal"],
    scope: { typeOfInterest: ["Project", "Engineer", "Team"] },
    policyCtx: { principal: ..., scope: ..., redaction: ... },
}
```

#### Step P-1：Planner

```ts
planner(task, ontology)
→ {
    intent: "risk_assessment",
    entryEntities: ["project_portal"],
    expectedSubgraphs: [
        { rootId: "project_portal", relations: ["assigned_to", "owned_by", "depends_on"], maxDepth: 2, maxNodes: 30 },
    ],
    methodsToInvoke: [
        { nodeIdHint: "project_portal", method: "evaluateRisk", rationale: "main risk evaluator" },
        { nodeIdHint: "by_type:Engineer", method: "assessBurnoutRisk", rationale: "burnout per engineer" },
        { nodeIdHint: "by_type:Team", method: "checkOverload", rationale: "team capacity check" },
    ],
    rulesetOfInterest: [
        "engineer_burnout_threshold", "project_team_load",
        "senior_coverage", "dependency_risk_propagation",
        "high_priority_pressure", "team_capacity_overload",
    ],
    estimatedSteps: 12,
    parallelizable: true,
}
```

注意 planner 已经预判 `depends_on` 子图必查，避免 demo 中"先 evaluate project_api(0,0)、再回头补"的反复。

#### Step E-1..E-N：Executor

LLM 调用工具流程，关键差异：

- 用 `bind_fact` 显式绑定每条事实，而不是堆 evidence。
- `call_method(project_api, evaluateRisk, ...)` 在 precondition 层会拒绝 `{teamLoad: 0, seniorCount: 0}`，因为 method 声明 `preconditions: { teamLoad: "must_be_positive_or_explicitly_zero", seniorCount: "must_be_in_facts" }`。
- LLM 不再调用 `evaluate_candidates`；只调 `propose_candidates`。

最终 executor 输出：

```ts
{
    facts: FactStore {
        ("alice", "workload") → { value: 85, source: graph_property, confidence: 0.9 },
        ("alice", "seniority") → { value: "senior", ... },
        ("bob", "workload") → ...,
        ("bob", "seniority") → ...,
        ("project_portal", "priority") → ...,
        ("project_portal", "teamLoad") → { value: 150, source: aggregation, derivedFrom: ["alice.workload", "bob.workload"] },
        ("project_portal", "seniorCount") → { value: 1, source: aggregation, ... },
        ("project_portal", "evaluateRisk_result") → { value: { risk: "MEDIUM", reasons: [...] }, source: method_result, ... },
        ("project_api", "evaluateRisk_result") → { value: { risk: "MEDIUM", ... }, ... },
        // ...
    },
    candidates: [HIGH, MEDIUM, LOW],
    modelVerdict: {
        recommendedCandidateId: "cand_HIGH",
        confidence: 0.7,
        rationale: "alice 倦怠 + 高优先级 + 依赖项目 MEDIUM 叠加…",
        citedEvidenceIds: [...],
        citedRuleIds: ["engineer_burnout_threshold", "high_priority_pressure", "dependency_risk_propagation"],
    },
}
```

#### Step C-1：Critic（确定性）

```ts
critic(task, facts, ontology)
→ ruleDag.evaluate(facts):
   - engineer_burnout_threshold(alice): triggered, severity=high, direction=risk_up
   - engineer_burnout_threshold(bob):   not triggered
   - team_capacity_overload(team_frontend): not triggered
   - project_team_load(project_portal):  not triggered (150 < 200)
   - senior_coverage(project_portal):    triggered_positive (1 >= 1), direction=risk_down
   - dependency_risk_propagation(project_portal): triggered (project_api MEDIUM), severity=medium
   - high_priority_pressure(project_portal): triggered, severity=medium

→ scoreCandidates({
    candidates: [HIGH, MEDIUM, LOW],
    rules: [...],
    facts: ...,
    profile: defaultRiskProfile,   // direction-aware
}):
    HIGH:   normalizedScore=0.62, confidence=0.78, triggered=[burnout(alice), dep_risk, hi_pri], blocking=[]
    MEDIUM: normalizedScore=0.51, confidence=0.78, triggered=[same]
    LOW:    normalizedScore=0.22, confidence=0.78, triggered=[senior_coverage]

→ systemVerdict = {
    recommendedCandidateId: "cand_HIGH",
    confidence: 0.78,
    notes: ["alice burnout pushes risk up", "依赖项目 MEDIUM 风险传导"],
}
```

注意：因为打分用了 direction（"risk_up" 对 HIGH 加分、对 LOW 扣分），这次 system 给的不是 V5 那种"LOW 0.67"的荒谬结果。

#### Step R-1：Reconciliation

```ts
reconcile(...)
→ agree = true   (system: HIGH, model: HIGH)
→ surfacedToUser = false
→ counterfactuals = [
    { id: "cf_alice_60", description: "alice.workload 降到 60", overrides: [...], impactPreview: { ranking flips to MEDIUM } },
    { id: "cf_api_low",  description: "project_api 风险降为 LOW",   overrides: [...], impactPreview: {...} },
]
```

#### Step U-1：用户看到的 UI

```text
风险评估：HIGH（高置信，0.78）

主要驱动：
- alice 当前工作负载 85h，超过 senior 倦怠阈值（80h）
- project_portal 是高优先级项目，对延期容忍度低
- 依赖项目 project_api 的风险为 MEDIUM，会传导

缓解因素：
- 团队有 1 名高级工程师覆盖
- 团队总负载 150h，未超过超载阈值（200h）

[查看证据 7 条] [查看规则触发 5 条] [查看完整推理轨迹]

如果...
- alice.workload 降到 60h → 风险变 MEDIUM   [模拟]
- project_api 风险降为 LOW → 风险变 MEDIUM    [模拟]

[这次评估对吗？] [👍 准确] [👎 不准] [✏️ 我有不同看法]
```

#### 假设 system 与 model 不一致的反例

如果在另一个场景里：

```text
systemVerdict.recommendedCandidateId = "cand_MEDIUM"
modelVerdict.recommendedCandidateId  = "cand_HIGH"
```

UI 不再让模型静默胜出，而是：

```text
⚠️ 系统判定 MEDIUM，模型判定 HIGH

差异原因：模型引用了"alice 倦怠"这条 evidence，但系统认为该规则的触发权重较低，
且其它两个 risk-down 规则（senior_coverage, team_not_overloaded）权重更高。

可能的真相：
- 如果 alice 的倦怠对项目交付影响很大 → 模型对，建议提高 engineer_burnout_threshold 权重
- 如果倦怠可以靠加班解决 → 系统对，可以保留当前权重

[告诉系统：模型对] [告诉系统：系统对] [都不对]
```

这就是"冲突可见"的价值——它把一次 demo 中本来被模型悄悄覆盖的判断，变成了一个可被业务专家校准的训练样本。

---

## 十、关键设计决策

### 决策 1：critic 必须是 deterministic 的

如果 critic 是另一个 LLM，那就只是"两个模型互相印证"，无法对抗 LLM 的整体偏置。
critic 走 rule DAG + MCDA，不调用 LLM，可重放、可缓存、可单测。
LLM 的工作只剩"探索图、绑定事实、写 model verdict"。

### 决策 2：FactStore 是 V5 → V6 的最关键迁移

只要不改 fact 的存储方式，所有规则评估的下游问题（命名空间、来源追踪、反事实重放）都解决不了。
建议 V5 → V6 第一步就把 `facts: Record<string, any>` 替换成 `FactStore`，哪怕规则评估器还没升级。

### 决策 3：scoring 不再让 LLM 看到中间分

在 prompt 里写明："你不需要知道每条规则的当前得分。最终评分由系统完成。你的职责是确保 fact binding 完整。"
这避免了 LLM 看到不合理打分后**绕过系统**。
demo 中的"LOW=0.67、HIGH=0.33 → LLM 改成 HIGH"恰恰是模型看到了不该看到的中间分而做的越权修正。

### 决策 4：planner 不能调用工具

planner 的输出必须是 plan，而不是 plan + 半步执行。
否则 planner 和 executor 边界混淆，等于把 V5 的 loop 又跑了一遍。
planner 只读 ontology + intent + entry，输出一个 budget。

### 决策 5：reconciliation 一致时静默，不一致时强制 surface

不能因为"一致"就跳过 critic（critic 必跑），但 UI 可以对一致结果做简短渲染。
不一致时 UI 必须显式标注，并提供反馈通道。
这是"可校准"的根。

### 决策 6：计算的 confidence 优先于 LLM 自报的 confidence

规则触发的 confidence 来自 fact 的 source.confidence × validity × completeness。
LLM 的 modelVerdict.confidence 仅作参考，不能进入 systemVerdict。
最终 UI 上的 confidence 来自 systemVerdict + reconciliation.agree 的修正。

### 决策 7：先做单 Agent + 三段式，再做多 Agent

V6 内部已经有 planner / executor / critic 三个角色，但只有 executor 是 LLM 驱动的。
**真正的多 Agent 协作（多个 LLM 并行评估同一问题、互相质询）留给 V7。**
原因：在 V5 → V6 阶段，校准 fact + scoring + reconciliation 的单 LLM 闭环已经很难做对；过早多 Agent 会放大不确定性。

---

## 十一、V5 → V6 迁移路径

### V6.0：FactStore 与 binding（最关键）

1. 引入 `runtime/facts.ts`：FactBinding + FactStore
2. 把 V5 的 `aggregate_facts` 输出写回 FactStore
3. 新增 `bind_fact` / `lookup_fact` 工具
4. 改 `evaluate_rule`（替代旧的 `evaluate_candidates` 中的规则评估部分），从 FactStore 读 binding
5. `record_evidence` 的 confidence 改为 system base + LLM modifier

目标：让规则评估在结构化绑定上跑，**修掉 demo 中的 missingFacts 误报**。

### V6.1：Rule DAG + MCDA 评分

1. 升级 `Rule` 类型：weight、direction、severityFn、dependsOn、subsumedBy
2. 新建 `ruleDag.ts`：拓扑排序、子图剪枝、蕴含合并
3. 新建 `scoring.ts`：MCDA + ScoringProfile
4. 移除旧的 `evaluate_candidates` 工具
5. critic 走 deterministic rule DAG + MCDA

目标：**修掉 demo 中 LOW=0.67 的打分荒谬**。

### V6.2：systemVerdict + modelVerdict + reconciliation

1. executor 输出仅含 modelVerdict
2. critic 输出 systemVerdict
3. reconciler 比较两者，输出 DecisionResponse
4. UI 渲染区分 agree / conflict 两种状态

目标：**让 demo 中"LLM 静默覆盖系统结论"的行为变得不可能**。

### V6.3：前端 pipeline + planner

1. `frontend/intent.ts`、`entityLinker.ts`、`clarify.ts`
2. `agent/planner.ts`
3. executor 接受 plan 作为初始 budget，并在 prompt 中提及 plan
4. NL → DecisionTask 替代直接调用 `runDecisionAgent`

目标：**把入口从"调用方写死 entryEntities"变成"用户自然语言提问"**。

### V6.4：策略层 + 反事实 + 反馈闭环

1. `policy/context.ts`、`policy/filters.ts`，所有 graph 工具加 policy 装饰
2. `tools/counterfactual.ts`：simulate
3. `runtime/trace.ts`：DecisionTrace 持久化
4. 反馈通道：feedbackToken → calibration log
5. 简单的 calibration job：根据反馈调整 ScoringProfile.weightOverrides

目标：**让 V6 真正可上生产、可被业务专家校准**。

---

## 十二、测试策略

### 1. Fact binding contract tests

- `bind_fact` 写入后，`lookup_fact` 能取到完全相同的值
- 同一 (entityId, property) 多次写入，按 confidence 取最高的、且记录覆盖历史
- `validUntil` 过期后，`lookup_fact` 返回 stale=true
- 来自 graph_property 的 binding 不允许被 user_input 直接覆盖（除非 escalation）

### 2. Rule DAG tests

- 拓扑序：inference → hard → soft
- subsumedBy：被蕴含规则不参与最终打分（但仍报 triggered=true 用于解释）
- requiredFacts 全部缺失 → triggered=false, missingFacts 完整列出
- requiredFacts 部分缺失 → 看 rule.kind：hard 必须触发不确定性，soft 可降低 confidence 后参与

### 3. MCDA scoring tests

**这是 V6 最关键的回归测试**：

- 用 `tmp/v5_2.json` 的输入跑 V6 critic，应得到 HIGH > MEDIUM > LOW
- direction-aware：当所有 risk_up 规则都触发，HIGH 必须排第一
- veto：hard_constraint 命中时直接 vetoed
- weight 校准：调整 `engineer_burnout_threshold.weight` 应改变排名顺序

### 4. Reconciliation tests

- system=HIGH, model=HIGH → agree=true, surfacedToUser=false
- system=HIGH, model=LOW → agree=false, surfacedToUser=true, diff.likelyCause 合理
- system 大量 missingFacts + model 强行 high confidence → diff.likelyCause = `model_overrides_system`

### 5. Counterfactual tests

- `simulate({ overrides: [{ entityId: "alice", property: "workload", value: 60 }] })`
  - 重跑 critic，HIGH 的 normalizedScore 必须下降
- 多个 overrides 互相独立，结果幂等（同样的 overrides 跑两次结果一致）

### 6. End-to-end golden trace

固定用户提问、固定本体版本、固定数据快照，断言：

- frontEnd 输出的 task 字段正确
- planner 的 expectedSubgraphs 包含 depends_on 子图
- executor 不调用 `evaluateRisk` with 任何 zero 参数（precondition 拒绝）
- critic 输出 systemVerdict.recommendedCandidateId = "cand_HIGH"
- reconciler 输出 agree=true（如果模型也判 HIGH），或 surfacedToUser=true

### 7. Policy tests

- 受限 principal 调 `inspect_node` → 敏感属性被 mask
- denied entity 不应出现在 `query_neighbors` 邻居列表
- 被 mask 的属性不能被写入 evidence

---

## 十三、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| FactStore 改造太重，V5 → V6 迁移卡住 | 高 | 高 | 第一阶段只做"writes 写入 FactStore，reads 仍可走 V5 facts dict 兜底"；规则评估器最后切换 |
| MCDA 权重难调，业务团队不认账 | 高 | 中 | 提供权重 UI、保留 demo 数据集做 baseline、calibration 走灰度 |
| Planner LLM 幻觉，给出不合理 plan | 中 | 中 | plan 字段强校验（subgraph 必须存在、method 必须注册）；executor 可拒绝 plan 并退化为无 plan loop |
| Critic 太严格，频繁与 model 冲突 → 噪音 | 中 | 中 | reconciliation.diff 的 likelyCause 必须解释清楚；用户疲劳时降低 surface 频率 |
| Policy 装饰器漏掉某个工具 → 数据泄露 | 低 | 高 | 所有图工具必须经 policy facade 注册；CI lint 检查 |
| 反事实计算昂贵 → 用户等不起 | 中 | 中 | counterfactualOffers 限制最多 3 个、impactPreview 异步惰性计算 |
| 反馈闭环被滥用 → 权重被噪音淹没 | 中 | 高 | calibration log 加入 reviewer 角色和阈值；权重变化必须人工签发版本号 |
| 多语言 / i18n 在 explanation 模板里失控 | 低 | 低 | 所有 explanation 走 template + locale 注入，不让 LLM 自由组合 |

---

## 十四、暂不做什么

V6 不做这些事：

1. **不做完整多 Agent 协作**  
   V6 是"内部三段式（planner / executor / critic）+ 单一 LLM 角色"。多 LLM 并行评估、互相质询留给 V7。

2. **不做完整的因果图建模**  
   反事实仅做"局部 fact 替换 + 重跑确定性规则"，不做 do-calculus。

3. **不做规则 DSL**  
   规则仍是 TypeScript 函数（`evaluator: (ctx) => RuleResult`），不引入 Drools / 自定义 DSL。

4. **不做向量检索的实体链接**  
   entityLinker 走 ID 模糊匹配 + 别名表 + 上下文，向量检索留给数据规模上来后再加。

5. **不做实时图**  
   FactStore 仍是请求级快照。实时性走 validUntil + 重新拉取，而不是流式更新。

6. **不重写 V5 已稳定的工具**  
   `inspect_node` / `query_neighbors` / `describe_method` 等只加 policy 装饰，不改语义。

7. **不替用户做最终决策**  
   即使 system 与 model 都判 HIGH、置信 0.95，UI 仍只是"建议"，并且必须保留 [我有不同看法] 入口。

---

## 十五、总结

V4 的关键是：**"不要手写 AI SDK 已经解决的 tool-calling loop。"**

V5 的关键是：**"辅助决策不是从图里找一个答案，而是在模糊问题下生成候选答案、收集证据、应用约束、表达不确定性。"**

V6 的关键是：

> **当 LLM 与系统判断不一致时，不要让 LLM 静默胜出。**  
> **让事实有归属，让规则有依赖，让评分可校准，让冲突显式可见，让决策可重放、可反事实、可学习。**

具体补齐四个能力：

1. **结构化的 FactStore** —— 让事实可定位、可追溯、可反事实
2. **可演化的 Rule DAG + MCDA** —— 让评分对业务专家可解释、可校准
3. **双轨判决 + Reconciliation** —— 让 LLM 与系统的分歧不再被掩盖
4. **前端意图 + 后端反馈** —— 让系统真正面向用户、面向迭代

> V4 让 Agent 会用图。  
> V5 让 Agent 会用图辅助人做决策。  
> V6 让"Agent 辅助决策"这件事变成可工程化、可校准、可问责的系统。
