---
title: Pipeline Session: 多轮对话状态管理
type: feat
status: active
date: 2026-05-26
origin: docs/brainstorms/2026-05-26-v8-pipeline-session-requirements.md
---

# Pipeline Session: 多轮对话状态管理

## Overview

为 V8 Pipeline 模块引入 `PipelineSession`，支持在首次任务执行后继续对话。Session 持有 Workspace、对话历史和已构建的 prompt/tools，使 `chat()` 可以在同一上下文中追加用户消息并复用 LLM 调用。

## Problem Frame

当前 `PipelineContext.runTask()` 每次创建新 Workspace（line 72, context.ts），用完即弃。调用方无法在首次任务执行后继续追问。V6 的 `syncPredictiveAgent` 已验证了 `generateText({ messages })` 多轮模式可行，V8 需要将此模式封装为 Session 抽象。

## Requirements Trace

- R1. `PipelineContext.createSession(task)` 创建 Session
- R2. Session 持有 Workspace 实例，跨多次调用保持状态
- R3. Session 持有对话历史（messages 数组），支持多轮 LLM 调用
- R4. Session 生命周期为内存态，接口预留持久化扩展
- R5. `session.run()` 执行首次任务，等价于 `runTask()` 完整流程
- R6. `session.chat(input)` 追加用户消息到对话历史，复用 Workspace 和 Tools，再次调用 LLM
- R7. `session.chat()` 返回 `PipelineResult`
- R8. `chat()` 复用已有 systemPrompt 和 tools
- R9. Session 暴露 `getFacts()` 方法
- R10. Session 暴露 `getHistory()` 方法
- R11. `PipelineContext.runTask()` 保持不变

## Scope Boundaries

- 不实现 Session 持久化存储
- 不实现 Session 超时/过期机制
- 不实现跨 Session 多任务协作
- 不改变现有 TaskPlugin 接口

## Context & Research

### Relevant Code and Patterns

- **V6 multi-turn 参考**: `src/v6/tests/1-graph/helper.ts` — `syncPredictiveAgent` 使用 `generateText({ messages })` + `result.response.messages` 追加模式实现多轮对话
- **V6 调用方式**: `src/v6/tests/1-graph/t2.ts` — 外部维护 `messages: ModelMessage[]`，循环调用 `syncPredictiveAgent(ctx, chatInput, messages)`
- **V8 PipelineContext**: `src/v8/pipeline/core/context.ts` — `runTask()` 每次创建 Workspace，需提取其初始化逻辑供 Session 复用
- **V8 Workspace**: `src/v8/engine/runtime/workspace.ts` — 已支持 `addBinding`、`allBindings`、`getFacts`，可直接跨 turn 累积
- **V8 Reasoning Executor**: `src/v8/pipeline/tasks/reasoning/executor.ts` — 当前用 `generateText({ prompt })` 单次调用，需改为支持 `messages`
- **AI SDK v6.0.168**: `ModelMessage` 类型，`generateText({ messages })` 参数，`result.response.messages` 返回值

### Institutional Learnings

- V8 Pipeline 设计文档明确将 multi-turn 列为延期扩展边界
- V6 的 `EventStore` / `FactStore` 展示了事实累积模式，V8 Workspace 已具备类似能力
- `syncPredictiveAgent` 已验证 `messages` 模式可行，V8 Session 应封装此模式

## Key Technical Decisions

- **Session 内部持有 messages 数组**：参考 V6 `syncPredictiveAgent`，Session 维护 `ModelMessage[]`，每次 `chat()` 追加 user message 后调用 `generateText({ messages })`，再将 `result.response.messages` 追加回数组
- **Session 持有 Workspace + Runtime + systemPrompt + tools**：`run()` 时初始化，`chat()` 时复用，不重新构建
- **extractInitParams() 提取共享逻辑**：将 `runTask()` 中的 workspace/plugin/prompt/runtime/tools 初始化提取为内部方法，`runTask()` 和 `session.run()` 共用
- **TaskPlugin 接口不变**：Session 层处理多轮逻辑，plugin 只负责单次 execute
- **chat() 的 facts 提取**：chat 后从 workspace.allBindings() 提取累积 facts，verdict 从 result.text 解析

## Open Questions

### Resolved During Planning

- **executor 多轮支持方式**：不修改 TaskPlugin.execute() 接口。Session 直接调用 `generateText({ messages })` 而非通过 plugin.execute()。`run()` 仍走 plugin.execute() 完成首次执行，`chat()` 绕过 plugin 直接调用 generateText。这样无需修改 TaskPlugin 接口，也避免将 messages 概念泄漏到 plugin 层。

### Deferred to Implementation

