# frontend

意图识别 + 实体链接 + 澄清


- `classifyIntent`：采用**“规则匹配优先 + 语义向量/LLM 降级”的混合模式
- `linkEntities`：实体链接的核心目标是确定入口实体（Entry Entities），它是实现渐进式披露的锚点
- 澄清问题不是 free-form chat，而是**结构化选择题**（"你说的是 A. project_portal (Product) 还是 B. portal_v2 (Marketing)"）。
- 根据用户chat，以确定目标

## classifyIntent + linkEntities

```
前：userQuery → detectIntent → task (entryEntities 硬编码)
后：userQuery → frontEnd()
              ├─ classifyIntent (规则 → LLM fallback)
              ├─ linkEntities   (《》规则提取 → alias匹配 → LLM NER fallback)
              └─ clarify 判断 → task 或 ClarifyQuestion[]
```

TODO:

**正确的实现应该：**
1.  **先分模式**：判断用户是在问“未来/建议”还是“过去/原因”。
2.  **同步链接**：在识别意图的同时，把 `entryEntities` 抓出来填进 `FactStore`。
3.  **提取上下文**：如果是诊断模式，必须抓取“发生的事”和“发生的时间”。
4.  **准备规则**：根据意图返回 `expectedRules`，告诉 Planner 应该关注本体中的哪些 C。

## 分析2

在 V6/V7 的架构设计中，**`classifyIntent`** 和 **`linkEntities`** 构成了前端 Pipeline 的核心，负责将模糊的自然语言（NL）转化为结构化的决策任务（`DecisionTask`）。

以下是基于源代码设计哲学和 V6/V7 演进路线的具体实现建议：

### 1. `classifyIntent`：意图识别的实现建议

建议采用**“规则匹配优先 + 语义向量/LLM 降级”**的混合模式，并引入 V6.5 的**双模式（Predictive vs Diagnostic）**分类逻辑。

*   **一级分类：模式识别 (Mode Selection)**
    *   **Predictive (前向)**：识别关键词如“风险”、“预测”、“能否”、“建议”。
    *   **Diagnostic (后向/溯因)**：识别关键词如“为什么”、“原因”、“复盘”、“归因”。
*   **二级分类：意图矩阵 (Intent Matrix)**
    *   维护一个 `IntentRegistry`，定义意图与规则集（Rule Set）的映射。
    *   **实现逻辑**：
        1.  **正则/关键词匹配**：对于高频明确词汇（如“借阅上限”、“风险等级”）直接映射到对应的 `intentID`。
        2.  **LLM 语义分类**：若规则未命中，调用轻量级 LLM，输入 `userQuery` 和 `Intent Schema`，输出最匹配的意图 ID。
*   **输出结构**：
    ```typescript
    {
      intentId: "risk_assessment", // 对应本体中的 Rule Set
      mode: "predictive",         // 决定后续使用哪种 Planner/Critic
      confidence: 0.95
    }
    ```

### 2. `linkEntities`：实体链接的实现建议

在 V6 中，实体链接的核心目标是确定**入口实体（Entry Entities）**，它是实现渐进式披露的锚点。建议暂不使用复杂的向量检索，而采用**“精确/模糊匹配 + 上下文缓存”**的方案。

*   **多源候选生成**：
    1.  **ID/别名匹配**：利用图数据库的索引，对查询中的名词进行 ID 模糊匹配或别名表（Alias Table）查找。
    2.  **上下文补全**：检查 `userContext.recentEntities`。例如用户说“他呢？”，系统应自动链接到上文刚讨论过的 `entityId`。
*   **消歧机制 (Disambiguation)**：
    *   如果匹配到多个同名候选（如两个叫“小明”的读者），**不要让 LLM 猜**。
    *   **实现建议**：返回 `ambiguity: true` 和候选列表，触发前端的**结构化选择题**（如：“您是指 A. 产品部的项目 还是 B. 市场部的项目？”），而不是自由对话。
*   **输出结构**：
    ```typescript
    {
      linkedEntities: [
        { entityId: "reader:xiao_ming", role: "subject", confidence: 1.0 }
      ],
      ambiguity: 0 // 若大于 0 则需要触发澄清流程
    }
    ```

### 3. 协同工作：构建 `DecisionTask`

这两个组件的输出应直接封装为 `DecisionTask` 喂给 **Planner**：

1.  **入口实体进入 FactStore**：链接到的 `entityId` 将作为第一批数据写入 `FactStore`，作为后续 `inspect_node` 的起点。
2.  **意图决定规则子图**：`intentId` 会告诉 **Planner** 哪些规则（Rule DAG）是相关的，从而进行**规则剪枝**，避免在推理时加载上千条无关规则。
3.  **模式决定推理路径**：如果是 `diagnostic` 模式，Planner 会生成**反向回溯计划**（沿 `CausalGraph` 走）；如果是 `predictive` 模式，则生成**前向探索计划**。

### 总结
*   **`classifyIntent`** 关键在于识别**推理方向**（前向预测还是后向归因）。
*   **`linkEntities`** 关键在于**消歧**和**上下文复用**，并为 `FactStore` 提供初始锚点。
*   **核心原则**：将复杂性留在前端 Pipeline，确保进入中段（Executor/Critic）的任务是高置信且结构化的。
