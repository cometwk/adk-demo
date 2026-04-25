# V5：从图推理 Agent 到辅助决策 Agent

## 一、V4 解决了什么，仍然缺什么

V4 的核心价值非常明确：**不再手写 agent loop，把图操作交给 AI SDK tools，把多轮推理交给 `generateText({ maxSteps, tools })`。**

这解决了 V3 的几个根本问题：

| V3/V4 问题域 | V4 的答案 |
|-------------|-----------|
| 手写循环容易丢历史 | AI SDK 自动维护 tool-calling history |
| JSON action 容易畸形 | AI SDK tool calling 协议保证结构 |
| 手写 validator/executor 冗余 | tool schema + execute 函数替代 |
| 图查询能力不足 | `inspect_node` / `query_neighbors` / `call_method` |

但是，如果系统目标不是“确定性问答”，而是“辅助用户在模糊问题下做决策”，V4 仍有三个关键缺口：

1. **`C` 没有一等建模**  
   本体 `G={E,R,T,C}` 中的 `C` 应该表达公理、约束、判断准则、权重、规则来源和解释模板。V4 里 `C` 主要藏在 method implementation、method description 和错误返回里。

2. **`E` 仍然以全量目录方式暴露**  
   V4 不再注入所有属性值，这是进步；但 System Prompt 仍列出所有 node id。小图可接受，大图、隐私场景和权限场景不可接受。

3. **输出仍偏“单答案推理”，不是“决策支持”**  
   辅助决策系统面对的问题通常模糊、不完备、可多解。它不应该只给一个结论，而应该生成候选答案、收集证据、标注不确定性、解释取舍。

---

## 二、V5 设计哲学

### 一句话

> **V5 = V4 的 AI SDK tool loop + 显式本体 `C` + 渐进式实体披露 + 证据驱动的多答案决策。**

### 三条原则

1. **`C` 是决策准则，不只是硬规则**  
   在辅助决策中，`C` 同时包含硬约束、软约束、评分准则、推导规则、冲突处理和解释模板。

2. **`E` 按问题逐步披露，而不是全量注入**  
   System Prompt 只提供类型、关系、规则目录和入口实体。具体实体、属性、邻居、方法、聚合结果通过 tools 按需获取。

3. **答案是带证据的候选方案集合**  
   V5 不追求把模糊问题过早压成唯一答案，而是让模型生成多个候选判断，并用图事实和约束准则进行比较。

---

## 三、重新理解本体 `G={E,R,T,C}`

V4 对本体的使用更像：

```text
T: 节点 class，例如 Team / Engineer / Project
R: 边类型，例如 member_of / assigned_to / depends_on
E: 所有 node id 的目录
C: 隐含在 method implementation 里
```

V5 应该改成：

```text
G = { E, R, T, C }

T: 类型/类集合
  - Engineer
  - Team
  - Project
  - DecisionTask
  - Evidence
  - CandidateAnswer

R: 关系 schema + 关系事实
  - schema: Engineer --member_of--> Team
  - schema: Engineer --assigned_to--> Project
  - schema: Project --depends_on--> Project
  - facts: 通过 tool 按需查询，不在 prompt 中全量展开

E: 实体集合
  - 不在 System Prompt 中全量注入
  - 通过入口实体、搜索、邻居查询、分页、字段投影逐步披露

C: 公理、约束、准则、权重、解释模板
  - 硬约束：不能违反的规则
  - 软约束：偏好、权重、评分维度
  - 推导规则：如何从事实得到中间判断
  - 冲突规则：多个信号冲突时如何呈现
  - 解释规则：最终答案如何引用事实和规则
```

关键变化是：**`C` 不再只是方法内部逻辑，而是可查询、可引用、可解释的运行时对象。**

---

## 四、V5 架构对比

```text
V4：图推理 Agent

  System Prompt
    - goal
    - all node ids
    - type names
    - edge types
    - method signatures
          │
          ▼
  generateText({ maxSteps, tools })
          │
          ▼
  tools:
    - inspect_node
    - query_neighbors
    - call_method
          │
          ▼
  final answer


V5：辅助决策 Agent

  System Prompt
    - task framing
    - T: type schema
    - R: relation schema
    - C: decision criteria / constraints / explanation policy
    - entry entities only
          │
          ▼
  generateText({ maxSteps, tools })
          │
          ▼
  tools:
    - inspect_schema
    - inspect_rules
    - search_nodes
    - inspect_node
    - query_neighbors
    - aggregate_facts
    - describe_method
    - call_method
    - record_evidence
    - propose_candidates
    - evaluate_candidates
          │
          ▼
  decision output:
    - recommended answer
    - alternatives
    - evidence
    - triggered constraints
    - uncertainty
    - next information to collect
```

