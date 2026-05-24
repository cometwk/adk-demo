# Pipeline Module — 设计草案

> 本文档描述 V8 Pipeline 模块的核心架构：
>
> - Pipeline 作为最上层编排器，协调 Engine + Ontology + Rule
> - 可插拔的任务类型系统（目录插件式）
> - Frontend（意图识别 / 实体链接 / 澄清）内嵌于 Pipeline
> - 每种任务拥有独立的 executor / critic / prompt / tools
> - PipelineContext 原生支持 stream / sync 双模式 API
>
> 当前期望实现的任务类型：Diagnostic（后向归因）、Predictive（前向推断）、Reasoning（通用推理，从 engine/agent/executor.ts 迁入）。

---

## 1. 架构总览

```text
                          User Query
                                │
                                ▼
                    ┌───────────────────────┐
                    │     Pipeline          │
                    │  ┌─────────────────┐  │
                    │  │   Frontend      │  │   意图识别 → 任务路由
                    │  │  (intent/NER/   │  │   实体链接 → 入口实体
                    │  │   clarify)      │  │   澄清 → 补充信息
                    │  └───────┬─────────┘  │
                    │          │ task dispatch
                    │          ▼
                    │  ┌─────────────────┐  │
                    │  │  Task Registry  │  │   按任务类型分发
                    │  └───────┬─────────┘  │
                    │          │
                    │    ┌─────┴──────┬────────────┐
                    │    ▼            ▼            ▼
                    │ diagnostic  predictive   reasoning  ...  (extensible)
                    │ ┌────────┐ ┌────────┐ ┌──────────┐
                    │ │executor│ │executor│ │ executor │
                    │ │critic  │ │critic  │ │  (only)  │
                    │ │prompt  │ │prompt  │ │ prompt   │
                    │ │tools   │ │tools   │ │ tools    │
                    │ └────────┘ └────────┘ └──────────┘
                    │       │          │          │
                    │       └──────┬───┘──────────┘
                    │              │  orchestrate
                    └──────────────┼─────────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  Engine (Semantic Runtime)    │
                    │  RuntimeOrchestrator          │
                    │  GraphStore / ComputeStore /  │
                    │  VectorStore / FactStore      │
                    └──────────────────────────────┘
                          │              │
                    ┌─────┴─────┐  ┌────┴─────┐
                    │  Ontology  │  │   Rule   │
                    │  (本体层)  │  │ (规则层) │
                    └───────────┘  └──────────┘
```

### 1.1 核心职责边界

```text
Pipeline for orchestration  → 协调"执行什么任务、按什么流程"
Frontend for routing        → 决定"用户想要什么、从哪里开始"
Executor for reasoning      → 决定"下一步要收集什么信息"
Critic for evaluation       → 决定"收集的信息如何评价"
Engine for data access      → 决定"怎样最高效地获取数据"
Ontology for context        → 提供"领域中有哪些类型和关系"
Rule for judgment           → 提供"业务约束和评分标准"
```

### 1.2 与 V6 的关键差异

| 维度       | V6                           | V8 Pipeline                          |
| -------- | ---------------------------- | ------------------------------------ |
| 任务类型     | 硬编码 predictive / diagnostic | 可插拔目录插件式，支持自定义任务                      |
| 提示词构建    | 统一 prompt.ts                | 每个任务目录独立 prompt + 通用 ontology prompt 复合 |
| Critic   | 独立文件但耦合 pipeline           | 属于各任务目录，调用公共 Rule 模块                 |
| 数据访问     | Agent 直接调用 Store            | Pipeline → Executor → Engine(Runtime)  |
| API 模式   | helper.ts 中独立 stream/sync   | PipelineContext 统一双模式 API             |
| 规则评价     | critic 自行实现 MCDA/attribution | 公共 Rule 模块（MCDA + 否决 + 一致性检查）         |
| 扩展方式     | 新增模式需改多处代码                  | 新增目录即可，实现 TaskPlugin 接口              |

---

## 2. 核心类型定义

### 2.1 任务类型

