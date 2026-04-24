---
title: "feat: V3 语义节点 + 黑板状态管理"
type: feat
status: active
date: 2026-04-23
origin: docs/brainstorms/2026-04-23-v3-semantic-node-requirements.md
---

# feat: V3 语义节点 + 黑板状态管理

## Overview

将 V2 的 Agent 图从「扁平 RPC 注册中心」升级为真正的「语义层实体」。每个 Node 由三部分组成：只读属性（`@agentProperty`）+ 连接（Edge）+ 动作（`@agentMethod`）。同时引入 Runtime 层 `AgentState` 黑板，让 LLM 通过结构化的 `update_state` 动作保存中间推理结果，不再依赖膨胀的全量 history。

## Problem Frame

V2 实现了 Schema Discovery，但存在两个核心缺陷（see origin: docs/brainstorms/2026-04-23-v3-semantic-node-requirements.md）：

1. **Edge 不生效**：Prompt 中有 `traverse` 动作，但 LLM 不知道图中有哪些合法的 relation，只能盲猜
2. **节点语义不对**：`workload` 这类只读属性被包装成 `@agentMethod getWorkload()`，语义错误；动作与属性混淆

## Requirements Trace

- R1. 新增 `@agentProperty` 装饰器，声明节点只读属性对 LLM 可见
- R2. `BaseNode` 新增抽象方法 `getProperties()`，返回当前节点所有 `@agentProperty` 的 key-value 快照
- R3. `@agentMethod` 仅保留给动作/复杂计算；`Person.getWorkload()` 改为 `@agentProperty workload`
- R4. 新增 `read_node { node }` 动作：返回节点的属性快照 + 该节点出边（`{ relation: targetNodeId[] }`）
- R5. Prompt 注入 AVAILABLE TOPOLOGY 块（已激活节点的出边）
- R6. `traverse` 执行后返回目标节点类型与可用 capabilities 概要
- R7. 新增 `AgentState` 类，Runtime 层维护结构化工作内存
- R8. `AgentState` schema 在启动时以 Zod 定义传入，不允许写入未声明字段
- R9. 新增 `update_state { key, value }` 动作，LLM 用于写入黑板；Runtime Zod 验证后更新
- R10. Prompt 由全量 history 改为：GOAL + CAPABILITIES + TOPOLOGY + BLACKBOARD STATE + LAST OBSERVATION
- R11. `Validator` 支持 `read_node`、`update_state` 验证
- R12. `Executor` 支持 `read_node`、`update_state` 执行

## Scope Boundaries

- V3 仍使用 Mock LLM（`callLLM` 返回硬编码动作序列），不接入真实 LLM API
- 不引入图持久化或远程图数据库
- 不实现 `update_state` 历史回滚（黑板只能正向更新）
- 不处理多 Agent 并发写黑板的竞争

## Context & Research

### Relevant Code and Patterns

- `src/demo/runtime/decorator.ts` — `@agentMethod` 装饰器实现，V3 `@agentProperty` 完全对称复刻
- `src/demo/runtime/registry.ts` — `AgentMethodRegistry`（`className:methodName` → schema），新增 `AgentPropertyRegistry` 采用同样键格式
- `src/demo/runtime/executor.ts` — 按 `action.op` 的顺序 if 分发，V3 继续扩展
- `src/demo/runtime/validator.ts` — 同样的 if 分发 + `AgentMethodRegistry.has` + Zod `safeParse`
- `src/demo/agent/prompt.ts` — `formatCapabilities(graph)` 遍历节点构建文本块，V3 新增 `formatTopology` 和 `formatBlackboard`
- `src/demo/data/seed.ts` — `@agentMethod` + `getCapabilities()` 实现示例，V3 对 `workload` 改用 `@agentProperty`

### Institutional Learnings

- 无 `docs/solutions/` 文件

### External References

- Zod 3.25 `z.object().partial()` 用于 `update_state` 部分更新校验
- Stage-2 实验装饰器已启用（`experimentalDecorators: true` + `emitDecoratorMetadata: true`）

