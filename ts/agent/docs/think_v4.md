# V4：推倒重来 — 让框架做它擅长的事

## 一、V3 的根本问题

V3 的所有 bug 都指向同一个架构错误：**手动重写了 AI SDK 已经完美解决的 tool-calling loop**。

| V3 手动实现 | AI SDK 原生能力 |
|-------------|----------------|
| `loop.ts` 手写 for 循环 | `generateText({ maxSteps })` 自动多轮 |
| `NextAction` 自定义 JSON 原语 | `tool()` 原生 tool calling |
| `Validator` 手动校验 | Zod schema 在 tool 定义层自动校验 |
| `Executor` 手动分发 | tool 的 `execute` 函数直接执行 |
| `AgentState` 黑板 + 单条 `lastObservation` | AI SDK 自动维护完整对话历史（tool call + tool result） |
| `llm.ts` 的 `stepCountIs(1)` 强制单步 | `maxSteps` 允许模型自主决定何时停止 |
| Prompt 里塞 `from_state` 规则 | 不需要 — LLM 看到前几轮 tool result，直接引用数据 |

**V3 本质上是用 TypeScript 重新发明了一个残缺版的 tool-calling runtime。**

LLM 陷入死循环（重复 `read_node("person_1")`）的原因不是黑板不够好，而是**每轮只传 `lastObservation`，LLM 根本看不到自己的历史**。AI SDK 的多轮 tool calling 会自动把 `tool_call → tool_result` 全链路保留在 messages 里，LLM 天然知道自己做过什么。

---

## 二、V4 设计哲学

### 一句话

> **图操作变成 AI SDK Tools，推理循环交给 `maxSteps`，Runtime 只负责图和装饰器。**

### 三条原则

1. **不重新发明轮子** — AI SDK 的 `generateText + maxSteps + tool()` 就是一个成熟的 Agent loop，不再手写
2. **Tool = 图的投影** — 每个图操作（读节点、查邻居、调方法）都是一个标准 AI SDK tool，Zod schema 自动保证类型安全
3. **对话历史 = 工作记忆** — AI SDK 自动维护 `[user, assistant(tool_call), tool(result), assistant(tool_call), ...]` 链，LLM 天然拥有完整上下文，不需要手动管理 `lastObservation` 或 `AgentState`

---

## 三、架构对比

```text
V3 数据流（6 个自定义组件，手动闭环）：

  Prompt ──→ LLM ──→ JSON(NextAction)
    ↑                       │
    │                  Validator
    │                       │
    │                  Executor
    │                       │
    └── lastObservation ←───┘
        (单条，会丢失历史)


V4 数据流（AI SDK 原生闭环）：

  System Prompt ──→ generateText({ maxSteps, tools })
                          │
                    ┌─────┴─────┐
                    │  AI SDK   │ ← 自动管理 messages[]
                    │  内部循环  │ ← tool_call → execute → tool_result → 下一轮
                    └─────┬─────┘
                          │
                    tools: {
                      inspect_node,    ← graph.getNode + getProperties + edges
                      query_neighbors, ← graph.traverse (双向)
                      call_method,     ← @agentMethod 注册的方法
                    }
```

---

## 四、文件结构

```text
demo/
├── runtime/
│   ├── types.ts          ← 精简：只保留 Edge, NodeId
│   ├── registry.ts       ← 不变
│   ├── decorator.ts      ← 不变
│   └── graph.ts          ← 增强：双向边查询
├── agent/
│   ├── tools.ts          ← 新建：图操作 → AI SDK tools
│   ├── prompt.ts         ← 重写：只做图概览，不再注入动态状态
│   └── run.ts            ← 新建：单次 generateText 调用
├── data/
│   └── seed.ts           ← 不变
└── index.ts              ← 大幅简化
```

### 删除的文件（7 个 → 0）

| 文件 | 删除原因 |
|------|----------|
| `runtime/executor.ts` | tool 的 `execute` 函数直接替代 |
| `runtime/validator.ts` | Zod schema + AI SDK tool validation 替代 |
| `runtime/state.ts` | AI SDK 对话历史替代 AgentState |
| `agent/loop.ts` | `maxSteps` 替代手写循环 |
| `agent/llm.ts` | 合并到 `run.ts` |
| `agent/llm_mock.ts` | 不再需要 mock — 直接测真实 LLM |

---

## 五、每个文件的完整设计

### 1. `runtime/types.ts` — 精简

```ts
export type NodeId = string;

export type Edge = {
  from: NodeId;
  to: NodeId;
  type: string;
};
```

