# v7 整理

## graph


```js
search_nodes(query?, type?, relatedTo?, limit?, offset?)
  按目标、类型、关键词或相关实体搜索节点。

inspect_node(nodeId, fields?)
  读取节点，但支持字段投影：
  fields = ["type", "properties", "outEdges", "inEdges", "methods"]

query_neighbors(nodeId, relation?, direction?, type?, limit?, offset?)
  查询邻居，支持关系、方向、类型、分页。

aggregate_facts(entityIds, metric, groupBy?)
  对事实做聚合，例如 teamLoad、seniorCount、memberCount。
```

### search_nodes

1. 如果没有 `relatedTo`（传统的全局搜索）
你可能会执行：`search_nodes(query: "风险")`
*   **结果**：系统可能会返回全公司 500 个带“风险”字样的节点（项目 B 的超支风险、财务部的合规风险等）。
*   **问题**：这产生了大量的无效信息，浪费了 Token，且模型很难判断哪些风险真的和 `Project_A` 有关。

2. 有了 `relatedTo`（图拓扑约束搜索）
你会执行：`search_nodes(query: "风险", relatedTo: "Project_A")`
*   **它的含义**：请在**与 `Project_A` 有关联**的范围内，帮我找关键词包含“风险”的节点。
*   **返回结果**：系统只返回那些在图结构上直接或间接连接到 `Project_A` 的风险节点（例如：`Project_A_进度延后风险`）。

为什么要这么设计？（结合来源的深度理解）

1.  **缩小探索范围，支持“证据驱动”**：
    V5 的目标是“收集证据”。`relatedTo` 让模型能够像侦探一样，顺着 `Project_A` 这个线索，定向挖掘它周围的证据，而不是在全图中瞎撞。
2.  **解决“高连接度”难题**：
    有些节点（比如“研发部”）可能连接了 1000 个成员。如果你直接查所有邻居，上下文会溢出。通过 `search_nodes(query: "高级专家", relatedTo: "研发部")`，你可以精准地只在研发部里搜特定的人，而不需要拉取整个部门名单。
3.  **安全性与权限**：
    在 V5 的愿景中，系统可能涉及权限场景。`relatedTo` 确保了你搜索出的信息是在当前任务上下文（入口实体）授权范围内的，避免泄露无关实体的隐私。

**总结来说：**
`relatedTo` 就像是给你搜索时加了一个**“空间锚点”**。它告诉系统：“我不是在海里捞针，我是在**这个特定的房子（relatedTo）**里找**这根针（query）**。”


### sensitive 标识

`agentVisible` VS  `sensitive`（敏感标记）代表了两个完全不同的**合规与安全维度**。


1. 维度不同：访问权限 vs. 数据保护
*   **`agentVisible` (权限控制)**：解决的是**“实体或属性是否存在”**的问题。
    *   如果一个实体对 Agent 不可见（在 `deniedEntityIds` 中），Agent 在调用 `query_neighbors` 或 `search_nodes` 时完全发现不了它。它在 Agent 的世界里是彻底消失的。
*   **`sensitive` (敏感标记)**：解决的是**“数据如何被处理”**的问题。
    *   当 Agent **有权**看到某个节点，但该节点某些属性标记为 `sensitive` 时，系统会执行 **Mask（遮蔽）** 或 **Redact（擦除）** 处理。Agent 知道这个属性存在，但看到的是脱敏后的值（如 `****`）。

2. 核心价值：防止“证据链”泄露 PII
这是 V6 引入 `sensitive` 最关键的设计决策：**禁止将敏感数据写入证据（Evidence）**。
*   **场景**：Agent 在做决策推理时，需要引用某些事实作为证据。
*   **问题**：即使 Agent 本身因为某种权限看到了用户的真实手机号，如果它把这个手机号直接写进 `record_evidence`，那么这条手机号就会永久保存在系统的 **Trace（推理轨迹）** 中，甚至出现在给用户的最终报告里。
*   **解决方案**：有了 `sensitive` 标记，`withPolicy` 装饰器会强制要求：**禁止把 redacted（已脱敏）的字段记入 evidence**。这确保了决策过程是合规的，不会在日志或报告中留下 PII 信息。