V5 不是替代 V4 的 tool loop，而是在 V4 外面增加一个“决策任务层”：

```text
DecisionTask = {
  question,
  intent,
  entryEntities,
  candidateAnswers,
  evidence,
  criteria,
  uncertainty,
  recommendation
}
```

---

## 五、文件结构

```text
demo/
├── runtime/
│   ├── types.ts              ← 扩展：ToolResult, Page, Evidence, CandidateAnswer
│   ├── registry.ts           ← 扩展：RuleRegistry / CriteriaRegistry
│   ├── decorator.ts          ← 扩展：@agentRule / @agentCriterion
│   └── graph.ts              ← 增强：分页查询、字段投影、类型过滤
├── ontology/
│   ├── schema.ts             ← 新建：T/R schema 定义
│   ├── constraints.ts        ← 新建：C 的硬约束、软约束、评分准则
│   └── decision.ts           ← 新建：DecisionTask / Evidence / CandidateAnswer 类型
├── agent/
│   ├── tools.ts              ← 扩展：图访问 + 规则查询 + 决策工具
│   ├── prompt.ts             ← 重写：不再列全量实体目录
│   ├── run.ts                ← 保留：仍使用 AI SDK generateText
│   └── output.ts             ← 新建：决策输出格式化
├── data/
│   └── seed.ts               ← 扩展：加入规则和更复杂图
└── index.ts                  ← 保持简洁：runDecisionAgent(goal, graph, ontology)
```

---

## 六、核心类型设计

### 1. `runtime/types.ts` — 标准化 tool result

V4 的 tool result 有时是 `{ error }`，有时是 `{ neighbors }`，有时是 `{ result }`。这对模型可读，但不利于测试、缓存和多 Agent 协作。

V5 统一为 discriminated result：

```ts
export type ToolResult<T> =
  | {
      ok: true;
      data: T;
      meta?: {
        source?: string;
        page?: PageInfo;
        confidence?: number;
      };
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        expected?: unknown;
      };
    };

export type PageInfo = {
  limit: number;
  offset: number;
  total?: number;
  hasMore: boolean;
};
```

关键收益：

- 模型可以稳定区分成功、空结果、权限拒绝、参数错误
- 测试可以断言契约
- 未来可加入缓存、多 Agent 和远程图

---

### 2. `ontology/constraints.ts` — 显式 `C`

`C` 在 V5 中是一组可查询的规则/准则：

```ts
export type ConstraintKind =
  | "hard_constraint"
  | "soft_criterion"
  | "inference_rule"
  | "conflict_policy"
  | "explanation_policy";

export type Constraint = {
  id: string;
  kind: ConstraintKind;
  appliesTo: string[];
  description: string;
  requiredFacts: string[];
  weight?: number;
  priority?: number;
  explanationTemplate: string;
};
```

示例：

```text
rule: engineer_burnout_threshold
kind: inference_rule
appliesTo: Engineer
requiredFacts: [workload, seniority]
description: senior > 80h, mid > 70h, junior > 55h means burnout risk is HIGH

rule: dependency_risk_propagation
kind: soft_criterion
appliesTo: Project
requiredFacts: [depends_on.risk]
description: A risky dependency increases delivery risk of the dependent project

rule: high_priority_pressure
kind: soft_criterion
appliesTo: Project
requiredFacts: [priority]
description: high-priority projects have lower tolerance for delivery uncertainty
```

注意：这些规则不一定全部由 LLM 执行。更稳的方式是：

- LLM 负责选择相关规则、收集事实、解释取舍
- deterministic functions 负责执行可计算的规则
- 最终输出引用规则 ID 和证据 ID

---

### 3. `ontology/decision.ts` — 决策任务层

辅助决策不是直接从事实到答案，而是从问题到候选答案，再到证据比较。