删除 `NextAction`、`Observation` — 这些概念被 AI SDK 的 tool call/result 原生替代。

---

### 2. `runtime/graph.ts` — 增强双向边查询

```ts
import { AgentPropertyRegistry, type MethodSchema } from "./registry";
import type { Edge } from "./types";

export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }

  abstract getCapabilities(): MethodSchema[];

  getProperties(): Record<string, any> {
    const className = this.constructor.name;
    const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className);
    const result: Record<string, any> = {};
    for (const schema of propSchemas) {
      result[schema.propertyName] = (this as any)[schema.propertyName];
    }
    return result;
  }
}

export class Graph {
  nodes = new Map<string, BaseNode>();
  edges: Edge[] = [];

  addNode(node: BaseNode) { this.nodes.set(node.id, node); }
  addEdge(edge: Edge) { this.edges.push(edge); }
  getNode(id: string) { return this.nodes.get(id); }

  // 出边：from → to
  getOutEdges(nodeId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const e of this.edges) {
      if (e.from === nodeId) {
        (result[e.type] ??= []).push(e.to);
      }
    }
    return result;
  }

  // 入边：to ← from
  getInEdges(nodeId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const e of this.edges) {
      if (e.to === nodeId) {
        (result[e.type] ??= []).push(e.from);
      }
    }
    return result;
  }

  // 按关系和方向查询邻居
  queryNeighbors(
    nodeId: string,
    relation?: string,
    direction: "out" | "in" | "both" = "both",
  ): Array<{ nodeId: string; type: string; relation: string; direction: "out" | "in" }> {
    const results: Array<{ nodeId: string; type: string; relation: string; direction: "out" | "in" }> = [];

    if (direction === "out" || direction === "both") {
      for (const e of this.edges) {
        if (e.from === nodeId && (!relation || e.type === relation)) {
          const target = this.nodes.get(e.to);
          results.push({
            nodeId: e.to,
            type: target?.constructor.name ?? "Unknown",
            relation: e.type,
            direction: "out",
          });
        }
      }
    }

    if (direction === "in" || direction === "both") {
      for (const e of this.edges) {
        if (e.to === nodeId && (!relation || e.type === relation)) {
          const source = this.nodes.get(e.from);
          results.push({
            nodeId: e.from,
            type: source?.constructor.name ?? "Unknown",
            relation: e.type,
            direction: "in",
          });
        }
      }
    }

    return results;
  }
}
```

关键改进：
- `getOutEdges` / `getInEdges` 分别返回出边和入边
- `queryNeighbors` 支持按关系过滤、双向查询，返回结构化结果

---

### 3. `agent/tools.ts` — 图操作 → AI SDK Tools（核心重写）

