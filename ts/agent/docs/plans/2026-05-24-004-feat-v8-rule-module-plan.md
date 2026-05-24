---
title: feat: V8 Rule 模块实现
type: feat
status: active
date: 2026-05-24
origin: src/v8/docs/rule/design.md
---

# feat: V8 Rule 模块实现

## Overview

实现 V8 Rule 模块，为 Semantic Reasoning Runtime 提供确定性规则评价层。模块包含规则注册表、MCDA 评分器（含 Veto 逻辑）、Reconciler 和 Agent Tools，严格遵循设计文档 `src/v8/docs/rule/design.md` 中定义的类型、接口和目录结构。

Rule Evaluator 不是独立的子系统或物理类，而是 `Rule` 接口上的 `rule.evaluator` 异步回调函数，由 InMemoryRuleRuntime 在评估过程中直接调用。

## Problem Frame

V8 Engine 目前只有查询层（Graph/Compute/Vector）和事实层（FactStore），缺少确定性裁决能力。V6 已有完整的 Rule + MCDA + Veto + Reconciler 体系，但使用了模块级数组、DAG 排序、derived facts 等过度工程化的模式。V8 Rule 模块需要将 V6 的核心能力移植到 V8 的架构模式下：ToolResult 信封、Workspace 不可变快照、类注册表模式。

经 document-review 修正后的关键简化：
- Rule Evaluator 降级为 `rule.evaluator` 回调函数，非独立子系统
- Veto 逻辑内嵌于评分器，不单独成文件
- 第一阶段不建立 `rule/provider/` 子层级，实现直接放在 `rule/runtime/` 和 `rule/registry/`
- VetoConfig 扩展支持 `candidatesById` 精准否决，规避 label 层面的 collateral 误杀
- Agent Tools 补全 PolicyContext 权限校验

## Requirements Trace

- R1. Rule 类型系统 — RuleKind (hard_constraint/soft_criterion), RuleDirection, RequiredFact, VetoConfig (含 candidatesById), Rule
- R2. RuleContext 与 V8 FactStore/GraphStore 集成 — graph 可选、新增 now 字段
- R3. RuleResult 包含 triggered/explanation/missingFacts/error
- R4. InMemoryRuleRegistry — 基于 Map 的类注册表，register/get/resolve/list/clear
- R5. InMemoryRuleRuntime 门面 — evaluateRules/scoreCandidates/generateVerdict/evaluateRule/inspectRules/reconcile
- R6. MCDA Direction-aware Scoring — DEFAULT_DIRECTION_MAPPING + 评分公式 + 归一化 + 内嵌 Veto 逻辑
- R7. Veto — hard_constraint 触发即否决候选（支持 candidatesByLabel + candidatesById 双通道）
- R8. Confidence Estimation — 基于 missingFacts 比率计算，不用 LLM 自报
- R9. SystemVerdict 输出 — ScoredCandidate 排序、recommendedCandidateId
- R10. Reconciler — SemanticVerdict 与 SystemVerdict 一致性检查
- R11. Agent Tools — inspect_rules/evaluate_rule/inspect_verdict/reconcile_verdict，统一 ToolResult 信封，含 PolicyContext 权限校验
- R12. RuleRuntimeConfig 配置 — 合理默认值 + createRuleRuntimeConfig 工厂
- R13. 模块 barrel export — index.ts 导出全部公共 API
- R14. 图书馆领域 Demo 规则 — 展示完整使用流程

## Scope Boundaries

- 不实现 Rule DAG / dependsOn / inference_rule（Phase 1 延迟）
- 不实现动态校准 / feedback learning / rule hot reload
- 不修改 Engine 模块现有代码（Rule 模块是独立下游消费者）
- 不实现外部 Provider（数据库持久化规则），仅内存实现
- 不修改 FactStore 或 Workspace 的接口

## Context & Research

### Relevant Code and Patterns