```ts
export type DecisionTask = {
  question: string;
  intent: "risk_assessment" | "prioritization" | "diagnosis" | "recommendation" | "unknown";
  entryEntities: string[];
  criteria: string[];
  candidateAnswers: CandidateAnswer[];
  evidence: Evidence[];
  uncertainty: Uncertainty[];
};

export type CandidateAnswer = {
  id: string;
  answer: string;
  summary: string;
  score?: number;
  confidence: number;
  supportingEvidenceIds: string[];
  opposingEvidenceIds: string[];
  triggeredConstraintIds: string[];
};

export type Evidence = {
  id: string;
  source: "node" | "edge" | "method" | "rule" | "aggregate" | "user";
  statement: string;
  entityIds: string[];
  relationTypes?: string[];
  constraintIds?: string[];
  confidence: number;
};

export type Uncertainty = {
  id: string;
  missingFact: string;
  impact: "low" | "medium" | "high";
  suggestedQuery?: string;
};
```

这让 V5 的输出可以表达：

- 推荐答案是什么
- 还有哪些备选答案
- 每个答案依赖哪些证据
- 哪些规则被触发
- 哪些信息缺失
- 缺失信息会不会改变结论

---

## 七、Tools 设计

V5 保留 V4 的三个核心 tools，但扩展为三类。

### 1. 本体查询 tools

```text
inspect_schema(typeName?)
  查询 T/R schema，例如 Project 有哪些属性、可连接哪些关系。

inspect_rules(intent?, entityType?, ruleKind?)
  查询 C，例如风险评估相关规则、项目相关规则、硬约束或软准则。

describe_method(nodeId, method)
  查询方法参数 schema、返回 schema、规则来源和参数推导建议。
```

`describe_method` 解决 V4 的一个具体 bug：Prompt 中 `evaluateRisk({})` 显示空参数，但运行时又需要 `teamLoad/seniorCount`。

---

### 2. 渐进式实体披露 tools

```text
search_nodes(query?, type?, relatedTo?, limit?, offset?)
  按目标、类型、关键词或相关实体搜索节点。

inspect_node(nodeId, fields?)
  读取节点，但支持字段投影：
  fields = ["type", "properties", "outEdges", "inEdges", "methods"]

query_neighbors(nodeId, relation?, direction?, type?, limit?, offset?)
  查询邻居，支持关系、方向、类型、分页。

aggregate_facts(entityIds, metric, groupBy?)
  对事实做聚合，例如 teamLoad、seniorCount、memberCount。
```

关键变化：

- System Prompt 不再列所有实体
- `inspect_node` 不再默认返回全部内容
- 高连接度节点通过分页返回
- 模型可以先查摘要，再决定是否展开详情

---

### 3. 决策支持 tools

```text
propose_candidates(question, intent, entryEntities)
  根据问题生成候选答案框架。

record_evidence(statement, source, entityIds, constraintIds?, confidence)
  把重要事实登记为证据，便于最终引用。

evaluate_candidates(candidateIds, criteriaIds)
  根据显式准则比较候选答案。
```

这些 tools 不一定都要在 V5.0 实现为真实 runtime 状态。早期可以让它们返回结构化 JSON，作为 `result.steps` 中的审计信息。后续再落到真正的 `DecisionState`。

---

## 八、`agent/prompt.ts` — 不再注入全量实体

V4 prompt：

```text
GRAPH OVERVIEW:
Nodes:
  - team_frontend (Team) ...
  - team_backend (Team) ...
  - alice (Engineer) ...
  - bob (Engineer) ...
  ...

Edge types: [...]
```

V5 prompt：

```text
You are a decision-support agent over an ontology-backed semantic graph.
Your job is not to force a single answer too early.
For ambiguous questions, generate candidate answers, gather evidence, apply constraints,
and explain uncertainty.

GOAL:
评估 project_portal 的综合交付风险

ENTRY ENTITIES:
- project_portal

ONTOLOGY SUMMARY:
Types:
- Project: priority, delivery pressure, methods for risk evaluation
- Team: department, capacity, methods for overload checks
- Engineer: workload, seniority, methods for burnout checks

Relation schema:
- Engineer --member_of--> Team
- Engineer --assigned_to--> Project
- Project --owned_by--> Team
- Project --depends_on--> Project

Decision criteria:
- Use hard constraints as non-negotiable boundaries.
- Use soft criteria to compare candidate answers.
- Cite rule IDs and evidence IDs in the final answer.
- Surface missing high-impact facts instead of pretending certainty.

Available tools:
- inspect_schema
- inspect_rules
- search_nodes
- inspect_node
- query_neighbors
- aggregate_facts
- describe_method
- call_method
- record_evidence
- propose_candidates
- evaluate_candidates
```

关键区别：