- **chat() 的 verdict 解析**：chat 返回时如何生成 modelVerdict。`run()` 走 plugin.execute() 自然得到 verdict；`chat()` 需要自行调用 parseVerdict。具体用哪个 plugin 的 parseVerdict 需要在实现时确认。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
PipelineSession
  ├── workspace: Workspace          // 跨 turn 累积 facts
  ├── runtime: SemanticRuntimeOrchestrator
  ├── systemPrompt: string          // run() 时构建，chat() 复用
  ├── tools: Record<string, Tool>   // run() 时构建，chat() 复用
  ├── messages: ModelMessage[]      // 对话历史
  ├── task: PipelineTask
  ├── plugin: TaskPlugin
  ├── model: LanguageModel
  └── policy: PolicyContext

session.run()  → 初始化 workspace/runtime/prompt/tools
               → 调用 plugin.execute() (首次执行)
               → messages.push(result.response.messages)
               → critique (if plugin supports)
               → return PipelineResult

session.chat(input) → messages.push({ role: 'user', content: input })
                    → generateText({ system, messages, tools })
                    → messages.push(...result.response.messages)
                    → facts = workspace.allBindings()
                    → verdict = parseVerdict(result.text)
                    → return PipelineResult
```

## Implementation Units

- [ ] **Unit 1: 新建 PipelineSession 类**

**Goal:** 创建 PipelineSession 类，包含 workspace、runtime、messages、systemPrompt、tools 等状态的持有，以及 `run()` 和 `chat()` 方法

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Dependencies:** None

**Files:**
- Create: `src/v8/pipeline/core/session.ts`
- Test: `src/v8/pipeline/tests/session.test.ts`

**Approach:**
- Session 构造函数接收 PipelineContext 的内部依赖（graphStore、computeStore、vectorStore、ontology、ruleRegistry、model、config）以及初始 task
- `run()` 复用 `runTask()` 的初始化流程：创建 workspace → 获取 plugin → buildPrompt → 创建 runtime → buildTools → plugin.execute() → critique → 返回 PipelineResult
- `run()` 完成后，将 `result.response.messages` 追加到 `messages` 数组（需从 plugin.execute 的返回值中获取，或在 run 内部直接调用 generateText 后捕获）
- `chat(input)` 追加 user message 到 messages，调用 `generateText({ system: systemPrompt, messages, tools })`，追加 `result.response.messages` 到 messages，从 workspace 提取 facts，解析 verdict，返回 PipelineResult
- Session 的 `run()` 不走 plugin.execute()，而是直接调用 generateText 并将 tool 执行结果写入 workspace——这样可以在 run 和 chat 中使用统一的 generateText 调用模式，同时保持 workspace 事实累积
- 实际上更简洁的方式：`run()` 也用 `generateText({ messages })` 模式，首次将 userMessage 作为第一条 user message 推入 messages，然后调用 generateText。这样 run 和 chat 共享同一套 generateText 调用逻辑
- critique 逻辑在 `run()` 后可选执行（如果 plugin 支持）

**Technical design:**

```
// Session 内部统一的 generateText 调用
private async executeTurn(): Promise<{ rawText: string; responseMessages: ModelMessage[] }> {
  const result = await generateText({
    model: this.model,
    system: this.systemPrompt,
    messages: this.messages,
    tools: this.tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })
  return { rawText: result.text, responseMessages: result.response.messages }
}

run(): PipelineResult
  1. init: workspace, runtime, plugin, systemPrompt, tools
  2. push user message: messages.push({ role: 'user', content: userMessage })
  3. result = executeTurn()
  4. messages.push(...result.responseMessages)
  5. critique (if plugin supports)
  6. return PipelineResult

chat(input): PipelineResult
  1. push user message: messages.push({ role: 'user', content: input })
  2. result = executeTurn()
  3. messages.push(...result.responseMessages)
  4. facts = workspace.allBindings()
  5. verdict = parseVerdict(result.rawText)
  6. return PipelineResult