- `src/v8/docs/rule/design.md` — V8 Rule 完整设计文档（类型、接口、骨架、目录结构）
- `src/v6/ontology/rules.ts` — V6 Rule 类型 + 模块级数组注册表（移植源）
- `src/v6/ontology/ruleDag.ts` — V6 规则评估（线性扫描逻辑移植源）
- `src/v6/ontology/scoring.ts` — V6 MCDA 评分（Direction Mapping + scoreCandidates 移植源）
- `src/v6/agent/tools/rules.ts` — V6 Rule Tools（tool 定义移植源）
- `src/v8/engine/runtime/types.ts` — ToolResult/toolOk/toolErr/FactBinding（必须复用）
- `src/v8/engine/stores/fact-store.ts` — FactStore（RuleContext.facts 类型来源）
- `src/v8/engine/stores/graph-store.ts` — GraphStore（RuleContext.graph 类型来源）
- `src/v8/engine/runtime/workspace.ts` — Workspace（createRuleTools 依赖）
- `src/v8/engine/runtime/config.ts` — Config 模式参考（类型 + 默认值 + 工厂函数）
- `src/v8/engine/tools/fact-tools.ts` — Tool 工厂模式参考（createFactTools + tool() + Zod）
- `src/v8/ontology/registry.ts` — 注册表模式参考（AgentRegistry + Map + clear）
- `src/v8/engine/agent/verdict.ts` — SemanticVerdict 类型（Reconciler 依赖）
- `src/v8/policy/context.ts` — PolicyContext（createRuleTools 依赖）
- `src/v8/policy/filters.ts` — maybeLogToolCall（所有 tool 必须调用）

### Institutional Learnings

- FactStore 必须保持只读 — Rule Runtime 不允许写入 FactStore 或 Workspace
- Direction Mapping 是评分合理性的前提，不是可选特性
- Veto 是安全闸门，优先级高于所有 soft score
- Confidence 基于事实完整度而非 LLM 自报，确保可重放
- Rule evaluator 中的 `note` 字段防止 LLM 试图推断最终分数
- `now?: Date` 在 RuleContext 中注入确保确定性测试

### External References

- 无需外部研究 — V6 已有完整参考实现，V8 设计文档已定义所有类型和接口

## Key Technical Decisions

- **RuleRegistry 使用实例类（非 static）**：V6 用模块级数组，V8 ontology 用 static 类。Rule 模块选择实例类（`new InMemoryRuleRegistry()`），因为不同 runtime 实例可能需要不同的规则集，比 static 更灵活、测试更隔离。
- **InMemoryRuleRuntime 作为门面组合子模块**：registry/scorer/reconciler 作为构造参数注入，RuleRuntime 只做编排不做业务逻辑，与 SemanticRuntimeOrchestrator 模式一致。实现类命名为 `InMemoryRuleRuntime`，Phase 1 不建立 provider 子层级。
- **Rule Evaluator 降级为回调函数**：`rule.evaluator` 是 Rule 接口上的异步回调，不是独立子系统或类。InMemoryRuleRuntime 在评估过程中直接调用该回调闭包。
- **VetoConfig 支持 candidatesById 精准否决**：除 candidatesByLabel 批量否决外，新增 candidatesById 可选字段，按精确候选 ID 否决，防范同标签候选的 collateral 误杀与 label 命名漂移。Veto 引擎同时遍历两集合。
- **Veto 逻辑内嵌于评分器**：不单独建立 `veto.ts`，Veto 检查作为 MCDA 评分流程的初始步骤，评分器统一处理。
- **评分归一化使用 min-max**：V6 使用 `(rawScore - minScore) / (maxScore - minScore || 1)`，V8 沿用此公式，简单且有效。
- **ToolResult 信封统一**：所有 Runtime 方法和 Tool 返回值使用 `ToolResult<T>`，evaluateRule 返回 `ToolResult<RuleResult>` 而非裸 `RuleResult`。
- **候选来源由调用方提供**：RuleRuntime 不持有 Workspace 引用，candidates 由调用方（Executor 或 Demo）传入 VerdictInput。
- **Agent Tools 含 PolicyContext 权限校验**：evaluate_rule 在指定 entityId 时校验 `policy.isEntityAllowed(entityId)`；inspect_rules 加入类型/意图层面的权限校验分支。

## Open Questions

### Resolved During Planning