## Key Technical Decisions

- **独立 `AgentPropertyRegistry` vs 合并到 `AgentMethodRegistry`**：选择独立 registry。属性与方法的 schema 形状、校验路径、执行语义完全不同；合并会引入 `kind` 字段并破坏现有调用路径的清晰性（see origin）
- **`getCapabilities()` 与 `getProperties()` 分离**：保留 `getCapabilities()` 给 `call`，新增 `getProperties()` 给 `read_node`，对称且不破坏现有子类实现
- **AgentState schema 预定义（非动态）**：Zod 类型安全，防止 LLM 写入幻觉字段；每个 workflow 在 `runAgentLoop` 调用处显式传入 schema（see origin）
- **Prompt 结构精简为 LAST OBSERVATION（非全量 history）**：依赖黑板跨步保存状态，解决 context 爆炸问题（see origin）
- **`constructor.name` 作为 registry key**：继承 V2 设计，V3 不引入 Symbol 或 static id（留给未来优化），当前 Demo 不做生产打包

## Open Questions

### Resolved During Planning

- **`@agentProperty` 是否需要 Zod schema 描述**：不需要，属性只做可见性控制（returns 类型用 string），与 `@agentMethod` 的 returns 保持一致
- **`traverse` 是否需要返回目标节点 capabilities**：R6 要求附带「类型与概要」，实现时 Executor 返回 `{ nodeId, className, capabilities: CapabilitySummary }[]`，prompt 中不展开完整 schema，只展示方法名列表
- **外部研究**：不需要，现有 Zod 装饰器模式完全可在本地复制

### Deferred to Implementation

- **`getProperties()` 的实现方式**：实例方法读取 `AgentPropertyRegistry.getPropertiesForClass(className)` 后，通过 `(this as any)[propertyName]` 读取当前值；如果属性是 getter 也能正常工作。具体反射写法在实现时确认
- **AVAILABLE TOPOLOGY 的范围**：V3 Demo 简化为每步都注入图中所有节点的出边（不做「已激活节点」过滤），减少状态管理复杂度；可在后续迭代收紧
- **LAST OBSERVATION 条数**：V3 Demo 保留最后 1 条；如果 Mock LLM 验证多步推理链，保留最后 3 条可提供更好的调试信息，实现时决定

## High-Level Technical Design

> *这是方案形态的方向性说明，供审阅验证方向，不是实现规范。实现者应将其视为上下文，而非需要原样复现的代码。*

### V3 Agent Loop 时序图

```mermaid
sequenceDiagram
    participant LLM as callLLM (Mock)
    participant Loop as loop.ts
    participant Validator
    participant Executor
    participant State as AgentState
    participant Graph

    Loop->>Graph: seedGraph()
    Loop->>State: new AgentState(workflowSchema)
    loop Each Step (max 6)
        Loop->>LLM: buildPrompt(goal, graph, state)
        LLM-->>Loop: NextAction
        Loop->>Validator: validate(action, state)
        alt invalid
            Validator-->>Loop: { valid: false, error }
            Loop-->>Loop: break
        end
        Loop->>Executor: execute(action, state)
        alt read_node
            Executor->>Graph: node.getProperties() + graph.edges
            Executor-->>Loop: { properties, edges }
        else update_state
            Executor->>State: state.set(key, value) [Zod validated]
            Executor-->>Loop: { updated: key }
        else call
            Executor->>Graph: node[method](args)
            Executor-->>Loop: { result }
        else stop
            Executor-->>Loop: { reason }
        end
        Loop->>Loop: lastObservation = obs
        alt stop
            Loop-->>Loop: break
        end
    end
```

### V3 Prompt 结构

