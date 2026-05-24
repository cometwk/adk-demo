---
title: feat: V8 Pipeline Module Implementation
type: feat
status: active
date: 2026-05-24
origin: src/v8/docs/pipeline/draft.md
deepened: 2026-05-24
---

# V8 Pipeline Module Implementation

## Overview

Implement V8 Pipeline module as top-level orchestrator coordinating Engine + Ontology + Rule. This refactors V6 pipeline and V8 engine/agent into a unified, extensible task plugin architecture.

## Problem Frame

V6 pipeline has hardcoded task types (predictive/diagnostic), V8 engine/agent exists but lacks pipeline structure. Need unified orchestrator with:
- Pluggable task types via TaskPlugin interface
- Frontend embedded for intent classification + entity linking
- Per-task executor/critic/prompt/tools
- Stream/sync dual API

## Requirements Trace

From design document (Section 9.3 priorities):

- **R1.** PipelineContext + TaskRegistry core skeleton (P0)
- **R2.** Frontend with intent classification + entity linker (P0)
- **R3.** Reasoning TaskPlugin migrated from engine/agent (P0)
- **R4.** Predictive TaskPlugin migrated from v6 (P1)
- **R5.** Diagnostic TaskPlugin migrated from v6 (P1)
- **R6.** Stream API support (P2)

## Scope Boundaries

**In scope:**
- Pipeline core module (context, registry, types, frontend)
- Reasoning task plugin (migrate from engine/agent)
- Predictive task plugin (migrate from v6)
- Diagnostic task plugin (migrate from v6)
- Basic sync API (runTask, run)
- Test helpers matching v6 patterns

**Out of scope (P2/future):**
- Stream API (streamTask, stream)
- EventStore/CausalGraph for diagnostic
- Custom task extension documentation
- Reconciler UI integration

## Context & Research

### Relevant Code and Patterns

**V8 patterns to follow:**
- `src/v8/engine/runtime/orchestrator.ts` — RuntimeOrchestrator interface + impl pattern
- `src/v8/rule/registry/registry.ts` — Registry pattern with register/get/list
- `src/v8/rule/tools/rule-tools.ts` — Tool factory pattern (runtime, workspace, policy injection)
- `src/v8/ontology/prompt.ts` — `buildOntologyPrompt(ontology)` prompt builder

**V6 patterns to migrate:**
- `src/v6/frontend/intent.ts` — Two-pass intent classification (rule-based + LLM fallback)
- `src/v6/frontend/entityLinker.ts` — NER + resolution + ambiguity scoring
- `src/v6/agent/executor.ts` — Executor with tool loop and verdict parsing
- `src/v6/tests/1-graph/helper.ts` — Test helper pattern (newAgentContext, sync/stream agents)

### Technology Stack

- TypeScript 5.7.3 (ES2022, strict mode)
- Vercel AI SDK (`ai` package) — `generateText`, `tool`, `stepCountIs`
- Zod v4 — Schema validation for tool inputs
- Vitest — Test framework

### Institutional Learnings

From design documents:
- **Two-pass classification**: Rule-based fast path, LLM fallback for low confidence
- **Deterministic Critic**: No LLM calls in Critic layer for reproducibility
- **Runtime routing**: All tools go through RuntimeOrchestrator → Store
- **Workspace per-call**: Isolate facts between concurrent runTask calls

**Test scenario source:**
- `src/ex/doc/use-case.md` — Enhanced library domain model (6 types/10 relations/8 constraints)
- `src/ex/use-case.ts` — S0-S10 test scenarios with verification points
- Test scenarios cover: 2-hop cross-entity, overdue traversal, category restrictions, series ordering, inter-library loan, reverse aggregation

## Key Technical Decisions

1. **Pipeline as top-level orchestrator** (see origin: Section 1)
   - Pipeline coordinates Engine, Ontology, Rule; Engine only provides data access

2. **TaskPlugin interface contract** (see origin: Section 2.2)
   - `type`, `buildPrompt`, `buildTools`, `execute`, optional `critique`
   - Enables directory-based extensibility without core changes