```ts
import { tool } from "ai";
import { z } from "zod";
import { AgentMethodRegistry } from "../runtime/registry";
import type { Graph } from "../runtime/graph";

export function createGraphTools(graph: Graph) {
  // ────────── Tool 1: inspect_node ──────────
  // 一次性返回节点的全部可见信息：类型、属性、出入边、可用方法
  const inspect_node = tool({
    description:
      "Inspect a node to see its type, properties, connections (both outgoing and incoming edges), and available methods. Use this to explore the graph.",
    parameters: z.object({
      nodeId: z.string().describe("The ID of the node to inspect"),
    }),
    execute: async ({ nodeId }) => {
      const node = graph.getNode(nodeId);
      if (!node) return { error: `Node '${nodeId}' not found` };

      const className = node.constructor.name;
      const properties = node.getProperties();
      const outEdges = graph.getOutEdges(nodeId);
      const inEdges = graph.getInEdges(nodeId);
      const methods = node.getCapabilities().map((m) => ({
        name: m.methodName,
        description: m.description,
        params: m.returns, // 简化：给 LLM 看返回值描述
      }));

      return { type: className, properties, outEdges, inEdges, methods };
    },
  });

  // ────────── Tool 2: query_neighbors ──────────
  // 按关系类型查询邻居，支持方向过滤
  const query_neighbors = tool({
    description:
      "Query neighbors of a node, optionally filtering by relation type and direction. Returns neighbor details including their type.",
    parameters: z.object({
      nodeId: z.string().describe("The starting node ID"),
      relation: z.string().optional().describe("Filter by edge relation type (e.g. 'involved_in', 'depends_on')"),
      direction: z
        .enum(["out", "in", "both"])
        .default("both")
        .describe("Edge direction: 'out' for outgoing, 'in' for incoming, 'both' for all"),
    }),
    execute: async ({ nodeId, relation, direction }) => {
      if (!graph.getNode(nodeId)) return { error: `Node '${nodeId}' not found` };
      const neighbors = graph.queryNeighbors(nodeId, relation, direction);
      if (neighbors.length === 0) {
        return { neighbors: [], message: `No neighbors found for '${nodeId}'${relation ? ` with relation '${relation}'` : ""}` };
      }
      return { neighbors };
    },
  });

  // ────────── Tool 3: call_method ──────────
  // 调用 @agentMethod 注册的方法，Runtime 自动做 Zod 校验
  const call_method = tool({
    description:
      "Call a registered method on a graph node. The method must be decorated with @agentMethod. Args are validated against the method's schema.",
    parameters: z.object({
      nodeId: z.string().describe("The node to call the method on"),
      method: z.string().describe("The method name to call"),
      args: z.record(z.any()).default({}).describe("Arguments to pass to the method"),
    }),
    execute: async ({ nodeId, method, args }) => {
      const node = graph.getNode(nodeId);
      if (!node) return { error: `Node '${nodeId}' not found` };

      const className = node.constructor.name;
      const schema = AgentMethodRegistry.get(className, method);
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName);
        return {
          error: `Method '${method}' not found on ${className}. Available: [${available.join(", ")}]`,
        };
      }

      // Zod 校验参数
      const parseResult = schema.params.safeParse(args);
      if (!parseResult.success) {
        return {
          error: `Invalid args for ${method}: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
          expected: schema.description,
        };
      }

      const fn = (node as any)[method];
      if (typeof fn !== "function") return { error: `${method} is not a function` };

      const parsed = parseResult.data;
      const result =
        typeof parsed === "object" && parsed !== null
          ? fn.apply(node, Object.values(parsed))
          : fn.call(node, parsed);

      return { result };
    },
  });

  return { inspect_node, query_neighbors, call_method };
}
```

**关键设计决策**：

1. **三个 tool 覆盖 V3 的五个 op** — `inspect_node`（= `read_node`）、`query_neighbors`（= `traverse`）、`call_method`（= `call`）。`update_state` 和 `stop` 不再需要。
2. **错误作为返回值而非异常** — tool 的 `execute` 返回 `{ error: ... }` 而不是 throw。AI SDK 会把这个 error 作为 tool result 传回给 LLM，LLM 自然会修正。
3. **`call_method` 内部做 Zod 校验** — 如果参数不对，返回友好的错误信息+期望的参数格式，LLM 可以在下一轮修正。
4. **`inspect_node` 返回双向边** — V3 只返回出边，导致 LLM 无法反向查询。

---

### 4. `agent/prompt.ts` — 极致精简

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { AgentPropertyRegistry } from "../runtime/registry";
import type { Graph } from "../runtime/graph";

export function buildSystemPrompt(goal: string, graph: Graph): string {
  // 节点目录：ID + 类型 + 属性名列表
  const nodeLines: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    const className = node.constructor.name;
    const props = AgentPropertyRegistry.getPropertiesForClass(className);
    const propNames = props.map((p) => p.propertyName).join(", ");
    const methods = node.getCapabilities().map((m) => {
      const paramsSchema = zodToJsonSchema(m.params) as any;
      const paramsStr = JSON.stringify(paramsSchema.properties ?? {});
      return `${m.methodName}(${paramsStr}) → ${m.returns}`;
    });
    const methodStr = methods.length > 0 ? `\n    methods: [${methods.join(", ")}]` : "";
    nodeLines.push(`  - ${nodeId} (${className}) props: [${propNames}]${methodStr}`);
  }

  // 边类型目录
  const edgeTypes = new Set(graph.edges.map((e) => e.type));

  return `You are a graph reasoning agent. You explore a semantic graph to answer questions.

GOAL: ${goal}

GRAPH OVERVIEW:
Nodes:
${nodeLines.join("\n")}

Edge types: [${[...edgeTypes].join(", ")}]

STRATEGY:
1. Start by inspecting the target node to understand its connections
2. Follow edges to discover related nodes and gather data
3. When you have enough information, call the appropriate method to compute the answer
4. Provide your final conclusion as a text response

You have 3 tools: inspect_node, query_neighbors, call_method.
Use inspect_node to read a node's properties, edges, and available methods.
Use query_neighbors to find connected nodes by relation type and direction.
Use call_method to invoke computation methods on nodes.`;
}
```