```
GOAL: Assess project risk for project_1

AVAILABLE CAPABILITIES:         ← 不变（@agentMethod）
Person (person_1):
  - (无 agentMethod)
Project (project_1):
  - checkRiskStatus(params: {teamLoad: number}, returns: { risk: 'HIGH' | 'LOW' })

AVAILABLE PROPERTIES:           ← 新增（@agentProperty）
Person (person_1):
  - workload: number — Current workload in hours
Person (person_2):
  - workload: number — Current workload in hours

AVAILABLE TOPOLOGY:             ← 新增（出边）
person_1: involved_in → [project_1]
person_2: involved_in → [project_1]

CURRENT BLACKBOARD STATE:       ← 新增（AgentState）
{ "teamLoadAccumulator": 0 }

LAST OBSERVATION:               ← 替换全量 history
read_node "person_1" → { workload: 60 }

Available actions:
1. traverse { from, relation }
2. read_node { node }
3. call { node, method, args }
4. update_state { key, value }
5. stop { reason }

Respond ONLY JSON:
```

## Implementation Units

---

- [ ] **Unit 1: `@agentProperty` 装饰器 + `AgentPropertyRegistry`**

**Goal:** 建立属性可见性声明机制，与 `@agentMethod` / `AgentMethodRegistry` 完全对称

**Requirements:** R1

**Dependencies:** 无

**Files:**
- Modify: `src/demo/runtime/registry.ts` — 新增 `PropertySchema`、`PropertySchemaConfig`、`AgentPropertyRegistry` 类
- Modify: `src/demo/runtime/decorator.ts` — 新增 `agentProperty` 函数，re-export `AgentPropertyRegistry`、`PropertySchema`

**Approach:**
- `PropertySchema`：`{ propertyName: string; returns: string; description: string }`（无 `params`，因为属性只读）
- `AgentPropertyRegistry` 键格式：`${className}:${propertyName}`，与 `AgentMethodRegistry` 完全对称
- `agentProperty` 是**属性装饰器**（`target, propertyKey`，无 `descriptor`），不是方法装饰器
- 在 `target.constructor.name` 注册；注意 Stage-2 属性装饰器签名与方法装饰器不同

**Patterns to follow:**
- `src/demo/runtime/registry.ts` — `AgentMethodRegistry` 的 register/get/getMethodsForClass/has/clear 完全复刻
- `src/demo/runtime/decorator.ts` — `agentMethod` 函数结构

**Test scenarios:**
- Happy path: `@agentProperty` 标注属性后，`AgentPropertyRegistry.has('Person', 'workload')` 返回 true
- Happy path: `AgentPropertyRegistry.getPropertiesForClass('Person')` 返回正确的 `PropertySchema[]`
- Edge case: 未标注属性 `salary` 不出现在 registry 中
- Edge case: 两个类同名属性（`Person.id` 与 `Project.id`）相互不干扰（不同 className 前缀）

**Verification:**
- `AgentPropertyRegistry` 可独立 import 并操作，与 `AgentMethodRegistry` 不共享状态

---

- [ ] **Unit 2: `BaseNode.getProperties()` + `types.ts` 扩展**

**Goal:** BaseNode 支持返回属性快照；`NextAction` 增加 `read_node` 和 `update_state` 类型

**Requirements:** R2, R4, R9

**Dependencies:** Unit 1

**Files:**
- Modify: `src/demo/runtime/types.ts` — 新增 `read_node` 和 `update_state` action 类型
- Modify: `src/demo/runtime/graph.ts` — `BaseNode` 新增 `abstract getProperties(): Record<string, any>`；移除当前未使用的 `z`、`agentMethod`、`AgentMethodRegistry`、`MethodSchema` imports

**Approach:**
- `read_node` action：`{ op: "read_node"; node: NodeId }`
- `update_state` action：`{ op: "update_state"; key: string; value: any }`
- `getProperties()` 返回 `Record<string, any>`（键为属性名，值为当前实例值）；子类通过 `AgentPropertyRegistry.getPropertiesForClass(className)` 获取元数据，再通过 `(this as any)[propName]` 读取当前值
- 清理 `graph.ts` 中未使用的 imports（Biome 会报 lint 错误）

**Patterns to follow:**
- `src/demo/runtime/graph.ts` — `abstract getCapabilities(): MethodSchema[]` 的声明方式