3. **Frontend embedded in Pipeline** (see origin: Section 4)
   - Intent classification + entity linking + clarification inside pipeline
   - DefaultFrontend receives GraphStore + Ontology via constructor

4. **Workspace per-call isolation** (see origin: Section 7.1)
   - New Workspace created for each runTask/streamTask call
   - RuntimeOrchestrator receives workspace per-execute (or per-call instance)

5. **Registry public readonly** (see origin: Section 3.1)
   - Allows query but discourages runtime mutation (avoid race conditions)
   - Plugins passed via PipelineDeps.plugins at construction

6. **Clarification callback mechanism** (see origin: Section 7.2)
   - `run()` returns `PipelineResult | ClarificationRequest`
   - `runAfterClarify(query, answers)` for resolution

## Open Questions

### Resolved During Planning

- **Workspace/RuntimeOrchestrator relationship**: Per-call workspace, orchestrator receives workspace in execute params (design modified)
- **Intent classification for reasoning**: Added keyword rules + LLM schema extension (see origin: Section 4.3)
- **PipelineDeps completeness**: Added model, frontend, plugins fields (see origin: Section 3.2)
- **Error handling patterns**: TaskTypeNotFoundError, PromptBuildError, ExecuteError defined; critique failure non-blocking (see Unit 3)

### Deferred to Implementation

- **context vs customContext type conversion**: How to render `PipelineTask.context: Record<string, unknown>` into prompt string — implementer decides adapter pattern
- **EventStore/CausalGraph for Diagnostic**: P1 scope; may need new V8 engine types or remain in task directory
- **Stream API implementation details**: P2; requires `streamText` from Vercel AI SDK, event extraction patterns

## Implementation Units

### Phase 1: Core Skeleton (P0)

- [ ] **Unit 1: Core Types and TaskPlugin Interface**

**Goal:** Define foundational types for Pipeline module

**Requirements:** R1

**Dependencies:** None

**Files:**
- Create: `src/v8/pipeline/core/types.ts`
- Test: `src/v8/pipeline/tests/types.test.ts`

**Approach:**
- Define `TaskType`, `PipelineTask`, `PipelineResult`, `ClarificationQuestion`, `ClarificationRequest`
- Define `TaskPlugin` interface (type, buildPrompt, buildTools, execute, critique?)
- Define `PromptParams`, `ToolParams`, `ExecuteParams`, `CritiqueParams`
- Define `TaskExecuteResult`, `CritiqueResult`
- Import existing types: `Ontology`, `Workspace`, `PolicyContext`, `RuntimeOrchestrator`, `RuleRegistry`
- Follow pattern from `src/v8/engine/runtime/types.ts` (ToolResult envelope)

**Patterns to follow:**
- `src/v8/rule/types/rule.ts` — Domain types with clear enums
- `src/v8/engine/runtime/types.ts` — Discriminated union pattern

**Test scenarios:**
- Happy path: TaskPlugin interface type-checks correctly
- Edge case: Optional critique method is correctly typed
- Edge case: PipelineTask.context accepts Record<string, unknown>

**Verification:**
- Types compile without errors
- Test file passes type assertions

---

- [ ] **Unit 2: TaskRegistry**

**Goal:** Implement registry for task plugin management

**Requirements:** R1

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/pipeline/core/registry.ts`
- Test: `src/v8/pipeline/tests/registry.test.ts`

**Approach:**
- Define `TaskRegistry` interface with register, get, list methods
- Implement `InMemoryTaskRegistry` with `Map<TaskType, TaskPlugin>`
- Constructor accepts optional initial plugins array
- Follow pattern from `src/v8/rule/registry/registry.ts`

**Patterns to follow:**
- `src/v8/rule/registry/registry.ts` — InMemoryRuleRegistry pattern
- Interface + in-memory implementation separation

**Test scenarios:**
- Happy path: Register plugin, get returns it
- Happy path: List returns all registered types
- Edge case: Get unknown type returns undefined
- Edge case: Register duplicate type replaces previous

**Verification:**
- All registry methods work correctly
- Tests pass with InMemoryTaskRegistry

---

- [ ] **Unit 3: PipelineContext Core**

**Goal:** Implement PipelineContext with runTask method (sync only)

**Requirements:** R1, R3 (partial)

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/v8/pipeline/core/context.ts`
- Create: `src/v8/pipeline/index.ts` (module export)
- Test: `src/v8/pipeline/tests/context.test.ts`