```typescript
// ── Task Type Identifier ──

type TaskType = string  // 'diagnostic' | 'predictive' | 'reasoning' | 自定义

// ── Pipeline Task (通用输入) ──

type PipelineTask = {
  type: TaskType          // 任务类型标识
  goal: string            // 用户目标/问题
  entryEntities?: string[]  // 入口实体 ID 列表
  intent?: string         // 细分意图（如 risk_assessment）
  context?: Record<string, unknown>  // 任务特定上下文
}

// ── Pipeline Result (通用输出) ──

type PipelineResult = {
  taskType: TaskType
  facts: FactBinding[]        // 收集的事实
  modelVerdict: unknown       // Agent 输出的判决（结构因任务类型而异）
  systemVerdict?: unknown     // 确定性评价结果（如有 critic）
  reconciliation?: Reconciliation  // 模型/系统判决一致性（如有 critic）
  rawText: string             // Agent 原始输出
}
```

### 2.2 TaskPlugin 接口

每种任务类型必须实现 `TaskPlugin` 接口，这是目录插件式扩展的核心契约：

```typescript
interface TaskPlugin {
  /** 任务类型标识 */
  type: TaskType

  /** 构建该任务的系统提示词 */
  buildPrompt(params: PromptParams): string

  /** 构建该任务的工具集 */
  buildTools(params: ToolParams): Record<string, CoreTool>

  /** 执行 Agent 推理 */
  execute(params: ExecuteParams): Promise<TaskExecuteResult>

  /** 确定性评价（可选） */
  critique?(params: CritiqueParams): Promise<CritiqueResult>
}
```

### 2.3 Plugin 参数类型

```typescript
// ── Prompt Params ──

type PromptParams = {
  task: PipelineTask
  ontology: Ontology           // 本体层（通用）
  rules?: RuleMetadata[]       // 规则摘要（通用）
  customContext?: string       // 自定义提示词片段（任务特定）
}

// ── Tool Params ──

type ToolParams = {
  runtime: RuntimeOrchestrator  // Engine 运行时
  workspace: Workspace          // 工作区
  policy: PolicyContext         // 策略上下文
}

// ── Execute Params ──

type ExecuteParams = {
  task: PipelineTask
  systemPrompt: string
  tools: Record<string, CoreTool>
  model: LanguageModel
}

// ── Critique Params ──

type CritiqueParams = {
  task: PipelineTask
  facts: FactBinding[]
  modelVerdict: unknown
  runtime: RuntimeOrchestrator
  ruleRegistry: RuleRegistry
  ontology: Ontology
}
```

### 2.4 Execute / Critique 结果

```typescript
type TaskExecuteResult = {
  facts: FactBinding[]
  modelVerdict: unknown
  rawText: string
}

type CritiqueResult = {
  systemVerdict: unknown
  reconciliation?: Reconciliation
}
```

---

## 3. Pipeline Core

### 3.1 PipelineContext

PipelineContext 是用户与 Pipeline 交互的唯一入口：

```typescript
class PipelineContext {
  private registry: TaskRegistry
  private frontend: Frontend
  private runtime: RuntimeOrchestrator
  private ontology: Ontology
  private ruleRegistry: RuleRegistry

  constructor(deps: PipelineDeps) {
    this.registry = deps.registry
    this.frontend = deps.frontend
    this.runtime = deps.runtime
    this.ontology = deps.ontology
    this.ruleRegistry = deps.ruleRegistry
  }

  /** 同步执行：指定任务类型 */
  async runTask(type: TaskType, task: Omit<PipelineTask, 'type'>): Promise<PipelineResult>

  /** 流式执行：指定任务类型 */
  async *streamTask(type: TaskType, task: Omit<PipelineTask, 'type'>): AsyncGenerator<PipelineEvent>

  /** 自动路由：Frontend 识别意图后自动分发 */
  async run(query: string): Promise<PipelineResult>

  /** 自动路由（流式） */
  async *stream(query: string): AsyncGenerator<PipelineEvent>
}
```

### 3.2 PipelineDeps

