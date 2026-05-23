# Graph Query Runtime 设计文档（V2）

> 本文档描述 V6 Graph Runtime 的下一阶段演进：
> 从「Graph Query Engine」升级为：
>
> ```text
> Agent-driven Adaptive Reasoning Runtime
> ```
>
> 核心目标：
>
> * Agent 负责语义推理（Semantic Reasoning）
> * Runtime 负责执行编排（Execution Orchestration）
> * Graph 专注关系遍历（Traversal）
> * OLAP 专注聚合计算（Aggregation）
>
> 核心边界：
>
> ```text
> Agent 决定"下一步想知道什么"
> Runtime 决定"怎样最高效地得到答案"
> ```
>
> 即：
>
> ```text
> Agent for reasoning
> Runtime for orchestration
> Graph for narrowing
> OLAP for aggregation
> ```

---

# 1. 问题背景

## 1.1 第一代 `graph_query` 的问题

V1 中引入：

```text
MATCH → TRAVERSE → RETURN
```

解决了：

* 多跳遍历
* 属性过滤
* exists / none
* 工作集 alias
* 聚合

相比命令式：

```text
inspect_node
query_neighbors
search_nodes
```

已经大幅减少：

```text
N+1 Tool Call Explosion
```

这是正确方向。

---

但随着真实业务场景出现，新的问题开始暴露。

尤其：

```text
graph_query.aggregate
```

开始导致：

```text
Traversal Engine
  ↓
错误演化为
  ↓
Analytical Engine
```

---

# 2. 核心问题：Traversal ≠ Aggregation

## 2.1 图擅长什么

Graph Database 的优势：

```text
A → B → C → D
```

即：

* 多跳关系
* 局部邻居
* pointer chasing
* index-free adjacency

本质：

```text
Traversal Locality
```

即：

```text
只访问相关局部子图
```

---

## 2.2 图不擅长什么

例如：

```text
SUM(total_amount)
GROUP BY month
```

这是：

```text
Global Scan
```

需要：

* 扫描海量节点
* 连续列访问
* SIMD
* Vectorized Execution

这是：

```text
Columnar Scan
```

属于：

```text
OLAP Engine
```

而不是：

```text
Traversal Engine
```

---

## 2.3 当前 aggregate 的问题

当前：

```json
{
  "match": {
    "type":"OrderDaily"
  },
  "return":{
    "aggregate":{
      "metrics":[
        {
          "field":"total_amount",
          "fn":"sum"
        }
      ]
    }
  }
}
```

看似方便。

但实际上：

* GraphStore 被迫全表扫描
* traversal locality 被破坏
* working set 爆炸
* graph engine 开始承担 OLAP 职责

这是错误方向。

---

# 3. 新设计目标

V2 的核心原则：

| 原则             | 含义                             |
| -------------- | ------------------------------ |
| Agent 负责语义推理   | semantic reasoning / decide what to know next |
| Runtime 负责执行编排 | execution orchestration / decide how to execute efficiently |
| Graph 负责关系收缩   | traversal / semantic narrowing |
| OLAP 负责聚合计算    | scan / group by / metrics      |
| FactStore 负责推理态记忆 | reasoning working memory    |
| Query 是动态演化的   | 支持 replan                      |

核心洞察：

```text
Semantic Planning ≠ Execution Planning

Agent 不应该被 Planner 替代推理
Planner 不应该试图替 Agent 思考
```

因为 LLM 最擅长的是：

* hypothesis forming
* uncertainty handling
* anomaly detection
* causal reasoning
* replanning

这些传统 Planner 做不了。

---

# 4. 新架构总览

```text
                    User Intent
                          │
                          ▼
                ┌──────────────────┐
                │    LLM Agent     │
                │ (Semantic Reason)│
                └────────┬─────────┘
                         │
                         │ tool intent
                         ▼
                ┌──────────────────┐
                │ Runtime          │
                │ Orchestrator     │
                │（执行编排 / 策略）  │
                └────────┬─────────┘
                         │
              ┌──────────┼────────────┐
              ▼          ▼            ▼
        graph_query  compute_query  vector_query
         （Traversal）  （OLAP）       （Semantic Search）
              │          │            │
              ▼          ▼            ▼
         GraphStore  ComputeStore   VectorStore
              │          │            │
              ▼          ▼            ▼
              └──────────┼────────────┘
                         ▼            
                      FactStore
                  （事实 / 中间状态）
```