**Approach:**
- Define `PipelineDeps` type (graphStore, computeStore, vectorStore, ontology, ruleRegistry, model?, frontend?, plugins?)
- Implement `PipelineContext` class with:
  - `readonly registry: TaskRegistry`
  - Private frontend, runtime, ontology, ruleRegistry, model
  - Constructor builds registry, DefaultFrontend, per-call workspace strategy
  - `runTask(type, task)` → creates workspace, gets plugin, builds prompt/tools, executes, critiques (if present)
- Factory function `newPipelineContext(deps)`
- Note: Per-call workspace pattern requires passing workspace to tool params

**Patterns to follow:**
- `src/v8/engine/runtime/orchestrator.ts` — Constructor DI pattern
- `src/v8/engine/agent/executor.ts` — Workspace creation per-call

**Technical design:**
```
runTask flow:
1. workspace = new Workspace()
2. plugin = registry.get(type)
   → if undefined: throw TaskTypeNotFoundError(type)
3. prompt = plugin.buildPrompt({task, ontology, rules})
   → if throws: propagate error, wrap as PromptBuildError
4. tools = plugin.buildTools({runtime, workspace, policy})
5. result = plugin.execute({task, prompt, tools, model})
   → if throws: propagate error, wrap as ExecuteError
6. if plugin.critique: critiqueResult = plugin.critique(...)
   → if throws: log warning, proceed without systemVerdict (critique is optional)
7. return PipelineResult
```

**Error handling contract:**
- TaskTypeNotFoundError: `{ type: 'task_type_not_found', taskType: string, message: string }`
- PromptBuildError: `{ type: 'prompt_build_error', taskType: string, cause: Error }`
- ExecuteError: `{ type: 'execute_error', taskType: string, cause: Error }`
- Critique failure: Non-blocking, result.systemVerdict undefined, reconciliation undefined

**Test scenarios:**
- Happy path: runTask with known type returns result
- Error path: runTask with unknown type throws TaskTypeNotFoundError
- Error path: plugin.buildPrompt throws → PromptBuildError propagated
- Error path: plugin.execute throws → ExecuteError propagated
- Edge path: plugin.critique throws → result returned without systemVerdict
- Integration: Workspace isolation between concurrent calls (mock test)

**Verification:**
- PipelineContext instantiates with minimal deps
- runTask executes registered plugin
- Module exports correct types and factory

---

- [ ] **Unit 4: Frontend - Intent Classification**

**Goal:** Implement intent classification with two-pass strategy

