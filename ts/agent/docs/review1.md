# 评审1

这个 Demo 非常清晰地展示了 **“LLM 决策 + Runtime 执行”** 的解耦架构。作为一个最小闭环，它在逻辑上是自洽的，但如果要从“原型”向“工程化系统”演进，目前的实现存在几个关键的**架构缺陷**和**工程隐患**：

---

### 1. 核心缺陷：内省能力缺失 (Introspection Gap)
**现象**：Prompt 中告诉 LLM 可以 `call` 方法，但 LLM 并不知晓 `Person` 有 `getWorkload`，也不知晓 `Project` 有 `checkRiskStatus`。
* **后果**：LLM 只能靠“猜”或者依靠开发者在 Prompt 里硬编码方法名。一旦 Graph 节点类型增加，Prompt 会迅速膨胀且难以维护。
* **改进建议**：实现 **Schema 自动发现**。Runtime 应该在 Loop 开始前向 LLM 提供当前节点的“能力清单”（Available Methods）。

### 2. 安全性与鲁棒性：动态调用的风险
**现象**：`executor.ts` 中使用了 `(node as any)[action.method]`。
* **后果**：
    * **安全隐患**：如果节点上有 `constructor` 或其他敏感的内建方法，LLM 可能会意外触发。
    * **参数映射模糊**：`action.args` 只是一个 `any`。如果方法需要三个参数，或者参数是特定对象，目前的 `call` 逻辑会直接崩溃。
* **改进建议**：引入 **Action Registry (注册表)** 或 **Decorator (装饰器)**。明确标记哪些方法是 `Agent-Accessible` 的，并定义参数的 JSON Schema。

### 3. 状态膨胀与上下文窗口 (Context Management)
**现象**：`buildPrompt` 每次都将整个 `history` 序列化。
* **后果**：
    * 随着 `step` 增加，History 变得非常冗长（包含大量的冗余 JSON 结构）。
    * **观察值污染**：如果一次 `traverse` 返回了 100 个 ID，Prompt 很快就会超过 Token 限制。
* **改进建议**：引入 **Observation Summarizer**。对执行结果进行精简或分级显示，只给 LLM 提供决策必要的“增量信息”，而非原始报文。

### 4. 验证逻辑过于单薄 (Shallow Validation)
**现象**：`Validator` 仅校验了 Node 是否存在。
* **后果**：它无法校验 **“逻辑一致性”**。例如，LLM 可能会尝试在 `Person` 节点上调用 `checkRiskStatus`。
* **改进建议**：
    * **类型检查**：校验 `method` 是否属于该 `NodeId` 对应的类。
    * **预执行校验**：利用 TypeScript 的反射或 metadata，在 `executor` 运行前拦截参数不匹配的请求。

### 5. 缺乏“中间思考”空间 (No CoT Support)
**现象**：`NextAction` 强制要求立即输出 JSON。
* **后果**：LLM 没有地方进行推理（Reasoning），这会导致它在复杂逻辑下（比如需要先汇总 5 个人的 workload 再判断风险）容易出现逻辑断层或计算错误。
* **改进建议**：采用 **Thought-Action 分离** 模式：
    ```json
    {
      "thought": "我需要先获取所有成员的工作量...",
      "action": { "op": "traverse", ... }
    }
    ```

### 6. 数据流闭环的缺陷 (Data Flow Loop)
**现象**：`checkRiskStatus(teamLoad: number)` 需要一个外部计算后的 `teamLoad`。
* **后果**：现在的架构中，LLM 必须在脑子里记住所有的 `workload` 并口算总和，然后作为 `args` 传给 `checkRiskStatus`。LLM 的口算能力是不可靠的。
* **改进建议**：
    * **增加 Scratchpad (临时草稿堆栈)**：允许 Agent 在 Runtime 侧存储临时变量。
    * **原子化 vs 复合化**：或者在 Runtime 提供一个 `aggregateWorkload` 的工具方法。

---

### 💡 总结评估

| 维度 | 评价 | 风险等级 |
| :--- | :--- | :--- |
| **架构解耦** | 优秀 | - |
| **类型安全** | 较弱 | ⚡ 高 |
| **可扩展性** | 中等 | ⚠️ 中 |
| **确定性** | 低（完全依赖 LLM 猜方法） | ⚡ 高 |

**下一步建议：**
不要急着堆功能，先给 `BaseNode` 增加一个 `getCapabilities()` 接口，并在 `buildPrompt` 时将这些元数据喂给 LLM。只有让 Agent 知道自己拥有什么“工具”，它的“推理”才会从“玄学猜测”变成“逻辑编排”。