3. 具体场景对比

| 场景 | 状态 | 结果 |
| :--- | :--- | :--- |
| **完全不可见** | `agentVisible: false` | Agent 搜不到该员工，仿佛查无此人。 |
| **可见但敏感** | `agentVisible: true` + `sensitive: true` | Agent 知道有这个员工，但在查看详情时，手机号显示为 `****`。 |
| **可见且非敏感** | `agentVisible: true` + `sensitive: false` | Agent 可以正常阅读并将其作为证据引用到最终报告中。 |

这种设计让 V6 能够从 V5 的“全透明 demo”进化为**真正可上生产的、符合隐私政策（Policy-aware）的系统**。


## 本体 和 graph 的关系

```
G = { E, R, T, C }

T: 类型/类集合
  - Engineer
  - Team
  - Project
  - DecisionTask
  - Evidence
  - CandidateAnswer

R: 关系 schema + 关系事实
  - schema: Engineer --member_of--> Team
  - schema: Engineer --assigned_to--> Project
  - schema: Project --depends_on--> Project
  - facts: 通过 tool 按需查询，不在 prompt 中全量展开

E: 实体集合
  - 不在 System Prompt 中全量注入
  - 通过入口实体、搜索、邻居查询、分页、字段投影逐步披露

C: 公理、约束、准则、权重、解释模板
  - 硬约束：不能违反的规则
  - 软约束：偏好、权重、评分维度
  - 推导规则：如何从事实得到中间判断
  - 冲突规则：多个信号冲突时如何呈现
  - 解释规则：最终答案如何引用事实和规则
```

在工程上，你可以把 E 当作 new T() ——这是一个非常好的建模起点
> ❗ 虽然, 在本体论理论上：E 不一定有 T、可以有多个 T、甚至 T 本身也是 E



### Q1：RelationSchema 和 Edge 到底是什么关系？

在 G = {E, R, T, C} 中，R 本身有**两个层次**：

```
R_schema (类型层)    R_fact (实例层)
────────────────    ──────────────────────────────
RelationSchema      Edge
from: "Reader"      from: "xiao_ming"   (node id)
to:   "Book"        to:   "book_ai_history"
type: "borrows"     type: "borrows"
description: ...    (无描述)
```

这就是 T ↔ E 的对应关系在 R 上的镜像：
- `TypeSchema` : `BaseNode` = `RelationSchema` : `Edge`
- `TypeSchema` 描述**可能存在的实体类型**，`RelationSchema` 描述**可能存在的边类型**
- `BaseNode` 是具体实例，`Edge` 是具体边

---

### Q2：E = new T() 是正确简化吗？

是的。本项目做了合理的 closed-world 简化：

```
本体论通用      →    本项目简化
──────────────────────────────────────
E 可无 T             每个 E 必有一个 T
E 可有多个 T         E = new T(id, ...)
T 自身也可以是 E      T = TS/JS class
```

这个简化没有副作用，反而让 Registry + 装饰器系统成立。

---

### Q3：既然 E = new T()，能否把 R 简化为 graph edge？

RelationSchema 是 Schema，Edge 是 Instance。
new T() 受 TypeSchema 约束，addEdge() 同理应受 RelationSchema 约束。

```
T 层          E 层
──────────    ──────────────────────────────────
TypeSchema    BaseNode (new Reader / Book / Library)
              → @agentType 装饰器注册到 Registry

RelationSchema  Edge (addEdge)
                → Graph 构造时注入 relations
                → addEdge 验证 type / fromType / toType
```

### Q5: inspect_schema TODO