**Requirements:** R2

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/pipeline/core/frontend/intent.ts`
- Test: `src/v8/pipeline/tests/frontend/intent.test.ts`

**Approach:**
- Define `IntentRule` type with keywords, type, confidence
- Define `V8_INTENT_RULES` array (predictive, diagnostic, reasoning keywords)
- Implement `classifyIntent(query, rules)` — keyword matching, returns confidence
- Implement fallback LLM classification (use existing model + Zod schema)
- Schema extends v6's `z.enum(['predictive', 'diagnostic'])` to include 'reasoning'

**Patterns to follow:**
- `src/v6/frontend/intent.ts` — Two-pass pattern
- `src/v6/frontend/intent.ts` — INTENT_RULES array structure

**Test scenarios:**
- Happy path: "预测商户风险" → predictive with high confidence
- Happy path: "分析经营状况" → reasoning
- Edge case: Ambiguous query → low confidence → LLM fallback
- Error path: LLM returns invalid type → default to 'reasoning'

**Verification:**
- Keyword rules classify correctly
- LLM fallback schema includes all three types
- Tests cover each intent type

---

- [ ] **Unit 5: Frontend - Entity Linker**

**Goal:** Implement entity extraction and linking

**Requirements:** R2

**Dependencies:** Unit 1, Unit 4

**Files:**
- Create: `src/v8/pipeline/core/frontend/entity-linker.ts`
- Test: `src/v8/pipeline/tests/frontend/entity-linker.test.ts`

**Approach:**
- Implement `linkEntities(query, graphStore, ontology)`:
  - Parse exact IDs (Merch:M001 pattern)
  - Fuzzy name matching via graphStore.findNodes
  - Ambiguity scoring (0-1, >0.5 triggers clarify)
- Return `EntityLinkResult` with entities and ambiguity score

**Patterns to follow:**
- `src/v6/frontend/entityLinker.ts` — NER + resolution pattern
- `src/v8/engine/stores/graph-store.ts` — findNodes interface

**Test scenarios:**
- Happy path: "Merch:M001" → exact match, no ambiguity
- Happy path: "商户A" → fuzzy match, single result
- Edge case: Multiple matches → high ambiguity score
- Edge case: No matches → empty array, no ambiguity

**Verification:**
- Entity linker extracts IDs correctly
- Ambiguity scoring works
- Tests cover match strategies

---

- [ ] **Unit 6: Frontend - DefaultFrontend Integration**

**Goal:** Implement DefaultFrontend combining intent + entity linker

**Requirements:** R2

**Dependencies:** Unit 4, Unit 5

**Files:**
- Create: `src/v8/pipeline/core/frontend/index.ts`
- Create: `src/v8/pipeline/core/frontend/clarify.ts` (stub for P2)
- Test: `src/v8/pipeline/tests/frontend/index.test.ts`

**Approach:**
- Define `Frontend` interface with `process(query)` returning `FrontendResult`
- Implement `DefaultFrontend`:
  - Constructor receives `GraphStore`, `Ontology`
  - `process(query)` → classify intent → link entities → check ambiguity → return ready/clarify
- Clarification stub: returns ClarificationQuestion[] when ambiguity > 0.5

**Patterns to follow:**
- `src/v6/frontend/index.ts` — Frontend orchestration
- Interface + default implementation pattern

**Test scenarios:**
- Happy path: Clear query → status: 'ready', task with type/entities
- Edge case: Ambiguous entities → status: 'clarify', questions
- Integration: Intent + entity linker work together

**Verification:**
- DefaultFrontend implements Frontend interface
- process() returns correct FrontendResult
- Integration with PipelineContext works

---

### Phase 2: Reasoning Task (P0)

- [ ] **Unit 7: Reasoning Task Types and Verdict**

**Goal:** Define reasoning-specific types and verdict parser

**Requirements:** R3

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/pipeline/tasks/reasoning/types.ts`
- Create: `src/v8/pipeline/tasks/reasoning/verdict.ts` (migrate from engine/agent/verdict.ts)
- Test: `src/v8/pipeline/tests/tasks/reasoning/types.test.ts`

**Approach:**
- Define `ReasoningTask` extending PipelineTask (optional entryEntities)
- Define `SemanticVerdict` type (answer, entities, rationale, confidence)
- Define `ReasoningResult` extending TaskExecuteResult
- Migrate `parseVerdict`, `createFallbackVerdict` from engine/agent/verdict.ts

**Patterns to follow:**
- `src/v8/engine/agent/verdict.ts` — Verdict parsing pattern

**Test scenarios:**
- Happy path: parseVerdict extracts JSON from markdown block
- Edge case: No JSON block → fallback verdict with confidence 0.3
- Edge case: Invalid JSON → fallback verdict

**Verification:**
- Types match design doc
- Verdict parser migrated correctly
- Tests pass

---

- [ ] **Unit 8: Reasoning Prompt Builder**

**Goal:** Build reasoning task prompt using ontology layer

**Requirements:** R3

**Dependencies:** Unit 7

**Files:**
- Create: `src/v8/pipeline/tasks/reasoning/prompt.ts` (migrate from engine/agent/prompt.ts)
- Test: `src/v8/pipeline/tests/tasks/reasoning/prompt.test.ts`

**Approach:**
- Migrate `buildSemanticReasoningPrompt` to new location
- Use `buildOntologyPrompt(params.ontology)` for common layer
- Add task-specific instructions for reasoning
- Accept `customContext` string injection