```typescript
type PipelineDeps = {
  // Engine 层
  graphStore: GraphStore
  computeStore: ComputeStore
  vectorStore: VectorStore
  config?: RuntimeConfig

  // Ontology 层
  ontology: Ontology

  // Rule 层
  ruleRegistry: RuleRegistry

  // 任务插件（可选，不传则使用注册的默认任务）
  plugins?: TaskPlugin[]
}
```

### 3.3 PipelineEvent（流式事件）

```typescript
type PipelineEvent =
  | { type: 'frontend'; intent: string; entities: string[] }
  | { type: 'executor_step'; toolCall: string; result: unknown }
  | { type: 'fact_bound'; fact: FactBinding }
  | { type: 'model_verdict'; verdict: unknown }
  | { type: 'critique_complete'; result: CritiqueResult }
  | { type: 'done'; result: PipelineResult }
```

### 3.4 TaskRegistry

```typescript
class TaskRegistry {
  private plugins: Map<TaskType, TaskPlugin>

  register(plugin: TaskPlugin): void
  get(type: TaskType): TaskPlugin | undefined
  list(): TaskType[]
}
```

---

## 4. Frontend

### 4.1 定位

Frontend 是 Pipeline 内嵌的入口组件，负责：

1. **意图分类** — 识别用户问题属于哪种任务类型
2. **实体链接** — 提取入口实体 ID
3. **澄清** — 对模糊输入生成追问

### 4.2 接口定义

```typescript
interface Frontend {
  /** 完整前端处理：意图 + 实体 + 澄清 → PipelineTask */
  process(query: string): Promise<FrontendResult>
}

type FrontendResult =
  | { status: 'ready'; task: PipelineTask }
  | { status: 'clarify'; questions: ClarificationQuestion[] }
```

### 4.3 意图分类策略

继承 V6 的两阶段分类：

```text
1. 规则匹配（快速路径） — 基于关键词 + ontology 类型匹配
2. LLM 回退（模糊路径） — 低置信度时调用 LLM 分类
```

V8 扩展：意图分类结果映射到 TaskType，而非 V6 的 DecisionMode：

```text
"哪些商户本月没交易？"     → TaskType = 'predictive'
"为什么 M003 上个月交易量骤降？" → TaskType = 'diagnostic'
"分析 Merch:M001 的经营状况"   → TaskType = 'reasoning'
```

### 4.4 实体链接

复用 V6 的多策略匹配 + V8 的 GraphStore 搜索：

```text
1. 精确 ID 匹配（Merch:M001）
2. 名称模糊匹配（GraphStore.searchNodes）
3. 语义搜索（VectorStore，可选）
4. 歧义评分 → 触发澄清
```

---

## 5. 任务插件详解

### 5.1 目录结构

```text
src/v8/pipeline/
├── core/
│   ├── context.ts            — PipelineContext
│   ├── registry.ts           — TaskRegistry
│   ├── types.ts              — 公共类型定义
│   └── frontend/
│       ├── index.ts          — Frontend 主入口
│       ├── intent.ts         — 意图分类
│       ├── entity-linker.ts  — 实体链接
│       └── clarify.ts        — 澄清生成
│
├── tasks/
│   ├── diagnostic/           # 后向归因任务
│   │   ├── index.ts          — TaskPlugin 实现
│   │   ├── executor.ts       — 诊断执行器
│   │   ├── critic.ts         — 确定性归因评价
│   │   ├── prompt.ts         — 诊断提示词
│   │   ├── tools.ts          — 诊断专用工具（因果图、事件查询）
│   │   └── types.ts          — 诊断特有类型（DiagnosticVerdict 等）
│   │
│   ├── predictive/           # 前向推断任务
│   │   ├── index.ts          — TaskPlugin 实现
│   │   ├── executor.ts       — 推断执行器
│   │   ├── critic.ts         — MCDA 评分 + 否决
│   │   ├── prompt.ts         — 推断提示词
│   │   ├── tools.ts          — 推断专用工具（候选管理、反事实）
│   │   └── types.ts          — 推断特有类型（ModelVerdict_Predictive 等）
│   │
│   └── reasoning/            # 通用推理任务（从 engine/agent 迁入）
│       ├── index.ts          — TaskPlugin 实现
│       ├── executor.ts       — 语义推理执行器
│       ├── prompt.ts         — 语义推理提示词
│       ├── tools.ts          — 推理工具（Graph/Compute/Vector/Fact/Candidate）
│       ├── verdict.ts        — 结果解析
│       └── types.ts          — 推理特有类型（SemanticVerdict 等）
│
└── index.ts                  — 模块导出
```