**对比 V3 的 prompt.ts**：
- V3: 133 行，注入 4 个动态 block（Capabilities + Properties + Topology + Blackboard）+ 复杂 RULES
- V4: ~40 行，只有一个静态的图概览。动态数据通过 tool calling 按需获取。

为什么可以这么简？因为：
1. **属性值不需要预注入** — LLM 通过 `inspect_node` 按需读取
2. **完整拓扑不需要预注入** — LLM 通过 `query_neighbors` 按需探索
3. **黑板不需要** — AI SDK 的对话历史就是记忆
4. **RULES 不需要** — tool 的 `description` 已经说清了用法
5. **动作格式不需要说明** — AI SDK 的 tool calling 协议自动处理

---

### 5. `agent/run.ts` — 单次调用，替代整个 loop

```ts
import { generateText } from "ai";
import { model } from "../../lib/model";
import type { Graph } from "../runtime/graph";
import { createGraphTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

export async function runAgent(goal: string, graph: Graph) {
  const tools = createGraphTools(graph);
  const systemPrompt = buildSystemPrompt(goal, graph);

  console.log("=== Agent Start ===");
  console.log("Goal:", goal);
  console.log("System Prompt:\n", systemPrompt);
  console.log("===================\n");

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: goal,
    tools,
    maxSteps: 15,
    onStepFinish: ({ toolCalls, toolResults, text, stepType }) => {
      // 每一步完成时的回调，用于调试和观察推理过程
      if (stepType === "initial" || stepType === "continue") {
        if (text) console.log("💭 THOUGHT:", text);
      }
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          console.log(`🔧 TOOL: ${tc.toolName}(${JSON.stringify(tc.args)})`);
        }
      }
      if (toolResults && toolResults.length > 0) {
        for (const tr of toolResults) {
          console.log(`📋 RESULT:`, JSON.stringify(tr.result, null, 2));
        }
      }
      console.log("---");
    },
  });

  console.log("\n=== Agent Done ===");
  console.log("Final answer:", result.text);
  console.log(`Steps: ${result.steps.length}`);
  console.log(`Tokens: ${result.usage.totalTokens}`);

  return {
    answer: result.text,
    steps: result.steps,
    usage: result.usage,
  };
}
```

**对比 V3 的 loop.ts + llm.ts**：
- V3: 65 + 129 = 194 行，手写循环 + 手写 LLM 调用 + 手写 JSON Schema + Mock 模式
- V4: ~55 行，一次 `generateText` 调用搞定一切

**关键特性**：

1. **`maxSteps: 15`** — AI SDK 自动管理多轮 tool calling，LLM 自主决定何时停止（不再需要 `stop` op）
2. **`onStepFinish`** — 每步回调，提供完整的调试日志，比 V3 的 `console.log` 更结构化
3. **`result.steps`** — AI SDK 返回完整的步骤链，包含每一轮的 tool call、tool result、LLM 文本，天然可审计
4. **`result.usage`** — Token 使用统计，V3 完全没有这个

---

### 6. `index.ts` — 极致简化

```ts
import { runAgent } from "./agent/run";
import { seedGraph } from "./data/seed";

async function main() {
  const graph = seedGraph();

  const result = await runAgent(
    "Assess project risk for project_1. Gather workload data from all team members, then call the risk evaluation method.",
    graph,
  );

  console.log("\n📊 Final Result:", result.answer);
}

main();
```

**对比 V3 的 index.ts**：
- V3: 30 行，需要手动创建 `AgentState`、`Executor`、`Validator`，然后传入 5 个参数
- V4: ~15 行，只需要 `graph` 和 `goal`

---

## 六、完整推理链演示（预期）

用 `seed.ts` 的简单场景（2 个 Person + 1 个 Project）：