**Patterns to follow:**
- `src/v8/engine/agent/prompt.ts` — Existing prompt builder
- `src/v8/ontology/prompt.ts` — buildOntologyPrompt

**Test scenarios:**
- Happy path: Prompt includes ontology summary
- Happy path: Prompt includes task-specific instructions
- Edge case: customContext injected at end

**Verification:**
- Prompt builder creates complete system prompt
- Ontology layer included
- Tests verify structure

---

- [ ] **Unit 9: Reasoning Tools**

**Goal:** Create tool factory for reasoning task

**Requirements:** R3

**Dependencies:** Unit 7

**Files:**
- Create: `src/v8/pipeline/tasks/reasoning/tools.ts`
- Test: `src/v8/pipeline/tests/tasks/reasoning/tools.test.ts`

**Approach:**
- Export `createReasoningTools(runtime, workspace, policy)`
- Compose existing engine tools:
  - graph tools: inspect_node, search_nodes, query_neighbors, graph_query
  - compute tools: compute_query
  - vector tools: vector_query
  - fact tools: bind_fact, lookup_fact
  - candidate tools: propose_candidates
- Import from `src/v8/engine/tools/` and compose

**Patterns to follow:**
- `src/v8/rule/tools/rule-tools.ts` — Tool factory pattern
- `src/v8/engine/tools/` — Individual tool factories

**Test scenarios:**
- Happy path: createReasoningTools returns tool object
- Integration: Tools route through runtime correctly

**Verification:**
- All expected tools present in returned object
- Tools work with runtime injection

---

- [ ] **Unit 10: Reasoning Executor**

**Goal:** Implement reasoning task executor

**Requirements:** R3

**Dependencies:** Unit 7, Unit 8, Unit 9

**Files:**
- Create: `src/v8/pipeline/tasks/reasoning/executor.ts`
- Test: `src/v8/pipeline/tests/tasks/reasoning/executor.test.ts`

**Approach:**
- Implement `execute(params: ExecuteParams)`:
  - Build user message from task.goal + entryEntities
  - Call `generateText({ model, system: params.systemPrompt, prompt, tools, stopWhen: stepCountIs(30), temperature: 0 })`
  - Extract facts from workspace.allBindings()
  - Parse verdict from result.text
  - Return TaskExecuteResult
- No critique method (reasoning has no critic)

**Patterns to follow:**
- `src/v8/engine/agent/executor.ts` — Existing executor implementation

**Test scenarios:**
- Happy path: Execute returns facts and verdict
- Integration: Tool calls route through runtime
- Edge case: Large step count triggers stop

**Verification:**
- Executor runs generateText loop
- Returns TaskExecuteResult with facts
- Tests verify end-to-end execution

---

- [ ] **Unit 11: Reasoning TaskPlugin**

**Goal:** Compose ReasoningPlugin implementing TaskPlugin interface

**Requirements:** R3

**Dependencies:** Unit 7, Unit 8, Unit 9, Unit 10

**Files:**
- Create: `src/v8/pipeline/tasks/reasoning/index.ts`
- Test: `src/v8/pipeline/tests/tasks/reasoning/plugin.test.ts`

**Approach:**
- Export `reasoningPlugin: TaskPlugin`:
  - `type: 'reasoning'`
  - `buildPrompt` → calls prompt.ts function
  - `buildTools` → calls tools.ts factory
  - `execute` → calls executor.ts function
  - `critique` → undefined (no critic for reasoning)

**Patterns to follow:**
- TaskPlugin interface from Unit 1

**Test scenarios:**
- Happy path: runTask('predictive', {...}) returns PipelineResult with systemVerdict
- Integration: critique called after execute with facts + modelVerdict
- Integration: MCDA scoring produces ScoredCandidate[] with weighted scores
- Edge case: hard_constraint veto triggers on invalid candidate
- Edge case: Reconciliation identifies model/system discrepancy

**Verification:**
- Plugin registered and callable
- End-to-end reasoning task works

---

### Phase 3: End-to-End Integration (P0)

