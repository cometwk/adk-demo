这是一个非常核心且致命的架构问题。当你引入了 `read_node` 和动态游走后，LLM 就像是一个拿着手电筒在巨大迷宫（知识图谱）里探索的人。如果把一路上看到的所有房间细节（Node Properties）都强行塞进它的脑子（Context Window），**“上下文爆炸”和“Lost in the Middle（中间注意力丢失）”是必然的下场。**

在 V3 的语境下，我强烈推荐**在 Runtime 层面维护一个全局的 `AgentState`（黑板模式）**，而不是单纯依赖 LLM 在对话历史中死记硬背或自我总结。

下面我们来深度对比这两种方案的利弊，并推演 V3 的最佳实践。

---

### 方案 A：依赖 LLM 的 Context Window（对话历史累积/自我总结）

即原封不动地把每一次 `read_node` 的 Observation 追加到 History 中，或者让 LLM 定期执行一个 `summarize` 动作。

* **优点：**
    * **开发成本极低**：Runtime 不需要做任何额外的状态管理逻辑，只需要无脑 Push 字符串。
    * **灵活性极高**：LLM 自由发挥，不需要预先定义状态 Schema。
* **致命缺点：**
    * **Token 成本与延迟飙升**：随着游走步数增加（比如走了 10 步，读了 5 个 Node），Prompt 会变得异常臃肿，每次推理的 API 费用和响应时间都会呈线性甚至指数级增长。
    * **注意力失焦（幻觉温床）**：当 Context 里塞满了大量冗余的 Node 属性时，LLM 极容易在最终计算时提取错数字，或者把 `person_1` 的属性张冠李戴给 `person_2`。
    * **缺乏可解释性**：如果出错了，你很难去 Debug 它到底是在哪一步把数据“记错”的。

---

### 方案 B：Runtime 层维护 `AgentState` 黑板（推荐）

在 Runtime 引入一个类型安全的 `AgentState`（Working Memory），LLM 的 Context 永远保持“轻量级”，只包含**目标、当前局部拓扑结构、以及当前的黑板状态**。

* **优点：**
    * **确定性与防幻觉**：状态是 Zod 校验过的 JSON，数字就是数字，不会随着 LLM 的胡言乱语而改变。
    * **Context 极致瘦身**：不用把长篇大论的历史全带上，每次 Prompt 只需注入 `Current State: { "teamLoad": 130 }`，极大降低 Token 消耗和延迟。
    * **工程化监控**：作为开发者，你随时可以打出每一步的 `AgentState`，排查问题一目了然。
* **缺点：**
    * **需要增加动作原语**：LLM 必须学会如何“写黑板”，这增加了 Prompt 的设计难度。
    * **灵活性受限**：如果是非常发散的任务，预定义的 State Schema 可能会成为限制。

---

### V3 的推荐架构：读写分离的“CPU-RAM-Disk”模型

要在 V3 中完美落地黑板模式，我们可以借鉴计算机底层的存储架构：

* **LLM Context Window** = **CPU 寄存器 (L1 Cache)**：容量极小，只处理当前这一步的直接输入。
* **AgentState (黑板)** = **内存 (RAM)**：由 Runtime 维护的结构化上下文。
* **Semantic Graph (语义层)** = **硬盘 (Disk)**：海量数据，需要游走去读取。

#### 具体的 V3 落地设计：

**1. 定义黑板 Schema (Zod)**
在启动 Agent 时，除了传入 Goal 和 Graph，再传入一个 State Schema：
```ts
const workflowStateSchema = z.object({
  discoveredRisks: z.array(z.string()).default([]),
  teamLoadAccumulator: z.number().default(0)
});
```

**2. 增加一个新的核心动作：`update_state`**
不要让 Runtime 去猜 LLM 想存什么，**把写黑板的权力交给 LLM**。
```text
Available actions:
1. traverse { from, relation }
2. read_node { node }
3. call { node, method, args }
4. update_state { key, value }   ← 新增：将计算或读取到的中间结果写入黑板
5. stop { reason }
```

**3. 精简 History 的传递机制**
现在的 Prompt 不再包含冗长的全量 History，而是变成动态的“状态快照”：
```text
GOAL: Assess project risk for project_1

CURRENT BLACKBOARD STATE:
{
  "teamLoadAccumulator": 60
}

LAST OBSERVATION:
read_node "person_2" -> { workload: 70 }

AVAILABLE ACTIONS: ...
```

#### V3 推理链演示（带黑板）：

1.  **LLM 动作**: `read_node { node: "person_1" }`
    * *Obs*: `workload: 60`
2.  **LLM 动作**: `update_state { key: "teamLoadAccumulator", value: 60 }`
    * *Runtime 验证并更新黑板*，清理过期的 Observation。
3.  **LLM 动作**: `read_node { node: "person_2" }`
    * *Obs*: `workload: 70`
4.  **LLM 动作**: `update_state { key: "teamLoadAccumulator", value: 130 }`
    * *(LLM 自己在寄存器里做加法，然后把结果写回内存)*
5.  **LLM 动作**: `call { node: "project_1", method: "checkRiskStatus", args: { teamLoad: 130 } }`

---

**总结**：在语义图游走中，**图结构本身提供了空间上的广度，而 AgentState 提供了时间上的记忆**。将两者剥离，不仅能拯救 LLM 可怜的上下文窗口，也是让 Agent 从“玩具”走向“工程化中间件”的必经之路。