```

**Patterns to follow:**
- V6 `syncPredictiveAgent` (`src/v6/tests/1-graph/helper.ts:112-148`) — messages 追加模式
- V6 `newUseCase` (`src/v6/tests/1-graph/helper.ts:48-90`) — 上下文初始化模式
- V8 `PipelineContext.runTask()` (`src/v8/pipeline/core/context.ts:66-166`) — pipeline 执行流程

**Test scenarios:**
- Happy path: `createSession → run → chat → chat` 完整流程，验证每轮返回 PipelineResult
- Happy path: `run()` 返回结果与等价的 `runTask()` 一致
- Happy path: 多次 `chat()` 后 workspace.bindings 持续累积
- Happy path: messages 数组随 run/chat 调用正确增长（包含 user 和 assistant messages）
- Edge case: 未经 `run()` 直接调用 `chat()` 应抛出错误
- Edge case: 空字符串 input 传给 `chat()` 的行为
- Error path: `chat()` 时 LLM 调用失败，workspace 和 messages 状态不变

**Verification:**
- Session run/chat 可以完成多轮对话
- workspace facts 在多轮间累积
- messages 数组正确记录对话历史

- [ ] **Unit 2: PipelineContext 添加 createSession 方法**

**Goal:** 在 PipelineContext 上添加 `createSession(task)` 工厂方法，并提取 `runTask()` 中的共享初始化逻辑

**Requirements:** R1, R11

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v8/pipeline/core/context.ts`
- Modify: `src/v8/pipeline/core/types.ts` — 添加 PipelineSession 导出
- Test: `src/v8/pipeline/tests/context-session.test.ts`

**Approach:**
- `createSession(task)` 创建 PipelineSession 实例，传入 PipelineContext 的内部依赖
- `runTask()` 保持不变，不重构其内部实现（最小改动原则）
- Session 需要访问 PipelineContext 的私有成员，可通过构造函数传参实现，无需改变 PipelineContext 的可见性

**Patterns to follow:**
- V8 `newPipelineContext()` 工厂函数模式

**Test scenarios:**
- Happy path: `ctx.createSession(task)` 返回有效的 PipelineSession 实例
- Happy path: `ctx.runTask()` 在添加 createSession 后行为不变
- Integration: Session 使用与 PipelineContext 相同的 stores 和 ontology

**Verification:**
- `runTask()` 行为完全不变
- `createSession()` 返回可用的 Session

- [ ] **Unit 3: 添加 Session 状态访问方法**

**Goal:** 实现 `getFacts()` 和 `getHistory()` 方法

**Requirements:** R9, R10

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v8/pipeline/core/session.ts`
- Test: `src/v8/pipeline/tests/session.test.ts` (追加到 Unit 1 的测试文件)

**Approach:**
- `getFacts()` 返回 `workspace.allBindings()` 的快照
- `getHistory()` 返回 messages 数组的只读副本

**Test scenarios:**
- Happy path: `getFacts()` 返回累积的 FactBinding 数组
- Happy path: `getHistory()` 返回 ModelMessage 数组
- Edge case: `run()` 前调用 `getFacts()` / `getHistory()` 返回空数组

**Verification:**
- getFacts 和 getHistory 正确返回内部状态

- [ ] **Unit 4: 更新 t1.ts demo 和导出**

**Goal:** 用 Session API 改写 t1.ts demo，并更新 pipeline/index.ts 导出

**Requirements:** R1-R10 (端到端验证)

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `src/v8/demo/t1.ts`
- Modify: `src/v8/pipeline/index.ts`

**Approach:**
- t1.ts 改为 `createSession → run → while(chat)` 模式
- pipeline/index.ts 导出 PipelineSession 类

**Test scenarios:**
- Happy path: t1.ts 可执行多轮对话（手动验证）
- Happy path: 从 `src/v8/pipeline` 可导入 PipelineSession

**Verification:**
- t1.ts 能完成首次推理 + 后续追问的完整流程

## System-Wide Impact

- **Interaction graph:** PipelineContext 新增 createSession 方法，不影响现有 runTask/run/runAfterClarify 调用链
- **Error propagation:** Session 内部 LLM 调用失败向上抛出，与 runTask 一致
- **State lifecycle risks:** Session 持有 workspace 引用，长期存活的 Session 可能导致内存增长。当前为内存态，风险可控
- **API surface parity:** 无需其他接口同步变更
- **Unchanged invariants:** runTask() 行为完全不变；TaskPlugin 接口不变；Workspace 类不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| AI SDK v6 的 `result.response.messages` 格式与 V6 参考代码不完全一致 | 实现时验证，V6 已用此模式成功运行 |
| Session.chat() 中 generateText 的 tool call 回调写入 workspace 是否正常工作 | tools 构建时绑定了 workspace 引用，应自动写入；实现时需验证 |
| 长对话的 messages 数组可能超出 LLM context window | 当前不做处理，作为已知限制；未来可加截断策略 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-26-v8-pipeline-session-requirements.md](docs/brainstorms/2026-05-26-v8-pipeline-session-requirements.md)
- V6 multi-turn 参考: `src/v6/tests/1-graph/helper.ts` (syncPredictiveAgent)
- V6 调用方式: `src/v6/tests/1-graph/t2.ts`
- V8 PipelineContext: `src/v8/pipeline/core/context.ts`
- V8 Workspace: `src/v8/engine/runtime/workspace.ts`
- V8 Reasoning Executor: `src/v8/pipeline/tasks/reasoning/executor.ts`