- [ ] **Unit 12: PipelineContext with Frontend and Reasoning**

**Goal:** Complete PipelineContext with run() auto-routing and runAfterClarify()

**Requirements:** R1, R2, R3

**Dependencies:** Unit 3, Unit 6, Unit 11

**Files:**
- Modify: `src/v8/pipeline/core/context.ts`
- Test: `src/v8/pipeline/tests/context-full.test.ts`

**Approach:**
- Add `run(query)` method:
  - Call `frontend.process(query)`
  - If status: 'ready' → call runTask with task
  - If status: 'clarify' → return ClarificationRequest
- Add `runAfterClarify(query, answers)` method:
  - Re-process query with answers context
  - Call runTask
- Register reasoningPlugin in default context

**Patterns to follow:**
- Design doc Section 7.2 run flow

**Test scenarios:**
- Happy path: run("分析 Merch:M001") → routes to reasoning, returns result
- Edge case: Ambiguous query → returns ClarificationRequest
- Integration: runAfterClarify resolves clarification

**Verification:**
- Auto-routing works with Frontend
- Clarification callback works
- End-to-end integration test passes

---

- [ ] **Unit 13: Test Helper Pattern**

**Goal:** Create test helpers matching v6 patterns, reuse existing use-case scenarios

**Requirements:** R1, R3

**Dependencies:** Unit 12

**Files:**
- Create: `src/v8/pipeline/tests/helper.ts`
- Create: `src/v8/pipeline/tests/use-case.ts` (migrate from src/ex/use-case.ts)
- Create: `src/v8/pipeline/tests/library/` (ontology, seed, bindings patterns)

**Approach:**
- Implement `newPipelineTestContext()`:
  - Create InMemoryGraphStore, InMemoryComputeStore, InMemoryVectorStore
  - Build test ontology (library domain from src/ex/doc/use-case.md)
  - Build test rules (C1-C8 constraints)
  - Return newPipelineContext with reasoningPlugin registered
- Implement `syncReasoningTask(goal, entities?)` → runTask wrapper
- Implement `streamReasoningTask` for P2 (stub)
- Port use-case scenarios from `src/ex/use-case.ts`:
  - S0-S10 scenarios with library domain test data
  - Each scenario has taskId, goal, entryEntities, verification points

**Patterns to follow:**
- `src/v6/tests/1-graph/helper.ts` — newAgentContext + sync/stream agents
- `src/ex/use-case.ts` — S0-S10 test scenario definitions
- `src/v6/tests/1-graph/library/` — ontology.ts, seed.ts, bindings.ts structure

**Test scenarios (from src/ex/use-case.ts):**
- S0: "哪些读者最活跃？" — 基础查询，无入口实体
- S1: "评估小红是否能从西馆借阅《人类简史》" — 2跳跨实体参数传递
- S2: "评估老王是否能从主馆借阅《人类简史》" — 借阅上限（需从 Branch 获取参数）
- S3: "评估小李是否能借阅《人类简史》" — 逾期阻断（遍历 overdue 关系边）
- S4: "评估小红是否能借阅《三体（第一部）》" — 限制类目（跨实体会员等级比较）
- S5: "评估小明是否能借阅《哈利·波特》" — 新书保护期（2跳获取动态参数）
- S6: "判断小明是否可以借阅《三体·死神永生》" — 系列顺序（3-4跳集合推理）
- S7: "评估小红是否能借阅《宇宙的奇迹》" — 馆际互借（3跳链式分馆遍历）
- S8: "判断刘慈欣是否为热门作者" — 反向遍历+聚合
- S9: "统计预约人数" — 反向计数聚合
- S10: "评估小红是否能借阅《量子纠缠导论》" — 综合多规则叠加

**Verification:**
- Helper creates working PipelineContext
- Use-case scenarios execute correctly
- Tests pass using helper + use-case combinations

---

### Phase 4: Predictive Task (P1)

- [ ] **Unit 14: Predictive Types**