关键变化：

```text
LLM Agent
   ↓
表达：
"下一步想知道什么"
   ↓
Runtime Orchestrator
   ↓
决定：
"如何高效执行"
```

而不是：

```text
Planner 替 Agent 思考
```

---

# 5. 新的系统模型

V1：

```text
G = {E, R, T, C}
```

V2：

```text
G = {
  E,   // Entities
  R,   // Relations
  T,   // Types
  C,   // Constraints / Rules
  Q    // Query & Compute Layer
}
```

其中：

| 模块            | 职责    |
| ------------- | ----- |
| Agent Layer   | 语义推理  |
| Runtime Layer | 执行编排  |
| Graph Layer   | 关系遍历  |
| Compute Layer | 聚合分析  |
| FactStore     | 推理态记忆 |

---

# 6. 执行模型变化

## 6.1 V1：静态 Query

V1 更接近：

```text
Logical Plan
  ↓
Execute
```

适合：

* SQL
* Cypher
* 固定查询

---

## 6.2 V2：动态推理执行

真实 Agent Runtime：

```text
Observe
  ↓
Plan
  ↓
Execute
  ↓
Observe New Facts
  ↓
Replan
```

即：

```text
Adaptive Reasoning Loop
```

而不是：

```text
Static Query Plan
```

---

# 7. Agent 与 Runtime 的职责边界

## 7.1 为什么"独立 Planner 替 Agent 做规划"不合理

即：

```text
Agent
  ↓
Planner
  ↓
Execution Plan
```

看起来像数据库。

但根本问题：

```text
Planner 不知道真正推理目标
```

例如：

用户：

```text
哪些代理商进件的商户，本月没有交易？
```

Agent 真正的推理过程可能是：

### Step 1

先查：

```text
Agent -> Merch
```

### Step 2

再查：

```text
OrderDaily
```

发现：

```text
90% 商户无交易
```

### Step 3

Agent 突然意识到：

```text
这可能不是"无交易"
而是"新商户"
```

于是新增推理目标：

```text
是否新进件？
```

### Step 4

继续：

```text
Apply
 -> status
 -> created_at
```

关键：

```text
推理目标是动态变化的
```

Planner 不可能提前知道。

---

## 7.2 Reasoning 不应该从 Agent 中剥离

因为 LLM 最擅长的是：

```text
动态语义推理
```

包括：

* hypothesis forming
* uncertainty handling
* anomaly detection
* causal reasoning
* replanning

这些传统 Planner 做不了。

所以：

真正合理的是：

```text
Agent 自己决定下一步"想知道什么"
```

而不是：

```text
Planner 提前决定完整 DAG
```

---

## 7.3 正确模型：Agent 主导推理，Runtime 主导执行

| 模块      | 职责                      |
| ------- | ----------------------- |
| Agent   | semantic reasoning      |
| Runtime | execution orchestration |
| Store   | physical execution      |

即：

```text
LLM Agent
   ↓
表达：
"下一步想知道什么"
   ↓
Runtime Orchestrator
   ↓
决定：
"如何高效执行"
```

---

## 7.4 命名更正

原名 `Reasoning Planner` 容易误解为：

```text
Planner 在做 reasoning
```

但实际上：

真正 reasoning 的是 LLM Agent。

更合理的命名：

| 原名                | 更合理                  |
| ----------------- | -------------------- |
| Reasoning Planner | Runtime Orchestrator |
| Query Planner     | Execution Planner    |
| Planner           | Adaptive Runtime     |

因为 Planner 不应该：

```text
替 Agent 思考
```

它应该：

```text
替 Agent 执行
```

---

## 7.5 Runtime Orchestrator（执行层）

负责：

