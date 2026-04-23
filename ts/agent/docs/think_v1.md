
基于语义层(语义图)的 LLM Agent 推理

# 目标

- 现代的 Agent 基于语义层(图)的推理框架 = **图（结构，语义层） + 规则（确定性） + LLM（概率推理） + 约束（防胡乱）**
- 而不是“纯知识图谱”或“纯 OWL”。

# 最小可验证原型

## 一、整体结构

```text
demo/
├── runtime/
│   ├── types.ts
│   ├── graph.ts
│   ├── executor.ts
│   └── validator.ts
├── agent/
│   ├── prompt.ts
│   └── loop.ts
├── data/
│   └── seed.ts
└── index.ts
```

## 二、Runtime 层（真正执行）

## 1️⃣ types.ts（核心协议）

```ts
export type NodeId = string;

export type Edge = {
  from: NodeId;
  to: NodeId;
  type: string;
};

export type NextAction =
  | { op: "traverse"; from: NodeId; relation: string }
  | { op: "call"; node: NodeId; method: string; args?: any }
  | { op: "stop"; reason: string };

export type Observation = {
  success: boolean;
  data?: any;
  error?: string;
};
```

## 2️⃣ graph.ts（图 + 节点）

```ts
export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class Graph {
  nodes = new Map<string, BaseNode>();
  edges: Edge[] = [];

  addNode(node: BaseNode) {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: Edge) {
    this.edges.push(edge);
  }

  getNode(id: string) {
    return this.nodes.get(id);
  }

  traverse(from: string, relation: string): string[] {
    return this.edges
      .filter(e => e.from === from && e.type === relation)
      .map(e => e.to);
  }
}
```

---

## 3️⃣ executor.ts（执行引擎）

```ts
import { Graph } from "./graph";
import { NextAction, Observation } from "./types";

export class Executor {
  constructor(private graph: Graph) {}

  execute(action: NextAction): Observation {
    try {
      if (action.op === "traverse") {
        const result = this.graph.traverse(action.from, action.relation);
        return { success: true, data: result };
      }

      if (action.op === "call") {
        const node = this.graph.getNode(action.node);
        if (!node) throw new Error("Node not found");

        const fn = (node as any)[action.method];
        if (typeof fn !== "function") {
          throw new Error("Invalid method");
        }

        const result = fn.call(node, action.args);
        return { success: true, data: result };
      }

      if (action.op === "stop") {
        return { success: true, data: action.reason };
      }

      return { success: false, error: "Unknown op" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
```

---

## 4️⃣ validator.ts（防幻觉）

```ts
import { NextAction } from "./types";
import { Graph } from "./graph";

export class Validator {
  constructor(private graph: Graph) {}

  validate(action: NextAction): boolean {
    if (action.op === "traverse") {
      return this.graph.getNode(action.from) !== undefined;
    }

    if (action.op === "call") {
      const node = this.graph.getNode(action.node);
      return node && typeof (node as any)[action.method] === "function";
    }

    return true;
  }
}
```

---

# 🧠 三、Agent 层（LLM 控制）

## 1️⃣ prompt.ts（核心约束）

```ts
export function buildPrompt(goal: string, history: any[]): string {
  return `
You are a reasoning agent.

GOAL:
${goal}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore
- If confident → stop

Available actions:
1. traverse { from, relation }
2. call { node, method }
3. stop { reason }

History:
${JSON.stringify(history, null, 2)}

Respond ONLY JSON:
`;
}
```

---

## 2️⃣ loop.ts（Agent Loop）

```ts
import { Executor } from "../runtime/executor";
import { Validator } from "../runtime/validator";
import { NextAction } from "../runtime/types";
import { buildPrompt } from "./prompt";

// ⚠️ 这里你替换成真实 LLM（Claude / OpenAI）
async function callLLM(prompt: string): Promise<NextAction> {
  console.log("\nPROMPT:\n", prompt);

  // 👉 Demo: 伪造一个简单策略（你可以替换为真实 API）
  return { op: "stop", reason: "Demo finished" };
}

export async function runAgentLoop(
  goal: string,
  executor: Executor,
  validator: Validator
) {
  const history: any[] = [];

  for (let step = 0; step < 6; step++) {
    const prompt = buildPrompt(goal, history);

    const action = await callLLM(prompt);

    console.log("ACTION:", action);

    if (!validator.validate(action)) {
      console.log("❌ Invalid action");
      break;
    }

    const obs = executor.execute(action);

    console.log("OBS:", obs);

    history.push({ action, obs });

    if (action.op === "stop") {
      console.log("✅ DONE:", obs.data);
      break;
    }
  }
}
```

---

# 🌱 四、数据初始化

## data/seed.ts

```ts
import { Graph } from "../runtime/graph";

export class Person extends BaseNode {
  workload: number;

  constructor(id: string, workload: number) {
    super(id);
    this.workload = workload;
  }

  getWorkload() {
    return this.workload;
  }
}

export class Project extends BaseNode {
  deadlineRisk: number;

  constructor(id: string, deadlineRisk: number) {
    super(id);
    this.deadlineRisk = deadlineRisk;
  }

  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) {
      return { risk: "HIGH" };
    }
    return { risk: "LOW" };
  }
}

export function seedGraph(): Graph {
  const g = new Graph();

  const p1 = new Person("person_1", 60);
  const p2 = new Person("person_2", 70);

  const project = new Project("project_1", 0.8);

  g.addNode(p1);
  g.addNode(p2);
  g.addNode(project);

  g.addEdge({ from: "person_1", to: "project_1", type: "involved_in" });
  g.addEdge({ from: "person_2", to: "project_1", type: "involved_in" });

  return g;
}
```

---

# 🚀 五、入口

## index.ts

```ts
import { seedGraph } from "./data/seed";
import { Executor } from "./runtime/executor";
import { Validator } from "./runtime/validator";
import { runAgentLoop } from "./agent/loop";

async function main() {
  const graph = seedGraph();

  const executor = new Executor(graph);
  const validator = new Validator(graph);

  await runAgentLoop(
    "Assess project risk for project_1",
    executor,
    validator
  );
}

main();
```

---

# 🔥 六、你下一步要做的（关键）

现在这个 Demo **能跑，但还没“智能”**，你要补三件事：

---

## 1️⃣ 接入真实 LLM（Claude / OpenAI）

把：

```ts
async function callLLM(...)
```

换成真实 API：

* Claude Code SDK
* 或 OpenAI function calling

---

## 2️⃣ 强制 JSON 输出（很关键）

否则会炸：

```text
Respond ONLY valid JSON. No explanation.
```

---

## 3️⃣ 加一个“状态累积变量”（核心升级）

现在缺：

👉 team workload 汇总

你可以加：

```ts
historyState = {
  teamLoad: number
}
```

让 LLM：

* call getWorkload
* accumulate
* 再 call checkRisk

---

# 🧨 最后说一句实话（很关键）

这个 Demo 做完后，你会第一次清晰看到：

> ✔ LLM 不再“直接回答问题”
> ✔ 而是在“操作系统上跑推理程序”