**Goal:** Define predictive-specific types

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/pipeline/tasks/predictive/types.ts`
- Test: `src/v8/pipeline/tests/tasks/predictive/types.test.ts`

**Approach:**
- Define `PredictiveTask` with goal, entryEntities, context
- Define `ModelVerdict_Predictive` (recommendation, candidates, rationale, confidence)
- Define `SystemVerdict_Predictive` (scoredCandidates, topCandidate)
- Define `PredictiveCritiqueResult`

**Patterns to follow:**
- `src/v6/ontology/decision.ts` — ModelVerdict_Predictive structure

**Verification:**
- Types match v6/v8 design
- Tests pass

---

- [ ] **Unit 15: Predictive Prompt and Tools**

**Goal:** Build predictive prompt and tools

**Requirements:** R4

**Dependencies:** Unit 14

**Files:**
- Create: `src/v8/pipeline/tasks/predictive/prompt.ts`
- Create: `src/v8/pipeline/tasks/predictive/tools.ts`
- Test: `src/v8/pipeline/tests/tasks/predictive/prompt.test.ts`

**Approach:**
- Prompt: Ontology layer + predictive-specific instructions (forward inference, candidate rules)
- Tools: Compose engine tools + predictive-specific:
  - propose_candidates (migrate/adapt from v6)
  - simulate_counterfactual (stub for now)

**Patterns to follow:**
- `src/v6/agent/prompt.ts` (predictive section)
- Design doc Section 6.2 tool list

**Verification:**
- Prompt includes predictive rules
- Tools include propose_candidates

---

- [ ] **Unit 16: Predictive Executor and Critic**

**Goal:** Implement predictive executor and critic

**Requirements:** R4

**Dependencies:** Unit 14, Unit 15

**Files:**
- Create: `src/v8/pipeline/tasks/predictive/executor.ts`
- Create: `src/v8/pipeline/tasks/predictive/critic.ts`
- Test: `src/v8/pipeline/tests/tasks/predictive/executor.test.ts`
- Test: `src/v8/pipeline/tests/tasks/predictive/critic.test.ts`

**Approach:**
- Executor: Similar to reasoning but with candidate proposal focus
- Critic:
  - Call RuleRuntime.evaluate() for MCDA scoring
  - Apply hard_constraint veto
  - Call reconciler for model/system comparison
  - Adapt verdict to SemanticVerdict for Rule module

**Patterns to follow:**
- `src/v6/agent/criticPredictive.ts` — Critic pattern
- `src/v8/rule/runtime/rule-runtime.ts` — RuleRuntime usage
- Design doc Section 8.4 — Verdict adapter

**Verification:**
- Executor collects candidates
- Critic produces SystemVerdict + Reconciliation
- Tests pass

---

- [ ] **Unit 17: Predictive TaskPlugin**

**Goal:** Compose PredictivePlugin

**Requirements:** R4

**Dependencies:** Unit 14-16

**Files:**
- Create: `src/v8/pipeline/tasks/predictive/index.ts`
- Test: `src/v8/pipeline/tests/tasks/predictive/plugin.test.ts`

**Approach:**
- Export `predictivePlugin: TaskPlugin` with all four methods

**Verification:**
- Plugin works end-to-end

---

### Phase 5: Diagnostic Task (P1)

- [ ] **Unit 18: Diagnostic Types**

**Goal:** Define diagnostic-specific types

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**
- Create: `src/v8/pipeline/tasks/diagnostic/types.ts`
- Test: `src/v8/pipeline/tests/tasks/diagnostic/types.test.ts`

**Approach:**
- Define `DiagnosticTask` with outcome, timeWindow, entryEntities
- Define `DiagnosticVerdict` (rootCauses, attribution, evidence)
- Define `AttributionResult` (dimensions: sufficiency, necessity, temporal, evidence)

**Patterns to follow:**
- `src/v6/ontology/decision.ts` — DiagnosticVerdict structure

**Verification:**
- Types match design

---

- [ ] **Unit 19: Diagnostic Prompt, Tools, Executor, Critic**

**Goal:** Implement diagnostic components

**Requirements:** R5

**Dependencies:** Unit 18

**Files:**
- Create: `src/v8/pipeline/tasks/diagnostic/prompt.ts`
- Create: `src/v8/pipeline/tasks/diagnostic/tools.ts`
- Create: `src/v8/pipeline/tasks/diagnostic/executor.ts`
- Create: `src/v8/pipeline/tasks/diagnostic/critic.ts`
- Create: `src/v8/pipeline/tasks/diagnostic/index.ts`
- Tests for each component

**Approach:**
- Prompt: Ontology + backward attribution rules
- Tools: graph_query, inspect_node + stubs for query_events, trace_causal
- Executor: Focus on causal path tracing
- Critic: Attribution scoring + RuleRuntime integration
- Note: EventStore/CausalGraph implementation deferred

**Patterns to follow:**
- `src/v6/agent/prompt.ts` (diagnostic section)
- `src/v6/agent/criticDiagnostic.ts`
- Design doc Section 6.1

**Test scenarios:**
- Happy path: runTask('diagnostic', {...}) traces causal path via graph_query
- Integration: causal tools stub returns preset causal chain (rootCause → outcome)
- Integration: AttributionResult contains 4-dimension scoring (sufficiency, necessity, temporal, evidence)
- Edge case: No causal path found → AttributionResult with low confidence
- Edge case: Multiple root causes → ranked by attribution scores
- Stub behavior: query_events returns timeline, trace_causal returns causal edges

---

### Phase 6: Module Export and Cleanup

- [ ] **Unit 20: Final Module Export and Deprecation**

**Goal:** Export pipeline module, mark engine/agent for deprecation

**Requirements:** R1, R3

**Dependencies:** All previous units

**Files:**
- Modify: `src/v8/pipeline/index.ts` — Complete exports
- Modify: `src/v8/index.ts` — Export pipeline
- Add deprecation note: `src/v8/engine/agent/executor.ts`

**Approach:**
- Export types, PipelineContext, TaskRegistry, newPipelineContext
- Export reasoningPlugin, predictivePlugin, diagnosticPlugin
- Add @deprecated comment to engine/agent exports

**Test scenarios:**
- Import verification: `import { newPipelineContext, reasoningPlugin, PipelineContext, TaskRegistry, TaskPlugin } from './pipeline'` — types correctly exported
- Integration: `newPipelineContext(minimalDeps)` creates valid context
- Integration: `ctx.run('分析 Merch:M001')` routes to reasoning and returns result
- Deprecation: engine/agent exports marked @deprecated but still importable

---

## System-Wide Impact

- **Interaction graph:** Pipeline becomes top-level entry, Engine/agent executor deprecated
- **Error propagation:** runTask/run throw on unknown type, tool failures propagate via ToolResult
- **State lifecycle:** Workspace per-call, no shared state between executions
- **API surface parity:** runTask vs run (explicit vs auto-routing) both available
- **Integration coverage:** Tests cover Frontend → Executor → Critic chain
- **Unchanged invariants:** Engine stores, Ontology, Rule modules unchanged; Pipeline consumes them

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RuntimeOrchestrator workspace integration mismatch | Med | High | Design doc Section 7.1 specifies per-call workspace; may need orchestrator refactor or per-call instance |
| EventStore/CausalGraph missing for Diagnostic | High | Med | P1 scope; use stubs first, defer full causal graph to later phase |
| Frontend LLM fallback cost | Low | Low | Two-pass classification minimizes LLM calls; keyword rules handle most cases |
| V6 migration complexity | Med | Med | Follow existing patterns, migrate incrementally by unit |

## Documentation / Operational Notes

- Update `src/v8/docs/engine/phase1-design.md` to note Pipeline as orchestrator
- Add migration guide in pipeline README (future)
- Test helper pattern enables easy test creation

## Sources & References

- **Origin document:** [src/v8/docs/pipeline/draft.md](src/v8/docs/pipeline/draft.md)
- Related code: `src/v8/engine/`, `src/v8/ontology/`, `src/v8/rule/`, `src/v6/frontend/`, `src/v6/agent/`
- External docs: Vercel AI SDK (generateText, tool, streamText)
- Prior plan: `docs/plans/2026-05-23-003-feat-v8-phase1-semantic-runtime-plan.md` (Engine reference)