### 5.2 Prompt 复合模式

每种任务的提示词由 **通用层 + 任务层** 复合构成：

```text
┌─────────────────────────────────┐
│  通用本体层 (ontology prompt)    │  ← ontology/prompt.ts
│  - 实体类型 & 关系描述           │
│  - 操作规则（查询分工、事实收集）  │
├─────────────────────────────────┤
│  任务层 (task-specific prompt)   │  ← tasks/xxx/prompt.ts
│  - 任务特定指令                  │
│  - 输出格式要求                  │
│  - 约束规则                     │
├─────────────────────────────────┤
│  自定义扩展层 (optional)         │  ← task.customContext
│  - 用户/开发者注入的额外指令      │
└─────────────────────────────────┘
```

示例 — Predictive Prompt 构建：

```typescript
function buildPrompt(params: PromptParams): string {
  const ontologySection = buildOntologyPrompt(params.ontology)
  const rulesSection = params.rules?.length
    ? buildRulesSummary(params.rules)
    : ''

  const taskSection = `
# 任务：前向推断

根据当前状态推断未来可能的结果，提出候选方案并评估风险。

## 推断规则
1. 必须基于已收集的事实，不得凭空推测
2. 每个候选方案必须关联至少一条证据
3. 风险评估必须引用相关规则
4. 最终输出 ModelVerdict_Predictive JSON

${params.customContext ?? ''}
`

  return [ontologySection, rulesSection, taskSection].filter(Boolean).join('\n\n')
}
```

### 5.3 自定义任务扩展

新增自定义任务只需：

1. 在 `tasks/` 下新建目录
2. 实现 `TaskPlugin` 接口
3. 注册到 `TaskRegistry`

```typescript
// tasks/custom-analysis/index.ts
import type { TaskPlugin } from '../../core/types'

export const customAnalysisPlugin: TaskPlugin = {
  type: 'custom-analysis',

  buildPrompt(params) {
    const base = buildOntologyPrompt(params.ontology)
    return `${base}\n\n# 任务：自定义分析\n${params.customContext ?? ''}`
  },

  buildTools(params) {
    // 复用 engine 通用工具 + 自定义工具
    return {
      ...createGraphTools(params.runtime),
      ...createFactTools(params.workspace, params.policy),
      // 自定义工具
      my_custom_tool: createCustomTool(),
    }
  },

  async execute(params) {
    const result = await generateText({
      model: params.model,
      system: params.systemPrompt,
      prompt: params.task.goal,
      tools: params.tools,
      stopWhen: stepCountIs(30),
      temperature: 0,
    })
    return {
      facts: [],  // 从 workspace 提取
      modelVerdict: parseCustomVerdict(result.text),
      rawText: result.text,
    }
  },

  // 不实现 critique — 该任务无需确定性评价
}
```

```typescript
// 注册
const ctx = newPipelineContext(deps)
ctx.registry.register(customAnalysisPlugin)

// 使用
const result = await ctx.runTask('custom-analysis', { goal: '...' })
```

---

## 6. 各任务详细设计

### 6.1 Diagnostic（后向归因）

**目标**：从已观测的结果出发，逆向追溯根因。

**Executor**：

```text
输入：观测结果 + 时间窗口 + 入口实体
流程：
1. 从入口实体出发，查询因果图
2. 沿因果路径回溯，收集候选根因
3. 为每个候选根因绑定证据和因果链
4. 输出 DiagnosticVerdict