```
=== Agent Start ===
Goal: Assess project risk for project_1

💭 THOUGHT: I need to first understand project_1 and find its team members.

🔧 TOOL: inspect_node({"nodeId": "project_1"})
📋 RESULT: {
  "type": "Project",
  "properties": {},
  "outEdges": {},
  "inEdges": { "involved_in": ["person_1", "person_2"] },
  "methods": [{ "name": "checkRiskStatus", "description": "Checks risk..." }]
}
---

💭 THOUGHT: project_1 has two team members. Let me check their workloads.

🔧 TOOL: inspect_node({"nodeId": "person_1"})
📋 RESULT: {
  "type": "Person",
  "properties": { "workload": 60 },
  "outEdges": { "involved_in": ["project_1"] },
  "inEdges": {},
  "methods": []
}
---

🔧 TOOL: inspect_node({"nodeId": "person_2"})
📋 RESULT: {
  "type": "Person",
  "properties": { "workload": 70 },
  "outEdges": { "involved_in": ["project_1"] },
  "inEdges": {},
  "methods": []
}
---

💭 THOUGHT: Total team load = 60 + 70 = 130. Let me call checkRiskStatus.

🔧 TOOL: call_method({"nodeId": "project_1", "method": "checkRiskStatus", "args": {"teamLoad": 130}})
📋 RESULT: { "result": { "risk": "HIGH" } }
---

=== Agent Done ===
Final answer: Project project_1 has HIGH risk. The total team workload
is 130 hours (person_1: 60h, person_2: 70h), which exceeds the safe
threshold. Combined with deadline pressure, the risk assessment is HIGH.

Steps: 5
Tokens: ~1200
```

**对比 V3 运行日志的关键差异**：

| 维度 | V3 实际运行 | V4 预期运行 |
|------|-------------|-------------|
| 重复操作 | `read_node("person_1")` 执行了 2 次 | 不会重复 — AI SDK 保留了完整历史 |
| 畸形 JSON | Loop 3 缺少 `op` 字段 | 不可能 — tool calling 协议保证结构 |
| 错误恢复 | Validation error 后直接 break | AI SDK 把 error 作为 tool result 返回，LLM 自动重试 |
| 最终输出 | 依赖 `stop { reason }` | LLM 自然生成文本结论 |
| 黑板维护 | LLM 需要手动 `update_state` | 不需要 — LLM 在对话中自然记忆 |
| 调试信息 | `console.log` 散落各处 | `onStepFinish` 统一回调 |

---

## 七、V3 → V4 删除/保留清单

### 保留（4 个文件，基本不改）

| 文件 | 原因 |
|------|------|
| `runtime/types.ts` | 精简后保留 Edge, NodeId |
| `runtime/registry.ts` | 核心基础设施，不变 |
| `runtime/decorator.ts` | 核心基础设施，不变 |
| `data/seed.ts` | 业务数据，不变 |

### 增强（1 个文件）

| 文件 | 改动 |
|------|------|
| `runtime/graph.ts` | 新增 `getOutEdges`, `getInEdges`, `queryNeighbors` |

### 新建（2 个文件）

| 文件 | 职责 |
|------|------|
| `agent/tools.ts` | 图操作 → AI SDK tools |
| `agent/run.ts` | 单次 `generateText` 调用 |

### 重写（1 个文件）

| 文件 | 改动 |
|------|------|
| `agent/prompt.ts` | 133 行 → ~40 行，只做图概览 |

### 删除（6 个文件）

| 文件 | 原因 |
|------|------|
| `runtime/executor.ts` | 被 `tools.ts` 的 `execute` 替代 |
| `runtime/validator.ts` | 被 AI SDK 的 Zod 校验 + tool error 替代 |
| `runtime/state.ts` | 被 AI SDK 对话历史替代 |
| `agent/loop.ts` | 被 `maxSteps` 替代 |
| `agent/llm.ts` | 合并到 `run.ts` |
| `agent/llm_mock.ts` | 不再需要 |

**净变化**：13 个源文件 → 8 个源文件，总代码量减少约 60%。

---

## 八、关键设计决策

### 决策 1：不要黑板，用对话历史

**理由**：V3 引入 `AgentState` 的动机是"防止 Context 爆炸"。但 V3 的 Context 爆炸是**手写 loop 只传 `lastObservation` 的设计缺陷**，不是 LLM 对话历史本身的问题。AI SDK 的 tool calling 对话链是高效的：每轮只有 tool_call（几十 token）+ tool_result（几十到几百 token）。对于 10-15 步的推理链，总 token 消耗在可控范围内。

**保留口子**：如果未来图规模扩大到需要 30+ 步推理，可以加一个 `scratchpad` tool（轻量级黑板），让 LLM 主动记录中间结果。但目前不需要。

### 决策 2：三个通用 tool 而非每个方法一个 tool

有两种方案：
- A：每个 `@agentMethod` 生成一个独立 tool（如 `project_1_checkRiskStatus`）
- B：一个通用 `call_method` tool，内部按 nodeId + method 分发