```text
具体用哪个 backend 执行
```

例如：

| Query Type  | Backend             |
| ----------- | ------------------- |
| Traversal   | Neo4j / GraphStore  |
| Aggregation | ClickHouse / DuckDB |
| Cache       | Redis               |
| Vector      | Milvus / pgvector   |

即：

```text
Logical Intent
  ↓
Physical Execution
```

---

# 8. 新的工具分工

## 8.1 Traversal 工具（Graph）

| Tool            | 职责           |
| --------------- | ------------ |
| inspect_node    | 节点详情         |
| search_nodes    | 类型发现         |
| query_neighbors | 单跳展开         |
| graph_query     | 多跳 traversal |

---

## 8.2 Compute 工具（OLAP）

新增：

```text
compute_query
```

用于：

* sum
* avg
* group by
* window
* ranking
* timeseries

即：

```text
大规模分析
```

不再由 GraphStore 承担。

---

# 9. 两层 Tool 与演进路径

## 9.1 Agent 不应直接输出物理 tool

当前 V6：

```text
Agent
 -> graph_query
 -> compute_query
```

其实还是：

```text
物理执行层 API
```

这会导致：

* Agent 知道太多 backend 细节
* reasoning 与 execution 耦合
* tool explosion

---

## 9.2 未来更合理的是"逻辑意图"

Agent 不再说：

```text
调用 graph_query
```

而是：

```text
我需要：
"找出代理商关联商户"
```

Runtime 再决定：

```text
graph traversal
```

还是：

```text
cache hit
```

还是：

```text
precomputed index
```

---

## 9.3 两层 Tool

### 第一层：Semantic Tool（Agent 可见）

例如：

```text
find_related_entities
aggregate_metrics
search_semantic_knowledge
```

Agent 只表达：

```text
语义意图
```

### 第二层：Physical Tool（Runtime 内部）

Runtime 自己决定：

```text
Neo4j
ClickHouse
Redis
VectorDB
```

---

## 9.4 三阶段演进路径

### Phase 1（现在）

保留：

```text
Agent -> graph_query
Agent -> compute_query
```

但新增：

```text
Runtime Orchestrator
```

负责：

* backend routing
* caching
* execution policy
* working set
* fact injection

即：

```text
Agent 仍然直接调用 tool
但 tool 已经不是直接 backend
```

这是关键：

```text
Tool
  ↓
Runtime Orchestrator
  ↓
Execution Backend
```

### Phase 2

逐渐引入：

```text
semantic tools
```

例如：

```text
find_candidates
aggregate_metric
evaluate_constraint
```

### Phase 3

最终：

```text
Agent 不再知道 graph_query
```

只表达：

```text
semantic goal
```

Runtime 自己：

* graph
* olap
* vector
* cache

自动调度。

---

## 9.5 为什么 Phase 1 不建议一步到位

因为 V6 最大的优势：

```text
透明
```

Agent 直接调用：

```text
graph_query
```

非常容易：

* debug
* trace
* explain
* replay

如果立刻抽象成：

```text
semantic intent
```

会导致 runtime 黑盒化。

---

## 9.6 Phase 1 的核心价值

### 1. backend 解耦

LLM 不知道：

* Neo4j
* ClickHouse
* Redis

### 2. policy 集中化

例如：

* traversal limit
* timeout
* cache
* retry

### 3. FactStore 中央化

所有结果：

```text
统一进入 reasoning memory
```

### 4. future planner 兼容

未来可以慢慢从：

```text
graph_query
```

升级到：

```text
semantic intent
```

而不需要重构 Agent。

---

# 10. graph_query（V2）

## 10.1 定位变化

V1：

```text
Traversal + Aggregation
```

V2：

```text
Traversal Only
```

graph_query：

* 不再负责全局 aggregate
* 不再承担 OLAP
* 不再允许大规模 scan

它的职责：

```text
Semantic Narrowing
```

---

## 10.2 典型场景

### 示例：找出无交易商户

第一步：

