# trace.ts 实际调用分析

核心发现：
1. 已接入：saveTrace 在 index.ts 中被调用两次（predictive / diagnostic session 结束时）
2. 未接入：toolCalls 是空数组（Executor 未回流工具调用详情）、addFeedback 无调用入口、getTrace/listTraces 完全未用
3. 差距：设计文档强调的"可重放、可校准"依赖 toolCalls 和 feedback，这两点目前都缺失

## 一、调用位置汇总

`trace.ts` 导出的函数在 `src/v6/` 目录中的实际调用情况：

| 函数 | 调用位置 | 调用次数 | 状态 |
|------|---------|---------|------|
| `saveTrace` | `src/v6/index.ts` | 2 | ✅ 已接入 |
| `DecisionTrace` | `src/v6/index.ts` | 2 | ✅ 类型引用 |
| `getTrace` | 无 | 0 | ❌ 未接入 |
| `listTraces` | 无 | 0 | ❌ 未接入 |
| `addFeedback` | 无 | 0 | ❌ 未接入 |
| `clearTraces` | 无 | 0 | ❌ 未接入 |

---

## 二、saveTrace 的调用上下文

### 2.1 Predictive Session（前向决策）

调用位置：`src/v6/index.ts:207-223`

```ts
// Save trace
const trace: DecisionTrace = {
  traceId,
  sessionId: task.taskId,
  mode: 'predictive',
  ontologyVersion: ontology.version,
  ruleSetVersion: ontology.version,
  goal: task.goal,
  entryEntities: task.entryEntities ?? [],
  toolCalls: [],                        // ⚠️ 空数组
  factSnapshot: execResult.facts.all(),
  systemVerdictId: systemVerdict.recommendedCandidateId,
  modelVerdictId: modelVerdict.recommendedCandidateId,
  reconciliationAgreed: reconciliation.agree,
  startedAt,
  finishedAt,
}
saveTrace(trace)
```

**触发时机**：Executor → Critic → Reconciliation 完成后，返回 `DecisionResponse` 前。

**记录内容**：
- 双轨判决结果（systemVerdictId / modelVerdictId）
- 冲突状态（reconciliationAgreed）
- FactStore 快照（factSnapshot）
- 时间戳（startedAt / finishedAt）

### 2.2 Diagnostic Session（后向归因）

调用位置：`src/v6/index.ts:282-298`

```ts
// Save trace
const trace: DecisionTrace = {
  traceId,
  sessionId: task.taskId,
  mode: 'diagnostic',
  ontologyVersion: ontology.version,
  ruleSetVersion: ontology.version,
  goal: task.goal,
  entryEntities: task.outcome ? [task.outcome.entityId] : [],
  toolCalls: [],                        // ⚠️ 空数组
  factSnapshot: execResult.facts.all(),
  systemVerdictId: systemVerdict.rankedAttributions[0]?.causeId ?? '',
  modelVerdictId: modelVerdict.rankedAttributions?.[0]?.causeId ?? '',
  reconciliationAgreed: reconciliation.agree,
  startedAt,
  finishedAt,
}
saveTrace(trace)
```

**触发时机**：Diagnostic Executor → Critic → Reconciliation 完成后。

**差异点**：
- `entryEntities` 从 outcome.entityId 获取（而非用户指定）
- verdictId 取的是 attribution 排名第一的 causeId

---

## 三、未接入的功能

### 3.1 工具调用轨迹（toolCalls）

**现状**：`toolCalls` 在两处调用中都是空数组 `[]`。

**设计意图**（见 `trace.ts:8-14`）：
```ts
export type TraceToolCall = {
  stepNumber: number
  toolName: string
  input: unknown
  output: unknown
  durationMs?: number
}
```

**缺失原因**：Executor (`runPredictiveExecutor` / `runDiagnosticExecutor`) 未将工具调用详情回流给 index.ts。工具调用发生在 AI SDK 的 generateText loop 内部，目前没有提取机制。

**影响**：
- 无法审计具体工具调用顺序
- 无法重放推理过程
- 无法分析工具使用效率

### 3.2 反馈通道（addFeedback）

**现状**：`feedbackToken` 被生成并返回给用户（`index.ts:235`, `index.ts:310`），但 `addFeedback` 未被任何代码调用。

**设计意图**（见 `think_v6.md:496`）：
> `feedbackToken` 让前端可以一键反馈"系统对" / "模型对" / "都不对"，回流到 calibration log。

**缺失原因**：缺少 HTTP API / CLI 入口来接收用户反馈。

**影响**：
- calibration 闭环无法完成
- 权重校准无法从真实反馈中学习

### 3.3 Trace 查询（getTrace / listTraces）

**现状**：完全未使用。

**设计意图**（见 `trace.ts:49-55`）：
- `getTrace`: 查询特定 trace 详情
- `listTraces`: 列出所有历史 trace

**缺失原因**：缺少管理界面 / API。

---

## 四、与 think_v6.md 设计的差距

| 设计目标 | 文档位置 | 当前实现 | 状态 |
|---------|---------|---------|------|
| 决策可重放 | 第 110-113 行 | `toolCalls` 未记录 | ⚠️ 部分 |
| 审计工具调用 | 第 7 节 | 空数组 | ❌ 未实现 |
| 反事实重放 | 第 572-570 行 | `factSnapshot` 已保存 | ✅ 基础就绪 |
| 反馈闭环 | 第 496 行 | `addFeedback` 未接入 | ❌ 未实现 |
| calibration log | 第 1018 行 | 无回流机制 | ❌ 未实现 |
| 版本追溯 | 第 99-100 行 | `ontologyVersion` 已保存 | ✅ 已实现 |

---

## 五、建议补齐路径

### 优先级 1：记录 toolCalls

**方案**：在 Executor 中拦截 AI SDK 的 tool call 事件，收集到数组，随 execResult 返回。

```ts
// executor.ts 伪代码
const toolCalls: TraceToolCall[] = []
const result = await generateText({
  ...
  onToolCall: ({ toolName, args, result }) => {
    toolCalls.push({
      stepNumber: toolCalls.length + 1,
      toolName,
      input: args,
      output: result,
      durationMs: ... // 需测量
    })
  }
})
return { ..., toolCalls }
```

### 优先级 2：接入 feedback API

**方案**：新增 HTTP endpoint 或 CLI 命令。

```ts
// 伪代码
app.post('/feedback', (req) => {
  const { traceId, verdict, comment } = req.body
  addFeedback(traceId, {
    verdict,
    comment,
    submittedAt: new Date().toISOString()
  })
})
```

### 优先级 3：Trace 管理接口

**方案**：提供 CLI 或 API 查询历史 trace。

```bash
# CLI 伪代码
> v6 trace list
> v6 trace show <traceId>
> v6 trace export <traceId> --json
```

---

## 六、总结

`trace.ts` 当前实现了**最小可行的 trace 保存**，但：

1. **已实现**：双模式 trace 持久化、factSnapshot 保存、版本记录、时间戳
2. **缺失**：toolCalls 轨迹记录、feedback 闭环、trace 查询管理
3. **核心差距**：设计文档强调的"可重放、可校准"依赖 toolCalls 和 feedback，这两点目前都未接入

`trace.ts` 是 V6 校准闭环的**基础设施骨架**，但尚未成为完整的可运行闭环。