工具集：
- graph_query      → 因果图遍历（engine）
- inspect_node     → 实体详情（engine）
- query_events     → 时间线查询（diagnostic 专用）
- trace_causal     → 因果路径追踪（diagnostic 专用）
- bind_fact        → 事实绑定（engine）
- record_evidence  → 证据记录（workspace）
- declare_uncertainty → 不确定性声明（workspace）
```

**Critic**：

```text
输入：facts + DiagnosticVerdict
流程：
1. 归因评分：充分性 / 必要性 / 时序一致性 / 证据强度
2. 否决检查：hard_constraint 规则否决不合理归因
3. 一致性检查：对比模型归因与规则判定
输出：AttributionResult + Reconciliation
```

### 6.2 Predictive（前向推断）

**目标**：基于当前状态预测未来结果，提出候选方案并评分。

**Executor**：

```text
输入：目标 + 入口实体
流程：
1. 探索入口实体的当前状态
2. 识别风险因素和影响因子
3. 提出候选方案/预测结果
4. 为每个候选绑定证据
5. 输出 ModelVerdict_Predictive

工具集：
- graph_query      → 关系探索（engine）
- compute_query    → 聚合分析（engine）
- inspect_node     → 实体详情（engine）
- search_nodes     → 实体搜索（engine）
- propose_candidates → 候选提案（predictive 专用）
- simulate_counterfactual → 反事实模拟（predictive 专用）
- bind_fact        → 事实绑定（engine）
- record_evidence  → 证据记录（workspace）
- declare_uncertainty → 不确定性声明（workspace）
```

**Critic**：

```text
输入：facts + ModelVerdict_Predictive + candidates
流程：
1. MCDA 评分：soft_criterion 规则加权打分
2. 否决检查：hard_constraint 规则否决不合格候选
3. 一致性检查：对比模型推荐与规则判定
输出：ScoredCandidate[] + SystemVerdict + Reconciliation
```

### 6.3 Reasoning（通用推理）

**目标**：通用语义推理，回答开放式问题。从 `engine/agent/executor.ts` 迁入。

**Executor**：

```text
输入：目标 + 可选入口实体
流程：
1. 根据目标自由探索图/数据
2. 收集相关事实和证据
3. 输出 SemanticVerdict

工具集：
- inspect_node     → 实体详情（engine）
- search_nodes     → 实体搜索（engine）
- query_neighbors  → 邻居查询（engine）
- graph_query      → 图遍历（engine）
- compute_query    → 聚合分析（engine）
- vector_query     → 语义搜索（engine）
- bind_fact        → 事实绑定（engine）
- lookup_fact      → 事实查询（engine）
- propose_candidates → 候选提案（engine）
```

**无 Critic**：通用推理任务不需要确定性评价，输出即为 Agent 的推理结论。

### 6.4 任务类型对比

| 维度     | Diagnostic       | Predictive       | Reasoning       |
| ------ | ---------------- | ---------------- | --------------- |
| 方向     | 后向（结果 → 根因）    | 前向（状态 → 预测）    | 开放式             |
| Critic | 归因评价（4 维）       | MCDA + 否决       | 无               |
| 专用工具   | 因果图、事件查询        | 候选管理、反事实模拟      | 无（全用通用工具）       |
| 输出类型   | DiagnosticVerdict | ModelVerdict_Predictive | SemanticVerdict |
| 规则使用   | 归因约束             | 评分 + 否决         | 可选（inspect only） |

---

## 7. PipelineContext 运行模型

### 7.1 runTask 流程（指定任务类型）

```text
PipelineContext.runTask('predictive', { goal, entryEntities })
  │
  ├─ 1. 从 TaskRegistry 获取 plugin
  │
  ├─ 2. 构建 Prompt
  │     plugin.buildPrompt({ task, ontology, rules })
  │     → 通用本体层 + 任务层 + 自定义扩展层
  │
  ├─ 3. 构建 Tools
  │     plugin.buildTools({ runtime, workspace, policy })
  │     → engine 通用工具 + 任务专用工具
  │
  ├─ 4. 执行 Executor
  │     plugin.execute({ task, systemPrompt, tools, model })
  │     → LLM Agent 推理循环
  │     → 收集 facts + modelVerdict
  │
  ├─ 5. 执行 Critic（如有）
  │     plugin.critique?({ task, facts, modelVerdict, runtime, ruleRegistry, ontology })
  │     → 确定性评价 + 一致性检查
  │
  └─ 6. 组装 PipelineResult
        { taskType, facts, modelVerdict, systemVerdict, reconciliation, rawText }