| 维度 | V4 | V5 |
|------|----|----|
| 实体暴露 | 全量 node id 目录 | 只给入口实体 |
| `C` | 隐含在方法和描述里 | 显式规则/准则目录 |
| 推理目标 | 找事实，调用方法，给答案 | 生成候选，收集证据，比较答案 |
| 输出 | 单一结论为主 | 推荐 + 备选 + 证据 + 不确定性 |

---

## 九、完整决策链演示

目标：

```text
评估 project_portal 的综合交付风险
```

### Step 1：识别任务类型

```text
assistant:
这是一个风险评估类辅助决策问题。问题本身是模糊的：
“综合交付风险”可能涉及人员负载、团队容量、项目优先级、依赖项目风险和截止日期压力。
我会先生成候选判断，再收集证据。
```

```text
tool: inspect_rules({ intent: "risk_assessment", entityType: "Project" })
result:
{
  ok: true,
  data: {
    rules: [
      "project_team_load",
      "senior_coverage",
      "dependency_risk_propagation",
      "high_priority_pressure",
      "missing_fact_uncertainty"
    ]
  }
}
```

### Step 2：生成候选答案

```text
tool: propose_candidates({
  question: "评估 project_portal 的综合交付风险",
  intent: "risk_assessment",
  entryEntities: ["project_portal"]
})
result:
{
  ok: true,
  data: {
    candidates: [
      {
        id: "candidate_high",
        answer: "HIGH",
        summary: "人员负载、依赖风险或高优先级压力叠加"
      },
      {
        id: "candidate_medium",
        answer: "MEDIUM",
        summary: "有明显压力，但核心团队仍可承载"
      },
      {
        id: "candidate_uncertain",
        answer: "INSUFFICIENT_DATA",
        summary: "缺少 deadline、scope change 或历史交付数据"
      }
    ]
  }
}
```

### Step 3：从入口实体逐步披露

```text
tool: inspect_node({
  nodeId: "project_portal",
  fields: ["type", "properties", "outEdges", "inEdges", "methods"]
})
result:
{
  ok: true,
  data: {
    type: "Project",
    properties: { priority: "high" },
    outEdges: {
      owned_by: ["team_frontend"],
      depends_on: ["project_api"]
    },
    inEdges: {
      assigned_to: ["alice", "bob"]
    },
    methods: ["evaluateRisk"]
  }
}
```

模型此时知道需要继续查：

- `alice` / `bob` 的 workload 和 seniority
- `team_frontend` 的 capacity
- `project_api` 的风险
- `evaluateRisk` 的参数 schema

### Step 4：查询方法 schema，避免盲调

```text
tool: describe_method({
  nodeId: "project_portal",
  method: "evaluateRisk"
})
result:
{
  ok: true,
  data: {
    params: {
      teamLoad: "number",
      seniorCount: "number"
    },
    returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
    requiredFacts: [
      "assigned engineers workload",
      "assigned engineers seniority"
    ],
    relatedRules: [
      "project_team_load",
      "senior_coverage",
      "high_priority_pressure"
    ]
  }
}
```

这一步避免 V4 中先调用 `evaluateRisk({})` 再靠错误修正的行为。

### Step 5：收集证据和聚合事实

```text
tool: aggregate_facts({
  entityIds: ["alice", "bob"],
  metric: "sum(workload)"
})
result:
{
  ok: true,
  data: {
    value: 150,
    evidence: [
      "alice workload = 85",
      "bob workload = 65"
    ]
  }
}
```

```text
tool: aggregate_facts({
  entityIds: ["alice", "bob"],
  metric: "count(seniority = senior)"
})
result:
{
  ok: true,
  data: {
    value: 1,
    evidence: [
      "alice seniority = senior",
      "bob seniority = mid"
    ]
  }
}
```

```text
tool: record_evidence({
  statement: "project_portal has high priority and depends on project_api",
  source: "node",
  entityIds: ["project_portal", "project_api"],
  constraintIds: ["high_priority_pressure", "dependency_risk_propagation"],
  confidence: 1
})
```

### Step 6：调用确定性方法

```text
tool: call_method({
  nodeId: "project_portal",
  method: "evaluateRisk",
  args: {
    teamLoad: 150,
    seniorCount: 1
  }
})
result:
{
  ok: true,
  data: {
    risk: "MEDIUM",
    reasons: ["deadline pressure critical (0.85)"]
  },
  meta: {
    source: "Project.evaluateRisk"
  }
}
```

### Step 7：比较候选答案