**Test scenarios:**
- Happy path: `new Person('p1', 60).getProperties()` 返回 `{ workload: 60 }`
- Happy path: `new Project('proj', 0.8).getProperties()` 返回 `{}`（Project 无 `@agentProperty`）
- Edge case: `getProperties()` 只返回已在 registry 中注册的属性，不泄露未标注字段

**Verification:**
- `types.ts` 的 `NextAction` 联合类型包含新的两个分支，TypeScript 类型检查通过

---

- [ ] **Unit 3: `AgentState` 黑板（新文件 `state.ts`）**

**Goal:** Runtime 层维护结构化工作内存，Zod 预定义 schema，防幻觉写入

**Requirements:** R7, R8, R9

**Dependencies:** 无（可并行于 Unit 1/2）

**Files:**
- Create: `src/demo/runtime/state.ts`

**Approach:**
- `AgentState<T extends z.ZodObject>` 类，构造时接受 `schema: T`
- 内部维护 `data: z.infer<T>`，初始值由 `schema.parse({})` 生成（Zod default() 支持）
- `set(key: keyof z.infer<T>, value: any): void`：用 `schema.shape[key].safeParse(value)` 验证后更新；失败时 throw 或返回错误
- `get(): z.infer<T>`：返回当前完整快照（用于注入 prompt）
- `toJSON(): string`：`JSON.stringify(this.data, null, 2)`

**Technical design:**
```
// 方向性伪代码
class AgentState<T> {
  schema: ZodObject
  data: infer<T>
  set(key, value)  // safeParse(value) → 更新 data[key] 或 throw
  get()            // 返回 data 快照
}
```

**Patterns to follow:**
- `src/demo/runtime/registry.ts` — 类型安全的静态类设计风格

**Test scenarios:**
- Happy path: `state.set('teamLoadAccumulator', 130)` 更新成功，`state.get().teamLoadAccumulator === 130`
- Error path: `state.set('teamLoadAccumulator', 'not-a-number')` 抛出 Zod 验证错误
- Error path: `state.set('unknownKey', 42)` 抛出（字段不在 schema 中）
- Edge case: 初始 `state.get()` 返回 schema 所有 default 值

**Verification:**
- 可在 `index.ts` 传入 `z.object({ teamLoadAccumulator: z.number().default(0) })` 正常工作

---

- [ ] **Unit 4: `Validator` 扩展（`read_node` + `update_state`）**

**Goal:** 验证新动作的合法性；`read_node` 校验节点存在，`update_state` 校验 key 合法

**Requirements:** R11

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `src/demo/runtime/validator.ts`

**Approach:**
- `read_node`：检查 `graph.getNode(action.node)` 存在即可（属性访问权限由 `AgentPropertyRegistry` 隐含）
- `update_state`：检查 `agentState.schema.shape[action.key]` 存在（key 合法性）；value 的 Zod 验证在 Executor 执行时做（Validator 只做轻量前置检查，避免重复执行 parse）
- `Validator` 构造器新增 `private agentState: AgentState<any>` 参数

**Patterns to follow:**
- `src/demo/runtime/validator.ts` — 现有 `if (action.op === "call")` 的分支结构

**Test scenarios:**
- Happy path: `read_node { node: "person_1" }` → `{ valid: true }`
- Error path: `read_node { node: "nonexistent" }` → `{ valid: false, error: "Node 'nonexistent' not found" }`
- Happy path: `update_state { key: "teamLoadAccumulator", value: 130 }` → `{ valid: true }`
- Error path: `update_state { key: "unknownKey", value: 1 }` → `{ valid: false, error: "Key 'unknownKey' not in state schema" }`

**Verification:**
- `Validator` 对所有 5 种 op 都有明确分支，不会落到 `return { valid: true }` 兜底

---

- [ ] **Unit 5: `Executor` 扩展（`read_node` + `update_state`）**

**Goal:** 执行新动作；`read_node` 返回属性快照 + 出边；`update_state` 写入黑板

**Requirements:** R4, R6, R12

**Dependencies:** Unit 2, Unit 3

**Files:**
- Modify: `src/demo/runtime/executor.ts`