```

### 7.2 run 流程（自动路由）

```text
PipelineContext.run("为什么 M003 上个月交易量骤降？")
  │
  ├─ 1. Frontend.process(query)
  │     ├─ 意图分类 → 'diagnostic'
  │     ├─ 实体链接 → ['Merch:M003']
  │     └─ 无需澄清
  │     → PipelineTask { type: 'diagnostic', goal: '...', entryEntities: ['Merch:M003'] }
  │
  └─ 2. runTask('diagnostic', task)
        （同上）
```

### 7.3 streamTask 流程

```text
PipelineContext.streamTask('predictive', { goal, entryEntities })
  │
  ├─ yield { type: 'frontend', intent, entities }
  │
  ├─ yield { type: 'executor_step', toolCall, result }  (每步)
  │
  ├─ yield { type: 'fact_bound', fact }  (每条事实)
  │
  ├─ yield { type: 'model_verdict', verdict }
  │
  ├─ yield { type: 'critique_complete', result }
  │
  └─ yield { type: 'done', result: PipelineResult }
```

---

## 8. 与现有 V8 模块的集成

### 8.1 与 Engine 的关系

```text
Pipeline 不直接操作 Store，全部通过 RuntimeOrchestrator：

PipelineContext
  → TaskPlugin.execute()
    → buildTools({ runtime })  → RuntimeOrchestrator 路由
    → generateText({ tools })  → LLM 调用 Runtime → Store

engine/agent/executor.ts 的功能将拆分：
  - ReasoningTask 类型 → pipeline/core/types.ts
  - runSemanticReasoningAgent → pipeline/tasks/reasoning/executor.ts
  - buildSemanticReasoningPrompt → pipeline/tasks/reasoning/prompt.ts
  - engine/tools/* → 继续保留，pipeline 通过 runtime 引用
```

### 8.2 与 Ontology 的关系

```text
Pipeline 消费 Ontology 的方式：
  1. Frontend：使用 Ontology 类型名做实体链接
  2. Prompt：使用 buildOntologyPrompt() 生成通用本体层
  3. Critic：使用 Ontology 类型信息做规则匹配

Ontology 模块保持不变，Pipeline 是其消费者。
```

### 8.3 与 Rule 的关系

```text
Pipeline 消费 Rule 的方式：
  1. Prompt：将 RuleMetadata 注入提示词（规则摘要）
  2. Critic（predictive/diagnostic）：调用 RuleRuntime 执行评价
     - MCDA 评分（soft_criterion）
     - 否决检查（hard_constraint）
     - 一致性检查（reconciler）
  3. Tools：提供 inspect_rules / evaluate_rule 工具给 Agent

Rule 模块保持不变，Pipeline 的 Critic 是其消费者。
```

---

## 9. 迁移计划

### 9.1 从 engine/agent 迁移到 pipeline

| 原位置                         | 目标位置                             | 说明           |
| ---------------------------- | -------------------------------- | ------------ |
| engine/agent/executor.ts     | pipeline/tasks/reasoning/        | ReasoningTask + 执行器 |
| engine/agent/prompt.ts       | pipeline/tasks/reasoning/prompt.ts | 语义推理提示词      |
| engine/agent/verdict.ts      | pipeline/tasks/reasoning/verdict.ts | 结果解析         |
| engine/tools/fact-tools.ts   | pipeline 复用 engine 导出           | 通过 runtime 共享 |
| engine/tools/candidate-tools.ts | pipeline 复用 engine 导出        | 通过 runtime 共享 |

### 9.2 从 v6 迁移到 pipeline

| 原位置                       | 目标位置                          | 说明          |
| -------------------------- | ----------------------------- | ----------- |
| v6/frontend/*              | pipeline/core/frontend/*      | 意图分类、实体链接、澄清 |
| v6/agent/prompt.ts (部分)    | pipeline/tasks/predictive/prompt.ts | 推断提示词       |
| v6/agent/prompt.ts (部分)    | pipeline/tasks/diagnostic/prompt.ts | 诊断提示词       |
| v6/agent/executor.ts       | pipeline/tasks/*/executor.ts  | 按任务类型拆分      |
| v6/agent/criticPredictive  | pipeline/tasks/predictive/critic.ts | 适配 V8 Rule 模块 |
| v6/agent/criticDiagnostic  | pipeline/tasks/diagnostic/critic.ts | 适配 V8 Rule 模块 |
| v6/ontology/decision.ts    | pipeline/core/types.ts + 各任务 types.ts | 拆分通用与任务特有类型 |