```text
tool: evaluate_candidates({
  candidateIds: ["candidate_high", "candidate_medium", "candidate_uncertain"],
  criteriaIds: [
    "project_team_load",
    "senior_coverage",
    "dependency_risk_propagation",
    "high_priority_pressure",
    "missing_fact_uncertainty"
  ]
})
result:
{
  ok: true,
  data: {
    ranking: [
      {
        candidateId: "candidate_medium",
        score: 0.72,
        confidence: 0.76
      },
      {
        candidateId: "candidate_high",
        score: 0.64,
        confidence: 0.61
      },
      {
        candidateId: "candidate_uncertain",
        score: 0.48,
        confidence: 0.7
      }
    ]
  }
}
```

### Step 8：最终输出

```text
推荐判断：project_portal 当前综合交付风险为 MEDIUM，偏高风险边界。

主要依据：
1. 直属成员 alice/bob 总工作量为 150，其中 alice 已超过 senior burnout 阈值。
2. project_portal 是 high priority 项目，风险容忍度较低。
3. 项目依赖 project_api，因此依赖项目的不确定性会传导到 portal。
4. evaluateRisk 方法给出的确定性结果为 MEDIUM，原因包含 deadline pressure critical。

备选判断：
- HIGH：如果 project_api 风险升高，或 deadline pressure 权重高于当前设定，则应升级为 HIGH。
- INSUFFICIENT_DATA：如果需要严谨决策，还缺少 deadline、scope change、历史延期率等信息。

建议：
优先检查 project_api 的交付风险，并补充 deadline / scope change 数据。
如果依赖项目风险为 MEDIUM 以上，建议将 project_portal 提升为 HIGH watchlist。
```

这就是辅助决策输出：**推荐判断 + 备选判断 + 证据 + 不确定性 + 下一步建议**。

---

## 十、关键设计决策

### 决策 1：保留 AI SDK loop，不恢复手写循环

V5 不应该回到 V3 的手写 loop。V4 已经证明，AI SDK 的 tool calling history 是正确的工作记忆。

V5 新增的是：

- 本体规则查询
- 决策状态表达
- 证据登记
- 候选答案比较

这些都应作为 tools 和结构化输出存在，而不是重新发明 `NextAction`。

---

### 决策 2：`C` 显式化，但不要求 LLM 独自执行所有规则

有些规则适合 deterministic execution：

- workload 阈值判断
- member count 聚合
- team capacity 比较
- method 参数校验

有些规则适合 LLM 辅助解释：

- 多个软准则如何取舍
- 模糊问题如何拆解
- 不确定性如何表达
- 用户可理解的决策说明

因此 V5 的 `C` 应该是：

```text
可查询的规则目录 + 可执行的规则函数 + 可引用的解释依据
```

而不是纯 prompt 文本。

---

### 决策 3：全量实体目录改为入口实体 + 搜索/邻居发现

V4 的 “Nodes:” 目录在 9 个节点时很方便，但不是长期架构。

V5 的 System Prompt 只包含：

- 问题
- 入口实体
- 类型 schema
- 关系 schema
- 规则摘要
- tool 使用策略

其余实体通过 tools 发现。

这带来三个收益：

- 可扩展到大图
- 避免泄露无关实体
- 让模型围绕假设和证据探索，而不是被全局目录牵引

---

### 决策 4：方法调用前必须能描述参数 schema

V4 运行中出现过：

```text
call_method(project_portal, evaluateRisk, {})
→ Invalid args: teamLoad / seniorCount missing
```

这说明通用 `call_method` 的 tool schema 太宽，模型只能试错。

V5 增加 `describe_method`：

- 参数名
- 参数类型
- required 字段
- 参数来源建议
- 相关规则
- 返回结构

模型应先 `describe_method`，再收集 required facts，最后 `call_method`。

---

### 决策 5：决策输出必须保留不确定性

辅助决策系统的错误不是“没有给答案”，而是“把不确定问题包装成确定答案”。

V5 的 final answer 应包含：

- recommendation
- alternatives
- evidence
- constraints
- uncertainty
- next_best_queries

如果缺少高影响事实，系统必须显式说出来。

---

## 十一、V4 → V5 迁移路径

### V5.0：补齐本体与输出形态

1. 增加 `ontology/constraints.ts`
2. 增加 `inspect_rules`
3. 增加 `describe_method`
4. 修改 prompt：不再说 “RULES 不需要”
5. 修改 final output：输出推荐、备选、证据、不确定性

目标：先让 `C` 可见，让输出从单答案变成决策建议。