选 B，原因：
1. 图节点数量可能很多，每个方法一个 tool 会导致 tool 列表爆炸
2. 通用 `call_method` 可以在 `execute` 内部做精确的 Zod 校验，错误信息直接返回给 LLM
3. LLM 从 `inspect_node` 的返回值中已经能看到每个节点有哪些方法，不需要在 tool 列表中重复

### 决策 3：双向边查询作为默认行为

V3 的 `read_node` 只返回出边，导致 LLM 无法执行"谁参与了这个项目"这类反向查询。V4 的 `inspect_node` 同时返回 `outEdges` 和 `inEdges`，`query_neighbors` 支持 `direction` 参数。

这是语义图推理的基本需求。在知识图谱中，一条边 `A --involved_in--> B` 同时意味着 "A 参与了 B" 和 "B 有参与者 A"。单向查询会丢失一半信息。

### 决策 4：Prompt 只给目录，不给详情

V3 的 prompt 把所有节点的属性值、完整的边列表、可用方法签名全部注入。这意味着：
1. Prompt 随图规模线性增长
2. 大量信息 LLM 可能用不到（比如 person_1 的 workload，如果 LLM 只关心 person_2）
3. 信息重复 — `read_node` 也会返回这些属性

V4 的 prompt 只给"目录"级别的信息：
- 节点有哪些（ID + 类型 + 属性名列表，不含值）
- 有哪些边类型
- 有哪些可用方法（签名）

具体数据通过 `inspect_node` 按需获取。这保持了 Prompt 的精简性，同时不影响 LLM 的规划能力。

### 决策 5：Tool error 替代 Validator

V3 有一个独立的 `Validator` 类，在 `Executor` 之前做预校验。V4 把校验逻辑内联到 tool 的 `execute` 函数中：
- 节点不存在？`return { error: "Node 'xxx' not found" }`
- 方法不存在？`return { error: "Method 'xxx' not found on YYY. Available: [...]" }`
- 参数不对？`return { error: "Invalid args for xxx: ..." }`

这些 error 会作为 tool result 返回给 LLM，LLM 在下一轮自然会修正。不需要独立的 Validator 层，也不需要手动的"连续错误计数器"。

---

## 九、风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| LLM 在 tool calling 中仍然犯错 | 低 | AI SDK 的 tool schema 保证结构；错误通过 tool result 自然修正 |
| 对话历史太长（30+ 步） | 中 | `maxSteps: 15` 限制；未来可加 `scratchpad` tool |
| `call_method` 的参数 Zod 校验在 tool schema 层不够精确 | 中 | `execute` 内部做精确校验，错误信息返回给 LLM |
| 某些 LLM 不支持 tool calling | 低 | Vercel AI SDK 已适配主流 provider |
| `zodToJsonSchema` 转换在 prompt 中仍可能丢失 properties | 低 | V4 的 prompt 只做概览，详细 schema 在 tool error 中返回 |

---

## 十、扩展路径

### 短期（V4.1）

1. **`scratchpad` tool** — 如果对话历史过长，加一个轻量级笔记本工具
2. **并行 tool calling** — AI SDK 支持一次调用多个 tool，LLM 可以同时 inspect 多个节点
3. **`seed_v3.ts` 切换** — 用更复杂的组织图验证 V4 在复杂场景下的表现

### 中期（V4.2）

1. **Streaming** — 用 `streamText` 替代 `generateText`，实时输出推理过程
2. **Tool result 压缩** — 对大型 tool result 做摘要，减少 token 消耗
3. **图变更通知** — 如果图在推理过程中被修改，通知 LLM

### 长期（V5）

1. **多 Agent 协作** — 不同 Agent 负责图的不同子区域
2. **学习与缓存** — 缓存常见的推理路径，避免重复探索
3. **图规模扩展** — 当节点数 > 1000 时，Prompt 中的"目录"也会过大，需要引入分层摘要

---

## 十一、总结

V4 的核心洞察：

> **V3 花了 600+ 行代码手写了一个 AI SDK 已经内置的 tool-calling agent loop，然后又花了 300 行文档解释为什么手写的版本出了 bug。**

V4 的答案很简单：

1. 把 `read_node` / `traverse` / `call` / `update_state` / `stop` 变成 `inspect_node` / `query_neighbors` / `call_method`
2. 把 `loop.ts` + `llm.ts` + `executor.ts` + `validator.ts` + `state.ts` 替换成一次 `generateText({ maxSteps, tools })`
3. 代码减少 60%，能力增强（双向边、自动错误恢复、完整推理链审计）

**图结构提供空间上的广度，对话历史提供时间上的记忆，AI SDK 负责把两者串起来。**