### 9.3 实现优先级

| 优先级  | 模块                          | 说明                   |
| ---- | --------------------------- | -------------------- |
| P0   | PipelineContext + TaskRegistry | 核心骨架               |
| P0   | Frontend (intent + entity linker) | 入口组件            |
| P0   | Reasoning TaskPlugin        | 从 engine 迁入，端到端验证     |
| P1   | Predictive TaskPlugin       | 从 v6 迁入推断流程          |
| P1   | Diagnostic TaskPlugin       | 从 v6 迁入诊断流程          |
| P2   | Stream API                  | 流式事件支持               |
| P2   | 自定义任务扩展文档                   | 如何新增 TaskPlugin 的指南  |

---

## 10. 使用示例

### 10.1 基本使用

```typescript
import { newPipelineContext } from './pipeline'

// 创建 Pipeline 上下文
const ctx = newPipelineContext({
  graphStore,
  computeStore,
  vectorStore,
  ontology,
  ruleRegistry,
})

// 方式 1：自动路由（Frontend 识别意图）
const result = await ctx.run("哪些商户本月没有交易？")

// 方式 2：指定任务类型
const result2 = await ctx.runTask('predictive', {
  goal: '评估所有商户的风险等级',
  entryEntities: ['Merch:M001', 'Merch:M002'],
})

// 方式 3：流式执行
const stream = ctx.streamTask('diagnostic', {
  goal: '分析 M003 交易量骤降原因',
  entryEntities: ['Merch:M003'],
})
for await (const event of stream) {
  if (event.type === 'fact_bound') console.log('新事实:', event.fact)
  if (event.type === 'done') console.log('完成:', event.result)
}
```

### 10.2 自定义任务

```typescript
import { newPipelineContext } from './pipeline'
import { customAnalysisPlugin } from './pipeline/tasks/custom-analysis'

const ctx = newPipelineContext(deps)
ctx.registry.register(customAnalysisPlugin)

const result = await ctx.runTask('custom-analysis', {
  goal: '生成月度经营分析报告',
  entryEntities: ['Agent:A001'],
  customContext: '请重点关注商户流失率和交易量趋势',
})
```

### 10.3 类似 V6 test helper 模式

```typescript
// pipeline/tests/helper.ts
import { newPipelineContext } from '../core/context'

export function newTestContext() {
  const graphStore = new InMemoryGraphStore()
  const computeStore = new InMemoryComputeStore()
  const vectorStore = new InMemoryVectorStore()
  // ... seed test data

  return newPipelineContext({
    graphStore,
    computeStore,
    vectorStore,
    ontology: buildTestOntology(),
    ruleRegistry: buildTestRules(),
  })
}

export async function syncPredictiveTask(goal: string, entities?: string[]) {
  const ctx = newTestContext()
  return ctx.runTask('predictive', { goal, entryEntities: entities })
}

export async function* streamPredictiveTask(goal: string, entities?: string[]) {
  const ctx = newTestContext()
  yield* ctx.streamTask('predictive', { goal, entryEntities: entities })
}
```