**Approach:**
- `Executor` 构造器新增 `private agentState: AgentState<any>` 参数
- `read_node` 分支：
  1. 获取 node
  2. `node.getProperties()` — 属性快照
  3. `graph.edges.filter(e => e.from === action.node)` — 出边列表，聚合为 `{ [relation]: targetNodeId[] }`
  4. 返回 `{ success: true, data: { properties, edges } }`
- `update_state` 分支：
  1. 调用 `agentState.set(action.key, action.value)`（内部有 Zod 验证，失败会 throw）
  2. 返回 `{ success: true, data: { updated: action.key } }`
- R6（`traverse` 附带目标节点概要）：`traverse` 分支在返回 ID 列表的同时，附带 `{ nodeId, className, methodNames: string[] }[]`

**Patterns to follow:**
- `src/demo/runtime/executor.ts` — 现有 `if (action.op === "call")` 的 try/catch 模式

**Test scenarios:**
- Happy path: `read_node { node: "person_1" }` → `{ success: true, data: { properties: { workload: 60 }, edges: { involved_in: ["project_1"] } } }`
- Happy path: `update_state { key: "teamLoadAccumulator", value: 130 }` → `{ success: true, data: { updated: "teamLoadAccumulator" } }`
- Error path: `update_state` with invalid value → `{ success: false, error: "..." }`
- Integration: `traverse { from: "person_1", relation: "involved_in" }` 返回结果包含 `project_1` 的 className 和 methodNames

**Verification:**
- `execute({ op: "read_node", node: "person_1" })` 返回正确的属性+出边结构

---

- [ ] **Unit 6: `prompt.ts` 重构（四块结构）**

**Goal:** Prompt 注入 PROPERTIES + TOPOLOGY + BLACKBOARD STATE + LAST OBSERVATION；移除全量 history

**Requirements:** R5, R10

**Dependencies:** Unit 1, Unit 3

**Files:**
- Modify: `src/demo/agent/prompt.ts`

**Approach:**
- 新增 `formatProperties(graph: Graph): string` — 遍历节点，展示 `@agentProperty` 字段
- 新增 `formatTopology(graph: Graph): string` — 遍历图的 edges，按 `from` 分组展示出边
- 新增 `formatBlackboard(state: AgentState<any>): string` — `JSON.stringify(state.get())`
- `buildPrompt` 签名改为 `(goal, graph, state, lastObservation)` — 移除 `history` 参数
- `available actions` 列表增加 `read_node` 和 `update_state`

**Technical design:**
```
// Prompt 文本块顺序（方向性）
GOAL
AVAILABLE CAPABILITIES      // @agentMethod（保留）
AVAILABLE PROPERTIES        // @agentProperty（新增）
AVAILABLE TOPOLOGY          // 所有出边（新增）
CURRENT BLACKBOARD STATE    // AgentState.get()（新增）
LAST OBSERVATION            // 最后一条 obs（替换 history）
Available actions           // 增加 read_node + update_state
Respond ONLY JSON
```

**Patterns to follow:**
- `src/demo/agent/prompt.ts` — `formatCapabilities()` 遍历 `graph.nodes` 的构建模式

**Test scenarios:**
- Happy path: 有 `@agentProperty workload` 的 `Person` 节点在 AVAILABLE PROPERTIES 块中显示
- Happy path: `person_1 → involved_in → project_1` 出边在 AVAILABLE TOPOLOGY 块中显示
- Happy path: `state = { teamLoadAccumulator: 60 }` 在 CURRENT BLACKBOARD STATE 块中显示
- Edge case: 无 `@agentProperty` 的节点（如 `Project`）不在 AVAILABLE PROPERTIES 中出现空块

**Verification:**
- 生成的 prompt 字符串包含所有四个新块；不再包含 `history` 关键字

---

- [ ] **Unit 7: 串联组装（`loop.ts` + `seed.ts` + `index.ts`）**

**Goal:** 将所有新组件接入 Agent Loop；`seed.ts` 用 `@agentProperty` 替换 `getWorkload()`；`index.ts` 传入 workflow schema

