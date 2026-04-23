---
date: 2026-04-23
topic: v3-semantic-node
---

# V3：语义节点 + 黑板状态

## Problem Frame

V2 实现了 Schema Discovery，但 Agent 把图当成了扁平的 RPC 注册中心（API Hub）：
- LLM 不知道图中有哪些合法的 edge/relation，只能靠猜测调用 `traverse`
- 节点属性（如 `workload`）被包装成 `@agentMethod`，语义错误：属性读取不是动作
- 中间推理状态（如汇总的 teamLoad）只能依赖 LLM 在 history 中自我记忆，导致 context 膨胀和注意力丢失

V3 让 Node 回归语义层实体的本质：**属性（Properties）+ 连接（Edges）+ 动作（Actions）三位一体**，并在 Runtime 引入结构化黑板管理推理状态。

## Requirements

**Node 语义层**

- R1. 新增 `@agentProperty` 装饰器，用于声明节点的只读属性对 LLM 可见；未标注的属性不可访问
- R2. `BaseNode` 新增抽象方法 `getProperties()`，返回当前节点所有 `@agentProperty` 字段的 key-value 快照
- R3. `@agentMethod` 保留，仅用于执行动作/复杂计算（如 `checkRiskStatus`）；原本只是属性读取的 `getWorkload()` 改为 `@agentProperty workload`

**图游走与局部拓扑**

- R4. 新增 Agent 动作 `read_node { node }`：返回该节点的 `@agentProperty` 属性快照 + 该节点出发的所有边（`{ relation: targetNodeId[] }`）
- R5. Prompt 中注入 AVAILABLE TOPOLOGY 块，展示当前已激活节点的出边信息，让 LLM 知道可以游走到哪里
- R6. `traverse` 执行后，Executor 返回目标节点 ID 列表，并自动附带每个目标节点的类型与可用 capabilities 概要（不需要完整 schema）

**黑板状态管理**

- R7. 新增 `AgentState` 类，在 Runtime 层维护结构化的推理工作内存（Working Memory）
- R8. `AgentState` 的 Schema 在启动 Agent Loop 时以 Zod 定义传入（predefined），不允许 LLM 写入 schema 未声明的字段
- R9. 新增 Agent 动作 `update_state { key, value }`：LLM 用于将中间推理结果（如汇总数值）写入黑板；Runtime 用 Zod 验证后更新
- R10. Prompt 结构由"全量 history"改为：GOAL + CAPABILITIES + AVAILABLE TOPOLOGY + CURRENT BLACKBOARD STATE + LAST OBSERVATION，压缩 context 体积

**Validator / Executor 适配**

- R11. `Validator` 新增对 `read_node`、`update_state` 动作的验证逻辑（节点存在性、state key 合法性）
- R12. `Executor` 新增对 `read_node`、`update_state` 动作的执行逻辑

## Success Criteria

- LLM 能在不猜测 relation 名称的情况下，通过 `read_node` 发现边并完成图游走
- 端到端推理链（read → traverse → read → update_state → call → stop）能在 Demo 中完整执行，无需 LLM 在 history 中手动汇总数值
- Prompt 中不再出现无效的全量 history，每步只携带 BLACKBOARD STATE + LAST OBSERVATION

## Scope Boundaries

- V3 仍使用 Mock LLM（`callLLM` 返回硬编码动作序列），不接入真实 LLM API
- 不引入图持久化、远程图数据库
- 不实现 `update_state` 的历史回滚（黑板只能正向更新）
- 不处理多 Agent 并发写黑板的竞争问题

## Key Decisions

- **`@agentProperty` vs `getWorkload()` 方法**：属性读取应声明为 Property，保持语义准确；`@agentMethod` 只用于有副作用或需要入参的计算
- **AgentState Schema 预定义**：确保 Zod 类型安全，防止 LLM 写入幻觉字段；灵活性的代价可控
- **Prompt 结构精简**：只传 LAST OBSERVATION（而非全量 history），依赖黑板承载跨步状态，降低 context 爆炸风险

## Dependencies / Assumptions

- 依赖 V2 已有的 `AgentMethodRegistry`、`@agentMethod`、`Validator`、`Executor` 结构，V3 在其上增量扩展
- 假设 Zod 已作为项目依赖（V2 已引入）

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R4][Technical] `getProperties()` 是通过装饰器在 class metadata 中注册（类似 `AgentMethodRegistry`），还是每个节点实例手动实现？两种方式的 reflect-metadata 兼容性需在规划时确认
- [Affects R5][Technical] AVAILABLE TOPOLOGY 是每步动态计算（遍历所有已 `read_node` 的节点），还是只展示当前 step 的节点上下文？对 Prompt 长度影响需评估
- [Affects R10][Technical] "LAST OBSERVATION" 是严格只保留最后一条，还是保留最近 N 条？N 的取值需根据实际 LLM 测试确定

## Next Steps

→ `/ce:plan` 进行结构化实现规划