---

## 附录 A：完整目录结构

```text
src/v8/pipeline/
├── core/
│   ├── context.ts              — PipelineContext（入口）
│   ├── registry.ts             — TaskRegistry（任务注册表）
│   ├── types.ts                — 公共类型（PipelineTask, PipelineResult, TaskPlugin 等）
│   └── frontend/
│       ├── index.ts            — Frontend 主入口
│       ├── intent.ts           — 意图分类（规则 + LLM 两阶段）
│       ├── entity-linker.ts    — 实体链接（多策略匹配）
│       └── clarify.ts         — 澄清生成
│
├── tasks/
│   ├── diagnostic/
│   │   ├── index.ts            — DiagnosticPlugin（TaskPlugin 实现）
│   │   ├── executor.ts         — 诊断执行器
│   │   ├── critic.ts           — 归因评价（调用 Rule 模块）
│   │   ├── prompt.ts           — 诊断提示词（本体层 + 诊断层）
│   │   ├── tools.ts            — 诊断专用工具（因果图、事件查询）
│   │   └── types.ts            — 诊断特有类型
│   │
│   ├── predictive/
│   │   ├── index.ts            — PredictivePlugin（TaskPlugin 实现）
│   │   ├── executor.ts         — 推断执行器
│   │   ├── critic.ts           — MCDA 评分 + 否决（调用 Rule 模块）
│   │   ├── prompt.ts           — 推断提示词（本体层 + 推断层）
│   │   ├── tools.ts            — 推断专用工具（候选管理、反事实模拟）
│   │   └── types.ts            — 推断特有类型
│   │
│   └── reasoning/
│       ├── index.ts            — ReasoningPlugin（TaskPlugin 实现）
│       ├── executor.ts         — 语义推理执行器（从 engine/agent 迁入）
│       ├── prompt.ts           — 语义推理提示词（从 engine/agent 迁入）
│       ├── tools.ts            — 推理工具集（引用 engine/tools）
│       ├── verdict.ts          — 结果解析（从 engine/agent 迁入）
│       └── types.ts            — 推理特有类型（SemanticVerdict 等）
│
└── index.ts                    — 模块导出
```

## 附录 B：与 V6 类型映射

| V6 类型                       | V8 Pipeline 类型                       | 说明        |
| ---------------------------- | ------------------------------------ | --------- |
| DecisionMode                 | TaskType                             | 从枚举扩展为字符串  |
| DecisionIntent               | PipelineTask.intent                  | 保留，映射到 TaskType |
| DecisionTask                 | PipelineTask                         | 通用化       |
| DecisionResponse             | PipelineResult                       | 通用化       |
| DecisionWorkspace            | Workspace (engine)                   | 复用 V8 引擎层  |
| ModelVerdict_Predictive      | predictive/types.ts                  | 任务特有      |
| DiagnosticVerdict            | diagnostic/types.ts                  | 任务特有      |
| SemanticVerdict              | reasoning/types.ts                   | 任务特有      |
| CandidateAnswer / CandidateCause | 各任务 types.ts                   | 任务特有      |
| Evidence / Uncertainty       | Workspace 绑定                        | 复用 V8 引擎层  |
| Reconciliation               | Rule 模块 reconcile 类型               | 复用 V8 规则层  |

## 附录 C：PipelineEvent 完整定义

```typescript
type PipelineEvent =
  // Frontend 阶段
  | { type: 'frontend'; intent: string; entities: string[] }
  | { type: 'clarify'; questions: ClarificationQuestion[] }

  // Executor 阶段
  | { type: 'executor_start'; taskType: TaskType }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'fact_bound'; fact: FactBinding }
  | { type: 'model_verdict'; verdict: unknown }

  // Critic 阶段
  | { type: 'critique_start' }
  | { type: 'rule_evaluated'; rule: RuleMetadata; result: RuleResult }
  | { type: 'critique_complete'; result: CritiqueResult }

  // 完成
  | { type: 'done'; result: PipelineResult }
  | { type: 'error'; error: Error }
```