- Q: RuleRegistry 应该用 static 类还是实例类？ → 实例类，理由见 Key Technical Decisions
- Q: RuleRuntime 是否持有 Workspace 引用？ → 不持有，只消费 FactStore 快照
- Q: 归一化公式？ → 沿用 V6 的 min-max 归一化
- Q: Rule Evaluator 是独立子系统吗？ → 不是，降级为 `rule.evaluator` 回调闭包（coherence + scope-guardian 建议）
- Q: 是否需要 `rule/provider/` 子层级？ → Phase 1 不需要，实现直接放在 runtime/ 和 registry/，待引入第二个 Provider 时再分包（scope-guardian 建议）
- Q: Veto 是否需要精准否决？ → 是，VetoConfig 增加 candidatesById，防范 label 层面 collateral 误杀（adversarial 建议）
- Q: Agent Tools 是否需要权限校验？ → 是，evaluate_rule 校验 isEntityAllowed，inspect_rules 加入权限分支（feasibility 建议）

### Deferred to Implementation

- V8 Engine Executor 集成（`runAgentWithRules`）的具体调用时机和模式选择（模式 A LLM Only vs 模式 B LLM + Rule）— 取决于 Engine 模块后续演进
- Demo 规则的具体领域和数量 — 实现时根据效果调整

## Implementation Units

- [ ] **Unit 1: 类型系统与配置**

**Goal:** 定义 Rule 模块所有核心类型和配置常量，作为后续所有实现单元的基础

**Requirements:** R1, R2, R3, R8, R9, R12

**Dependencies:** None

**Files:**
- Create: `src/v8/rule/types/rule.ts`
- Create: `src/v8/rule/types/context.ts`
- Create: `src/v8/rule/types/verdict.ts`
- Create: `src/v8/rule/types/scoring.ts`
- Create: `src/v8/rule/types/reconcile.ts`
- Create: `src/v8/rule/runtime/config.ts`

**Approach:**
- 类型文件直接从 design.md 第 16 章"完整类型定义"移植，适配 V8 import 路径
- Rule/RuleKind/RuleDirection/RequiredFact/VetoConfig (含 candidatesById) → `types/rule.ts`
- RuleContext/RuleResult/MissingFact → `types/context.ts`，import FactStore from engine/stores/fact-store, GraphStore from engine/stores/graph-store
- Candidate/ScoredCandidate/SystemVerdict → `types/verdict.ts`
- EvaluatedRule/CandidateScoringInput/DirectionMapping → `types/scoring.ts`
- ReconcileInput/ReconcileResult → `types/reconcile.ts`，import SemanticVerdict from engine/agent/verdict
- RuleFilter/RuleMetadata/RuleEvaluationInput/RuleEvaluationOutput/VerdictInput → `types/rule.ts`（按语义归属）
- Config: RuleRuntimeConfig + DEFAULT_RULE_RUNTIME_CONFIG + createRuleRuntimeConfig → `runtime/config.ts`，与 engine/runtime/config.ts 模式一致

**Patterns to follow:**
- `src/v8/engine/runtime/types.ts` — 类型定义风格（type alias + helper functions）
- `src/v8/engine/runtime/config.ts` — Config 模式（type + DEFAULT const + factory function）

**Test scenarios:**
- Happy path: DEFAULT_RULE_RUNTIME_CONFIG 包含所有字段，默认值正确
- Happy path: createRuleRuntimeConfig({}) 返回默认配置
- Happy path: createRuleRuntimeConfig({ maxRulesPerEvaluation: 50 }) 只覆盖指定字段
- Edge case: RuleKind 只接受 'hard_constraint' | 'soft_criterion'
- Edge case: RuleDirection 只接受 'risk_up' | 'risk_down' | 'neutral'
- Edge case: VetoConfig.candidatesByLabel 和 candidatesById 均可选，但至少一个有值
- Edge case: VetoConfig.candidatesById 支持精准否决特定候选

**Verification:**
- tsc 编译通过，所有类型可从外部 import
- DEFAULT_RULE_RUNTIME_CONFIG 字段值与设计文档一致

---

- [ ] **Unit 2: InMemoryRuleRegistry**

