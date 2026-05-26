---
date: 2026-05-26
topic: v8-pipeline-session
---

# Pipeline Session: 多轮对话状态管理

## Problem Frame

当前 `PipelineContext.runTask()` 每次执行都创建新的 `Workspace`，用完即弃。调用方无法在首次任务执行后继续对话——缺少 Session 概念来保持 workspace 状态和对话历史。

t1.ts demo 中的典型场景：先执行 reasoning 任务获取结果，再基于该结果持续追问，当前无法实现。

## Requirements

**Session 生命周期**
- R1. `PipelineContext.createSession(task)` 创建 Session，接收初始 PipelineTask
- R2. Session 持有 Workspace 实例，跨多次调用保持状态（facts、bindings、candidates）
- R3. Session 持有对话历史（messages 数组），支持多轮 LLM 调用
- R4. Session 生命周期为内存态，进程结束即消失；接口设计上预留未来持久化扩展能力

**Session 执行**
- R5. `session.run()` 执行首次任务，等价于当前 `runTask()` 的完整流程（buildPrompt → buildTools → execute → critique）
- R6. `session.chat(input)` 追加用户消息到对话历史，复用同一 Workspace 和 Tools，再次调用 LLM
- R7. `session.chat(input)` 返回 `PipelineResult`，与 `run()` 返回类型一致
- R8. `chat()` 不重新执行 buildPrompt/buildTools，复用 session 已有的 systemPrompt 和 tools

**Session 状态访问**
- R9. Session 暴露 `getFacts()` 方法，返回当前累积的所有 FactBinding
- R10. Session 暴露 `getHistory()` 方法，返回对话历史

**向后兼容**
- R11. `PipelineContext.runTask()` 保持不变，继续支持无状态单次调用

## Success Criteria

- t1.ts demo 可以用 `createSession → run → chat → chat → ...` 完成多轮对话
- `runTask()` 行为与改动前完全一致
- Session 内的 workspace facts 在多次 chat 之间持续累积

## Scope Boundaries

- 不实现 Session 持久化存储（仅内存态）
- 不实现 Session 超时/过期机制
- 不实现跨 Session 的多任务协作
- 不改变现有 TaskPlugin 接口

## Key Decisions

- **Session 持有 Workspace + Runtime + 对话历史**：workspace 保持事实累积，对话历史保持 LLM 上下文连贯
- **chat() 复用 PipelineResult**：与 run() 返回类型统一，调用方无需区分
- **chat() 复用已有 prompt 和 tools**：不重新构建，保持 session 上下文一致
- **内存优先 + 预留扩展**：当前仅内存实现，Session 接口设计上不阻断未来持久化

## Dependencies / Assumptions

- Vercel AI SDK 的 `generateText` 支持通过 `messages` 参数传入历史对话（需确认）

## Outstanding Questions

### Deferred to Planning
- [Affects R3][Technical] executor 层如何从 `generateText(prompt)` 改造为支持 `messages` 数组的多轮调用
- [Affects R6][Needs research] Vercel AI SDK `generateText` 的 `messages` 参数用法，以及如何从 `generateText` 返回值中提取 message 对象用于下一轮

## Next Steps

→ `/ce:plan` for structured implementation planning