**Requirements:** R3, R8, 完成端到端验证

**Dependencies:** Unit 3, Unit 4, Unit 5, Unit 6

**Files:**
- Modify: `src/demo/agent/loop.ts` — 维护 `AgentState`；更新 `Validator`/`Executor` 构造；传 `lastObservation` 给 `buildPrompt`；接受 `stateSchema` 参数
- Modify: `src/demo/data/seed.ts` — `Person.workload` 改用 `@agentProperty`；删除 `getWorkload()` 方法；保留 `checkRiskStatus` 作为 `@agentMethod`
- Modify: `src/demo/index.ts` — 传入 `workflowSchema: z.object({ teamLoadAccumulator: z.number().default(0) })`
- Modify: `src/demo/agent/loop.ts` — `callLLM` 中的 Mock 动作序列更新为完整推理链（read_node × 2 → update_state × 2 → call → stop），以便端到端验证

**Approach:**
- `runAgentLoop` 签名改为 `(goal, graph, executor, validator, stateSchema)`
- `lastObservation` 变量跟踪最新的 obs，每步覆盖
- Mock 推理链（用于 Demo 验证）：
  1. `read_node { node: "person_1" }` → obs: `{ workload: 60 }`
  2. `update_state { key: "teamLoadAccumulator", value: 60 }`
  3. `read_node { node: "person_2" }` → obs: `{ workload: 70 }`
  4. `update_state { key: "teamLoadAccumulator", value: 130 }`
  5. `call { node: "project_1", method: "checkRiskStatus", args: { teamLoad: 130 } }`
  6. `stop { reason: "Project risk is HIGH due to overloaded team" }`

**Patterns to follow:**
- `src/demo/agent/loop.ts` — 现有 `for` 循环结构
- `src/demo/data/seed.ts` — `@agentMethod` 使用示例（对称迁移到 `@agentProperty`）

**Test scenarios:**
- Integration: 完整 6 步 Mock 推理链执行完毕，`console.log` 输出 `✅ DONE: Project risk is HIGH...`
- Integration: `AgentState` 在第 2 步后 `teamLoadAccumulator === 60`，第 4 步后 `=== 130`
- Integration: Validator 在任何步骤均未触发 `❌ Invalid action`

**Verification:**
- `npx tsx src/demo/index.ts` 正常退出，输出 6 步完整推理链的 ACTION/OBS 日志，最终打印 `✅ DONE`

---

## System-Wide Impact

- **无对外 API**：本项目为 Demo，不涉及 HTTP 接口或外部消费者
- **装饰器副作用时序**：`@agentProperty` 在 class 定义时注册，与 `@agentMethod` 相同；`seed.ts` 必须在 registry 使用前 import（当前 `index.ts` 已正确引入）
- **`constructor.name` 稳定性**：Demo 环境不做打包/混淆，风险可控；`getProperties()` 子类实现时的 `'Person'` 字符串字面量必须与类名一致
- **Prompt 体积**：TOPOLOGY 块随图规模线性增长；V3 Demo 图节点为 3，安全无忧

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Stage-2 属性装饰器签名（`target, propertyKey`，无 `descriptor`）与方法装饰器不同，可能需要调整 | Unit 1 实现时参照 TS 5.7 + `experimentalDecorators: true` 的属性装饰器签名文档 |
| `AgentState.set()` 对 schema key 不存在时的行为（`schema.shape[key]` 可能为 undefined）| 显式检查 `key in schema.shape`，不存在时 throw 清晰错误 |
| `Object.values(parsed)` 参数顺序（V2 Executor 遗留问题）| `checkRiskStatus` 参数只有 `teamLoad` 一个字段，此次不扩展，但新增动作应用具名字段传参 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-23-v3-semantic-node-requirements.md](../brainstorms/2026-04-23-v3-semantic-node-requirements.md)
- **V3 设计草案:** [docs/v2_to_v3.md](../v2_to_v3.md)
- **V2 实现总结:** [docs/think_v2.md](../think_v2.md)