```json
{
  "match": {
    "type": "Agent",
    "alias": "agent"
  },
  "traverse": [
    {
      "relation": "binds_merch",
      "targetType": "Merch",
      "alias": "merch"
    }
  ],
  "return": {
    "alias": "merch",
    "fields": ["merch_no", "name"]
  }
}
```

得到：

```text
Candidate Merch Set
```

之后：

```text
compute_query
```

再判断：

```text
哪些没有交易
```

---

# 11. compute_query

## 11.1 定位

新增：

```text
Compute Query DSL
```

专门负责：

```text
OLAP / Aggregation
```

---

## 11.2 设计目标

| 原则                 | 含义      |
| ------------------ | ------- |
| Columnar-first     | 面向列存    |
| Pushdown           | 聚合下推    |
| No Graph Traversal | 不负责关系展开 |
| Large Scale        | 支持海量数据  |

---

## 11.3 接口

```typescript
{
  source: string

  filters?: Filter[]

  metrics: Metric[]

  groupBy?: string[]

  orderBy?: Order[]

  limit?: number
}
```

---

## 11.4 示例

### 本月无交易商户

```json
{
  "source": "OrderDaily",

  "filters": [
    {
      "field": "merch_no",
      "op": "in",
      "value": ["M001", "M002"]
    },
    {
      "field": "report_month",
      "op": "eq",
      "value": "2026-05"
    }
  ],

  "metrics": [
    {
      "field": "*",
      "fn": "count",
      "as": "txn_cnt"
    }
  ],

  "groupBy": ["merch_no"]
}
```

---

# 12. FactStore 与 Runtime State Machine

## 12.1 FactStore 的角色升级

FactStore 不再只是：

```text
属性缓存
```

而是：

```text
Reasoning Working Memory
```

用于：

* 中间事实
* working set
* hypothesis
* uncertainty
* evidence
* partial result

---

## 12.2 PlannerState

进入 Runtime State Machine：

```typescript
interface PlannerState {
  currentGoal: string
  exploredPaths: string[]
  hypotheses: string[]
  workingSetIds: string[]
  failedAttempts: string[]
  observations: string[]
}
```

---

## 12.3 Runtime State Machine

核心不是：

```text
Graph Query DSL
```

而是：

```text
Runtime State Machine
```

包括：

* current goal
* working set
* uncertainty
* evidence
* explored paths
* pending hypotheses
* failed attempts

---

## 12.4 FactStore 实现（伪代码）

```typescript
class FactStore {
  private facts = new Map()

  add(key: string, value: any) {
    this.facts.set(key, value)
  }

  get(key: string) {
    return this.facts.get(key)
  }

  snapshot() {
    return Object.fromEntries(this.facts)
  }
}
```

---

# 13. 动态推理（Replan）

## 13.1 为什么必须支持 Replan

Agent 不可能一开始知道：

```text
完整执行路径
```

例如：

```text
哪些商户没有交易？
```

执行后可能发现：

```text
大量商户异常
```

于是：

Agent 会继续探索：

* 是否冻结
* 是否未激活
* 是否通道关闭
* 是否新进件

因此：

```text
新事实
  ↓
改变推理路径
```

是常态。

---

## 13.2 Runtime Loop

```text
Goal
  ↓
Agent: 下一步想知道什么
  ↓
Runtime: 如何高效执行
  ↓
Execute
  ↓
FactStore Update
  ↓
Agent Observe
  ↓
Replan
```

即：

```text
Agent-driven Adaptive Reasoning Runtime
```

Replan 是 Agent 自然形成的，不是外部 Planner 决定的。

因为：

```text
LLM
  ↓
Observe
  ↓
New Tool Call
```

自然形成 Adaptive Reasoning。

---

# 14. Query Execution Graph

V1：

```text
Query Tree
```

V2：

```text
Dynamic Execution Graph
```

例如：

```text
GraphTraversal
   ↓
ComputeQuery
   ↓
发现异常
   ├── RuleEval
   ├── CacheLookup
   ├── VectorSearch
   └── New GraphTraversal
```

这是：

```text
Self-expanding DAG
```

---