**Goal:** 实现规则注册表，提供 register/get/resolve/list/clear API

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/rule/registry/registry.ts`
- Test: `src/v8/rule/tests/registry.test.ts`

**Approach:**
- 实现 `RuleRegistry` 接口 + `InMemoryRuleRegistry` 类
- 使用 `Map<string, Rule>` 内部存储
- `register()` 重复 ID 抛 Error
- `resolve()` 无参返回全部；有参按 ID 过滤，跳过不存在的
- `list()` 支持 RuleFilter（entityType/kind/intent），intent 过滤使用 INTENT_KEYWORDS 映射
- `clear()` 清空 Map，用于测试隔离
- INTENT_KEYWORDS 常量与 design.md 第 3.4 节一致

**Patterns to follow:**
- `src/v8/ontology/registry.ts` — AgentRegistry 的 Map + register/get/list/clear 模式
- `src/v6/ontology/rules.ts` — queryRules 的 intent 过滤逻辑

**Test scenarios:**
- Happy path: register + get 返回已注册 Rule
- Happy path: list() 无 filter 返回全部
- Happy path: list({ entityType: 'Merch' }) 只返回 appliesTo 含 'Merch' 的规则
- Happy path: list({ kind: 'hard_constraint' }) 只返回 hard_constraint 规则
- Happy path: list({ intent: 'risk_assessment' }) 按 INTENT_KEYWORDS 过滤
- Happy path: resolve(['id1', 'id2']) 返回指定规则，跳过不存在的 ID
- Happy path: resolve() 无参返回全部
- Happy path: clear() 后 list() 返回空数组
- Error path: register 重复 ID 抛 Error
- Edge case: 空 Registry 上 get 返回 undefined
- Edge case: list 多个 filter 同时指定时取交集

**Verification:**
- 所有测试通过
- Registry 方法签名与 design.md RuleRegistry 接口一致

---

- [ ] **Unit 3: MCDA Scorer（含内嵌 Veto 逻辑）**

**Goal:** 实现 Direction-aware 评分器，包含评分公式、归一化、置信度计算和 Veto 逻辑

**Requirements:** R6, R7, R8

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/rule/runtime/scoring.ts`
- Test: `src/v8/rule/tests/scoring.test.ts`

**Approach:**
- 从 V6 `scoring.ts` 移植并简化
- `DEFAULT_DIRECTION_MAPPING` 常量（增加 ALLOWED/DENIED 标签）
- `MCDAScorer` 接口 + `DefaultMCDAScorer` 类
- `score()` 方法：遍历 candidates → 检查 veto（candidatesByLabel + candidatesById 双通道）→ 计算 rawScore → 归一化 → 排序
- 评分公式：`rawScore = Σ(weight × dirContrib)` 仅统计 triggered=true 的 soft_criterion
- 归一化：min-max `(rawScore - min) / (max - min || 1)`，保留两位小数
- 置信度：`max(0, 1 - missingRatio × missingFactPenalty)`
- Veto 候选：rawScore=-Infinity, normalizedScore=0, confidence=0
- **Veto 逻辑内嵌于评分流程**：不单独建立 veto.ts，作为 score() 的初始步骤统一处理
- Veto 检查同时遍历 candidatesByLabel（按标签批量否决）和 candidatesById（按 ID 精准否决）

**Patterns to follow:**
- `src/v6/ontology/scoring.ts` — scoreCandidates 完整逻辑（含 Veto 检查）

**Test scenarios:**
- Happy path: risk_up 规则触发 → HIGH 得分 > LOW 得分
- Happy path: candidatesByLabel veto → 该标签所有候选被否决
- Happy path: candidatesById veto → 仅指定 ID 的候选被否决（精准否决）
- Integration: candidatesByLabel + candidatesById 同时生效 → 两集合候选均被否决
- Happy path: vetoed 候选 rawScore = -Infinity, normalizedScore = 0, confidence = 0
- Happy path: confidence 随 missingFacts 增加而降低
- Integration: 完整评分流程 (evaluateRules → score → verdict)

**Verification:**
- 所有测试通过
- candidatesById 精准否决无 collateral 误杀

---

- [ ] **Unit 4: Reconciler**

**Goal:** 实现模型判决与系统判决的一致性检查器