### V5.1：渐进式实体披露

1. System Prompt 移除全量 node list
2. 增加 `search_nodes`
3. `inspect_node` 支持 `fields`
4. `query_neighbors` 支持分页、类型过滤
5. 对高连接度节点返回摘要而不是全量邻居

目标：让系统适配大图和权限场景。

### V5.2：证据与候选答案

1. 增加 `DecisionTask`
2. 增加 `Evidence`
3. 增加 `CandidateAnswer`
4. 增加 `record_evidence`
5. 增加 `evaluate_candidates`

目标：让推理链可审计，答案可比较。

### V5.3：规则执行与解释

1. 把部分 `C` 变成可执行规则函数
2. 让 method result 返回 triggered rule ids
3. final answer 引用 evidence ids 和 rule ids
4. 增加 golden trace 测试

目标：减少 LLM 猜规则，提高可验证性。

---

## 十二、测试策略

### 1. Tool contract tests

验证所有 tool result 都符合：

```text
{ ok: true, data, meta? }
或
{ ok: false, error: { code, message, retryable, expected? } }
```

覆盖：

- 节点不存在
- 方法不存在
- 参数缺失
- 空邻居
- 分页 hasMore
- 权限拒绝

### 2. Ontology tests

验证：

- 每个 rule 有 id、kind、appliesTo、requiredFacts
- 每个 method 可以描述 params / returns / relatedRules
- 每个 decision criterion 可以被 `inspect_rules` 查询到

### 3. Golden trace tests

固定输入：

```text
评估 project_portal 的综合交付风险
```

期望推理轨迹包含：

1. 查询风险评估规则
2. 生成候选答案
3. 检查入口实体
4. 查询方法 schema
5. 收集人员负载和 seniorCount
6. 检查依赖项目
7. 输出推荐 + 备选 + 不确定性

不要求每次自然语言完全一致，但要求结构化决策输出满足 schema。

### 4. Ambiguity tests

验证模糊问题不会被过早压成唯一答案：

- “这个项目风险大吗？”
- “哪个项目更值得优先处理？”
- “团队现在是否健康？”

期望输出都包含：

- candidate answers
- evidence
- uncertainty
- next information to collect

---

## 十三、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `C` 过度复杂，变成规则引擎重写 | 中 | 高 | 只把关键规则一等化，复杂业务逻辑仍可留在 method 中，但必须暴露 rule id 和解释 |
| Tool 数量增加，模型选择困难 | 中 | 中 | 按类别命名，并在 prompt 中给出决策流程 |
| 决策输出太啰嗦 | 中 | 中 | 输出分层：默认短结论 + 证据摘要，debug 模式再展开完整 trace |
| 渐进披露导致模型漏查实体 | 中 | 高 | 使用候选答案驱动探索，并在 final answer 中列出 missing high-impact facts |
| 规则权重被误解为绝对真理 | 低 | 中 | 区分 hard_constraint 和 soft_criterion，输出置信度和备选判断 |
| 多 Agent 过早引入放大不确定性 | 中 | 中 | V5 先做单 Agent 决策闭环，多 Agent 留到规则和证据层稳定之后 |

---

## 十四、暂不做什么

V5 不做这些事：

1. **不恢复手写 loop**  
   AI SDK tool calling 仍然是运行时基础。

2. **不把所有业务逻辑都迁移成规则 DSL**  
   只把需要解释、检索、引用和组合的 `C` 一等化。

3. **不立即做多 Agent**  
   多 Agent 只有在单 Agent 的证据、规则、候选答案结构稳定后才有意义。

4. **不追求完全自动决策**  
   系统定位是辅助决策，不是替用户承担最终责任。

---

## 十五、总结

V4 的核心洞察是：

> **不要手写 AI SDK 已经解决的 tool-calling loop。**

V5 的核心洞察是：

> **辅助决策不是从图里找一个答案，而是在模糊问题下生成候选答案、收集证据、应用约束、表达不确定性。**

因此，V5 的设计重点不是“更多 Agent”或“更复杂缓存”，而是补齐四个能力：

1. **显式 `C`**：规则、准则、约束、解释模板可查询、可引用
2. **渐进 `E`**：实体不全量注入，而是从入口实体按需发现
3. **证据链**：每个判断都能追溯到事实、关系、方法结果和规则
4. **多答案输出**：推荐答案、备选答案、不确定性和下一步查询一起呈现

**V4 让 Agent 会用图。V5 让 Agent 会用图辅助人做决策。**