# 15. GraphStore 新职责

## 15.1 V1

GraphStore：

* traversal
* filtering
* aggregate

---

## 15.2 V2

GraphStore 只负责：

```text
Traversal-oriented Access
```

包括：

* getNode
* getNeighbors
* path traversal
* semantic filtering

不再负责：

```text
Global Aggregation
```

---

# 16. ComputeStore

新增：

```text
ComputeStore
```

用于：

* ClickHouse
* DuckDB
* Doris
* StarRocks
* Pinot

负责：

```text
Analytical Execution
```

---

# 17. Phase 1 实现方案（Vercel AI SDK）

## 17.1 核心思想

当前阶段保持：

```text
LLM
 -> graph_query
 -> compute_query
```

因为：

* 易 debug
* 易 trace
* 易 replay
* prompt 简单

但 graph_query 已经不是：

```text
LLM -> Neo4j
```

而是：

```text
LLM
  ↓
Tool
  ↓
Runtime Orchestrator
  ↓
GraphStore / Cache / Policy
```

---

## 17.2 整体架构

Phase 1：

```text
┌────────────────────┐
│      LLM Agent     │
└─────────┬──────────┘
          │
          │ tool call
          ▼
┌────────────────────┐
│ Runtime Orchestrator│
└─────────┬──────────┘
          │
   ┌──────┼────────┐
   ▼      ▼        ▼
Graph   Compute   Cache
Store    Store
```

---

## 17.3 核心职责拆分

| 模块      | 职责                      |
| ------- | ----------------------- |
| LLM     | semantic reasoning      |
| Tool    | logical query interface |
| Runtime | orchestration           |
| Store   | physical execution      |

---

## 17.4 目录结构

```text
/runtime
  orchestrator.ts
  fact-store.ts
  planner-state.ts

/tools
  graph-query.ts
  compute-query.ts

/stores
  graph-store.ts
  compute-store.ts
  cache-store.ts

/agent
  agent.ts
```

---

## 17.5 Runtime Orchestrator（最关键）

这是 Phase 1 真正新增的核心。

```typescript
class RuntimeOrchestrator {

  constructor(
    private graphStore: GraphStore,
    private computeStore: ComputeStore,
    private cacheStore: CacheStore,
    private factStore: FactStore
  ) {}

  async executeGraphQuery(query) {

    // 1. cache check
    const cached = await this.cacheStore.get(query)
    if (cached) return cached

    // 2. policy check
    this.validateTraversalDepth(query)

    // 3. backend execution
    const result = await this.graphStore.query(query)

    // 4. inject into fact store
    this.factStore.add(
      `graph:${Date.now()}`,
      result
    )

    return result
  }

  async executeComputeQuery(query) {
    const result = await this.computeStore.aggregate(query)

    this.factStore.add(
      `compute:${Date.now()}`,
      result
    )

    return result
  }

  validateTraversalDepth(query) {
    if (query.traverse?.length > 5) {
      throw new Error("Traversal too deep")
    }
  }
}
```

---

## 17.6 Graph Tool

Tool 不再直接操作数据库：

```typescript
function createGraphQueryTool(
  runtime: RuntimeOrchestrator
) {

  return tool({

    description:
      "Traverse graph relations",

    parameters: z.object({
      match: z.any(),
      traverse: z.any(),
      return: z.any()
    }),

    execute: async (input) => {
      return runtime.executeGraphQuery(input)
    }
  })
}
```

---

## 17.7 Compute Tool

```typescript
function createComputeTool(
  runtime: RuntimeOrchestrator
) {

  return tool({

    description:
      "Run analytical aggregation",

    parameters: z.object({
      source: z.string(),
      filters: z.any(),
      metrics: z.any(),
      groupBy: z.any()
    }),

    execute: async (input) => {
      return runtime.executeComputeQuery(input)
    }
  })
}
```

---

## 17.8 Agent（Vercel AI SDK）

LLM 仍然直接调用 tools：

```typescript
const result = await generateText({

  model,

  system: `
你是支付领域分析助手。