**Requirements:** R10

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/rule/runtime/reconciler.ts`
- Test: `src/v8/rule/tests/reconciler.test.ts`

**Approach:**
- 实现 `Reconciler` 接口 + `DefaultReconciler` 类
- `compare()` 从 SemanticVerdict.answer 提取模型结论，与 SystemVerdict.recommendedCandidateId 对应的 label 对比
- 一致时 agreed=true；不一致时 agreed=false + reason 描述
- 特殊情况：SystemVerdict 无推荐候选（全部 vetoed）时，reason 说明
- 特殊情况：SemanticVerdict.answer 无法匹配任何候选 label 时，记录 mismatch

**Patterns to follow:**
- V6 Critic 中的 reconciler 逻辑

**Test scenarios:**
- Happy path: 模型与系统推荐一致 → agreed=true
- Happy path: 模型选 HIGH，系统推荐 HIGH → agreed=true
- Error path: 模型选 ALLOWED，系统推荐 DENIED → agreed=false, reason 包含冲突描述
- Edge case: SystemVerdict 无推荐候选 → agreed=false, reason 说明
- Edge case: SemanticVerdict.answer 不匹配任何候选 label → agreed=false

**Verification:**
- 所有测试通过
- 冲突场景能正确检测并报告

---

- [ ] **Unit 5: InMemoryRuleRuntime 门面**

**Goal:** 实现 RuleRuntime 门面类，编排 Registry + Evaluator + Scorer + Reconciler

**Requirements:** R5, R7, R9

**Dependencies:** Unit 2, Unit 3, Unit 4

**Files:**
- Create: `src/v8/rule/runtime/rule-runtime.ts`
- Test: `src/v8/rule/tests/rule-runtime.test.ts`

**Approach:**
- 实现 `RuleRuntime` 接口 + `InMemoryRuleRuntime` 类（Phase 1 不建立 provider 子层级）
- 构造参数：registry, scorer, reconciler, config
- `evaluateRules()` — 从 registry resolve rules → 按 appliesTo 过滤实体 → 逐规则调用 evaluator 回调 → 收集 vetoedLabels + vetoedIds
- `scoreCandidates()` — 委托 MCDAScorer
- `generateVerdict()` — evaluateRules + scoreCandidates + 排序 → SystemVerdict
- `evaluateRule()` — 单条规则评估，返回 ToolResult<RuleResult>
- `inspectRules()` — 返回 ToolResult<RuleMetadata[]>
- `reconcile()` — 委托 Reconciler
- 私有方法 `evaluateSingleRule()` 含 try-catch，异常返回 { triggered: false, error }
- 私有方法 `filterMatchingEntities()` 通过 GraphStore.getNode 解析实体类型
- **Rule Evaluator 降级为回调**：直接调用 rule.evaluator(ctx)，非独立子系统

**Patterns to follow:**
- `src/v8/engine/runtime/orchestrator.ts` — 门面类编排多个子模块的模式
- `src/v6/ontology/ruleDag.ts` — evaluateRuleDag 的逐规则逐实体评估逻辑

**Test scenarios:**
- Happy path: evaluateRules 返回所有规则的评估结果
- Happy path: evaluateRules 按 appliesTo 过滤实体（只评估匹配的实体）
- Happy path: generateVerdict 返回 SystemVerdict，推荐得分最高的非 vetoed 候选
- Happy path: evaluateRule 返回 ToolResult<RuleResult>，ok=true
- Error path: evaluateRule 规则不存在 → ToolResult error, code=NOT_FOUND
- Error path: evaluator 抛异常 → triggered=false, error 有值
- Happy path: inspectRules 返回 ToolResult<RuleMetadata[]>
- Integration: 完整流程 evaluateRules → scoreCandidates → generateVerdict
- Edge case: 空 ruleIds → evaluateRules 评估全部规则
- Edge case: 空 entityIds → 全局规则评估（不绑定 entityId）

**Verification:**
- 所有测试通过
- RuleRuntime 方法签名与 design.md RuleRuntime 接口一致
- 所有公开方法返回 ToolResult 信封

---

- [ ] **Unit 6: Agent Tools**

**Goal:** 实现 4 个 Rule Agent Tools，遵循 V8 Tool 工厂模式，含 PolicyContext 权限校验

**Requirements:** R11

**Dependencies:** Unit 1, Unit 5

**Files:**
- Create: `src/v8/rule/tools/rule-tools.ts`
- Create: `src/v8/rule/tools/inspect-rules.ts`
- Create: `src/v8/rule/tools/evaluate-rule.ts`
- Create: `src/v8/rule/tools/inspect-verdict.ts`
- Create: `src/v8/rule/tools/reconcile-verdict.ts`
- Test: `src/v8/rule/tests/rule-tools.test.ts`

**Approach:**
- `createRuleTools(runtime, workspace, graphStore, policy)` 工厂函数返回 4 个 tool
- 每个 tool 使用 `tool()` from `ai` + Zod inputSchema
- 每个 tool 的 execute 调用 `maybeLogToolCall()` 审计
- 每个 tool 返回 `ToolResult`（通过 runtime 方法间接，或直接 toolOk/toolErr）
- `inspect_rules` — 调用 `runtime.inspectRules(filter)`，**补全类型/意图层面的权限校验分支**
- `evaluate_rule` — 构建 RuleContext (facts from workspace.getFacts(), graph, entityId, now) → **若指定 entityId，校验 `policy.isEntityAllowed(entityId)`，拒绝返回 PERMISSION_DENIED** → 调用 `runtime.evaluateRule(ruleId, ctx)`
- **now 字段更新**：`workspace.getSessionClock?.() || new Date()` 替代直接 `new Date()`，确保确定性测试
- `inspect_verdict` — 检查 currentVerdict 是否存在 → toolOk 或 toolErr(PRECONDITION_FAILED)
- `reconcile_verdict` — 构建 SemanticVerdict → 调用 `runtime.reconcile()`
- Tool 内部维护 `currentVerdict` 状态（闭包变量），由外部调用方更新
- `evaluate_rule` 输出保留 `note` 字段："The critic uses this result for scoring. Do not attempt to infer the final score."

**Patterns to follow:**
- `src/v8/engine/tools/fact-tools.ts` — createFactTools 工厂模式 + checkEntityAccess 权限校验
- `src/v6/agent/tools/rules.ts` — V6 rule tool 定义和 note 字段

**Test scenarios:**
- Happy path: inspect_rules 返回规则列表
- Happy path: evaluate_rule 返回 triggered=true 的结果
- Error path: evaluate_rule 规则不存在 → ToolResult error, NOT_FOUND
- **Error path: evaluate_rule entityId 无权限 → PERMISSION_DENIED**
- Happy path: inspect_verdict 返回当前 SystemVerdict
- Error path: inspect_verdict 无 verdict → PRECONDITION_FAILED
- Happy path: reconcile_verdict 一致时 agreed=true
- Error path: reconcile_verdict 无 system verdict → PRECONDITION_FAILED
- Integration: 完整 tool 调用链 inspect_rules → evaluate_rule → inspect_verdict → reconcile_verdict

**Verification:**
- 所有测试通过
- 每个 tool 返回 ToolResult 信封
- 每个 tool 调用 maybeLogToolCall
- evaluate_rule 含权限校验逻辑

---

- [ ] **Unit 7: Demo 规则与集成验证**

**Goal:** 创建图书馆领域的 Demo 规则，验证 Rule 模块与 V8 Engine 的端到端集成

**Requirements:** R14, R13

**Dependencies:** Unit 5, Unit 6

**Files:**
- Create: `src/v8/rule/demo/library/rules.ts`
- Create: `src/v8/rule/index.ts`
- Test: `src/v8/rule/demo/library/rules.test.ts`

**Approach:**
- Demo 规则定义 4-6 条图书馆领域规则（hard_constraint + soft_criterion 混合）
  - hard_constraint: `rule_blacklist` (黑名单不可借), `rule_protection_period` (新书保护期)
  - soft_criterion: `rule_good_history` (借阅历史良好), `rule_low_violation` (违约率低)
- **Phase 1 不建立 provider 子层级**：InMemoryRuleRegistry 在 `registry/registry.ts`，InMemoryRuleRuntime 在 `runtime/rule-runtime.ts`，待引入第二个 Provider 时再分包
- `index.ts` — barrel export，分组导出类型、运行时、注册表、工具（无 provider 子目录）
- Demo 测试使用 InMemoryGraphStore + InMemoryFactStore 构建完整场景
- 工厂函数 `createRuleRuntime(registry, config?)` 创建预配置的 InMemoryRuleRuntime

**Patterns to follow:**
- `src/v8/engine/index.ts` — barrel export 分组风格
- `src/v6/demo/ex4/rules.ts` — V6 Demo 规则定义风格

**Test scenarios:**
- Happy path: Demo 规则注册后可通过 registry.list() 查询
- Happy path: 黑名单规则触发 → LOW 候选被 veto（candidatesByLabel 或 candidatesById）
- Happy path: 保护期规则触发 → ALLOWED 候选被 veto
- Happy path: soft_criterion 规则触发 → Direction 正确影响评分
- Integration: 完整 generateVerdict 流程 → SystemVerdict 包含正确推荐
- Happy path: barrel export 可从外部 import 所有公共 API

**Verification:**
- 所有测试通过
- Demo 场景完整展示 hard_constraint veto + soft_criterion scoring
- `src/v8/rule/index.ts` 导出的 API 与 design.md 目录结构对应（无 provider 子目录）

## System-Wide Impact

- **Interaction graph:** Rule 模块消费 engine 的 FactStore/GraphStore/Workspace/ToolResult，不修改它们。Rule Tools 通过 createRuleTools 工厂与 Engine Tools 并行注入 Executor。
- **Error propagation:** Rule evaluator 异常被捕获为 { triggered: false, error }，不向上冒泡。Tool 层通过 ToolResult error code 传递（NOT_FOUND, PRECONDITION_FAILED, INTERNAL_ERROR）。
- **State lifecycle risks:** currentVerdict 是 tool 层闭包状态，需要在 generateVerdict 调用后更新。如果 Engine Executor 未调用 generateVerdict，inspect_verdict/reconcile_verdict 会返回 PRECONDITION_FAILED。
- **API surface parity:** RuleRuntime 方法签名与 design.md 定义完全一致，ToolResult 信封与 Engine 保持统一。
- **Integration coverage:** Unit 7 的 Demo 测试覆盖 Engine + Rule 的端到端集成。
- **Unchanged invariants:** FactStore 只读、Workspace 不可由 Rule 修改、ToolResult 信封格式不变。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| V6 scoring 移植时遗漏边界条件 | 逐函数对比 V6 scoring.ts，保留原有测试场景 |
| Reconciler 的 answer-to-label 匹配可能不精确 | 使用大小写不敏感匹配 + 候选 label 别名表 |
| Tool 闭包状态 currentVerdict 可能与实际不同步 | 文档明确调用顺序：generateVerdict → inspect_verdict |
| Zod v4 API 与 v3 细微差异 | 参考现有 V8 tools 中已验证的 Zod 用法 |
| candidatesByLabel collateral 误杀 | VetoConfig 增加 candidatesById 精准否决通道（adversarial 建议） |
| PolicyContext 权限校验遗漏 | evaluate_rule 必须校验 isEntityAllowed，inspect_rules 加入权限分支（feasibility 建议） |
| SessionClock 未实现导致 now 不确定性 | Workspace.getSessionClock 待 Engine 实现，现阶段 fallback 到 new Date() |

## Documentation / Operational Notes

- `src/v8/docs/rule/design.md` 已是完整设计文档，实现完成后无需额外文档
- Demo 规则文件 `demo/library/rules.ts` 即为使用示例

## Sources & References

- **Origin document:** [design.md](src/v8/docs/rule/design.md)
- V6 Rule 代码: `src/v6/ontology/rules.ts`, `src/v6/ontology/ruleDag.ts`, `src/v6/ontology/scoring.ts`
- V6 Tools: `src/v6/agent/tools/rules.ts`
- V8 Engine 参考: `src/v8/engine/runtime/orchestrator.ts`, `src/v8/engine/runtime/config.ts`, `src/v8/engine/tools/fact-tools.ts`
- V8 Registry 参考: `src/v8/ontology/registry.ts`