优先：
1. graph_query 做关系收缩
2. compute_query 做聚合分析
3. 不要对大数据做 graph aggregate
`,

  tools: {
    graph_query: createGraphQueryTool(runtime),
    compute_query: createComputeTool(runtime)
  },

  messages,

  maxSteps: 20
})
```

---

## 17.9 真实执行过程示例

用户：

```text
哪些代理商进件的商户，本月没有交易？
```

### Step 1（LLM）

LLM 输出：

```json
{
  "tool":"graph_query",
  "args":{
    "match":{"type":"Agent"},
    "traverse":[
      {
        "relation":"binds_merch",
        "targetType":"Merch"
      }
    ]
  }
}
```

### Step 2（Runtime）

```text
graph_query
   ↓
RuntimeOrchestrator
   ↓
GraphStore
```

得到：

```json
{"merch_ids":["M001","M002"]}
```

同时 FactStore 更新。

### Step 3（LLM Observe）

LLM 得到 merch_ids，开始下一步推理。

### Step 4（LLM Replan）

LLM 再调用：

```json
{
  "tool":"compute_query",
  "args":{
    "source":"OrderDaily",
    "filters":[
      {"field":"merch_id","op":"in","value":["M001","M002"]}
    ],
    "metrics":[
      {"field":"*","fn":"count"}
    ],
    "groupBy":["merch_id"]
  }
}
```

### Step 5（Runtime）

```text
compute_query
   ↓
Runtime
   ↓
ComputeStore
   ↓
ClickHouse
```

---

## 17.10 generateText(maxSteps) 天然形成 Adaptive Reasoning Loop

因为：

```typescript
generateText({
  tools,
  maxSteps
})
```

本身就是：

```text
Observe
 -> Tool Call
   -> Observe Result
     -> Replan
```

循环。

V6 原本：

```text
LLM
 -> Tool
   -> DB
```

V2 Phase1：

```text
LLM
 -> Tool
   -> Runtime
      -> Backend
```

这是本质变化。

最终：

```text
User Intent
   ↓
Reasoning Planner
   ↓
graph_query
   ↓
缩小候选集合
   ↓
compute_query
   ↓
OLAP 聚合
   ↓
FactStore 更新
   ↓
Replan
   ↓
下一步推理
```

即：

```text
Graph for narrowing
OLAP for aggregation
Agent for orchestration
```

---

# 18. 最终执行链

最终：

```text
User Intent
   ↓
LLM Agent（语义推理）
   ↓
Semantic Intent / Tool Call
   ↓
Runtime Orchestrator（执行编排）
   ↓
graph_query
   ↓
缩小候选集合
   ↓
compute_query
   ↓
OLAP 聚合
   ↓
FactStore 更新
   ↓
Agent Observe
   ↓
Replan
   ↓
下一步推理
```

即：

```text
Agent for reasoning
Runtime for orchestration
Graph for narrowing
OLAP for aggregation
```

---

# 19. 与传统 Graph 系统的区别

| 传统图库               | V2 Runtime                |
| ------------------ | ------------------------- |
| 图即数据库              | 图只是关系层                    |
| 静态 Query           | Agent 驱动动态推理              |
| 一次执行               | 持续 Replan                 |
| Traversal-only     | Federated Runtime         |
| 无 reasoning memory | FactStore + PlannerState  |
| Cypher-oriented    | Agent-oriented            |
| Planner 做推理        | Agent 做推理，Runtime 做执行     |

---

# 20. 最终定位

V2 不再是：

```text
Graph Query Engine
```

而是：

```text
Agent-driven Adaptive Reasoning Runtime
```

它的核心目标：

不是：

```text
让 Graph 什么都做
```

也不是：

```text
让 Planner 替 Agent 思考
```

而是：

```text
Agent 负责语义推理
Runtime 负责执行编排
让不同系统各自发挥最擅长的能力
```

即：

```text
LLM Agent
负责：
"下一步想知道什么"

Runtime Orchestrator
负责：
"怎样最高效地得到答案"
```

这才是 Adaptive Reasoning Runtime 的正确边界。
