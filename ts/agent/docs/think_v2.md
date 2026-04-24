
基于语义层(语义图)的 LLM Agent 推理 — V2：Schema Discovery

# 目标

- V2 在 V1 的基础上解决**内省能力缺失 (Introspection Gap)**
- LLM 在运行时能看到：图中每个节点有哪些可调用方法、参数 schema、返回类型
- 等式升级为：**图（结构） + Schema（内省） + 规则（确定性） + LLM（概率推理） + 约束（防幻觉）**

# 最小可验证原型

## 一、整体结构

```text
demo/
├── runtime/
│   ├── types.ts        ← 不变
│   ├── registry.ts     ← 新增：Schema 注册表
│   ├── decorator.ts    ← 新增：@agentMethod 装饰器
│   ├── graph.ts        ← 改造：BaseNode 增加 getCapabilities()
│   ├── executor.ts     ← 改造：通过 registry 验证并解析参数
│   └── validator.ts    ← 改造：返回 ValidationResult，校验参数
├── agent/
│   ├── prompt.ts       ← 改造：插入 AVAILABLE CAPABILITIES block
│   └── loop.ts         ← 改造：传入 graph，使用 ValidationResult
├── data/
│   └── seed.ts         ← 改造：使用 @agentMethod 装饰器
└── index.ts            ← 改造：将 graph 传入 runAgentLoop
```

## 二、Runtime 层（真正执行）

## 1️⃣ types.ts（核心协议，不变）

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

---

## 2️⃣ registry.ts（新增：Schema 注册表）

```ts
import { z } from "zod";

export type MethodSchema = {
  methodName: string;
  params: z.ZodType<any>;
  returns: string;
  description: string;
};

export type MethodSchemaConfig = {
  params?: z.ZodType<any>;
  returns: string;
  description: string;
};

export class AgentMethodRegistry {
  private static methods: Map<string, MethodSchema> = new Map();

  static register(className: string, methodName: string, schema: MethodSchema): void {
    const key = `${className}:${methodName}`;
    AgentMethodRegistry.methods.set(key, schema);
  }

  static get(className: string, methodName: string): MethodSchema | undefined {
    return AgentMethodRegistry.methods.get(`${className}:${methodName}`);
  }

  static getMethodsForClass(className: string): MethodSchema[] {
    const methods: MethodSchema[] = [];
    for (const [key, schema] of AgentMethodRegistry.methods) {
      if (key.startsWith(`${className}:`)) {
        methods.push(schema);
      }
    }
    return methods;
  }

  static has(className: string, methodName: string): boolean {
    return AgentMethodRegistry.methods.has(`${className}:${methodName}`);
  }

  static clear(): void {
    AgentMethodRegistry.methods.clear();
  }
}
```

---

## 3️⃣ decorator.ts（新增：@agentMethod 装饰器）

```ts
import { z } from "zod";
import { AgentMethodRegistry } from "./registry";
import type { MethodSchema, MethodSchemaConfig } from "./registry";

export function agentMethod(config: MethodSchemaConfig) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const className = target.constructor.name;

    const schema: MethodSchema = {
      methodName: propertyKey,
      params: config.params ?? z.object({}),
      returns: config.returns,
      description: config.description,
    };

    AgentMethodRegistry.register(className, propertyKey, schema);

    return descriptor;
  };
}

export { AgentMethodRegistry } from "./registry";
export type { MethodSchema, MethodSchemaConfig } from "./registry";
```

---

## 4️⃣ graph.ts（改造：BaseNode 增加抽象方法）

```ts
import { z } from "zod";
import { Edge } from "./types";
import { agentMethod, AgentMethodRegistry, MethodSchema } from "./decorator";

export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }

  abstract getCapabilities(): MethodSchema[];  // ← 新增：每个节点声明自己能做什么
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

## 5️⃣ executor.ts（改造：通过 registry 验证 + Zod 解析参数）

```ts
import { Graph } from "./graph";
import { NextAction, Observation } from "./types";
import { AgentMethodRegistry } from "./decorator";

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

        const className = node.constructor.name;
        const schema = AgentMethodRegistry.get(className, action.method);

        if (!schema) {
          throw new Error(`Method '${action.method}' not in registry`);
        }

        const fn = (node as any)[action.method];
        if (typeof fn !== "function") {
          throw new Error("Invalid method");
        }

        let result;
        if (action.args !== undefined) {
          const parsed = schema.params.parse(action.args);  // ← Zod 强验证
          if (typeof parsed === "object" && parsed !== null) {
            result = fn.apply(node, Object.values(parsed));  // ← 解构对象为参数列表
          } else {
            result = fn.call(node, parsed);
          }
        } else {
          result = fn.call(node);
        }

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

## 6️⃣ validator.ts（改造：返回结构化 ValidationResult，校验参数 schema）

```ts
import { NextAction } from "./types";
import { Graph } from "./graph";
import { AgentMethodRegistry } from "./decorator";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export class Validator {
  constructor(private graph: Graph) {}

  validate(action: NextAction): ValidationResult {
    if (action.op === "traverse") {
      const node = this.graph.getNode(action.from);
      if (!node) {
        return { valid: false, error: `Node '${action.from}' not found` };
      }
      return { valid: true };
    }

    if (action.op === "call") {
      const node = this.graph.getNode(action.node);
      if (!node) {
        return { valid: false, error: `Node '${action.node}' not found` };
      }

      const className = node.constructor.name;

      if (!AgentMethodRegistry.has(className, action.method)) {
        return {
          valid: false,
          error: `Method '${action.method}' is not an agent-accessible method on ${className}`,
        };
      }

      const schema = AgentMethodRegistry.get(className, action.method);
      if (schema && action.args !== undefined) {
        const result = schema.params.safeParse(action.args);
        if (!result.success) {
          return {
            valid: false,
            error: `Args validation failed: ${result.error.message}`,
          };
        }
      }

      return { valid: true };
    }

    return { valid: true };
  }
}
```

---

# 🧠 三、Agent 层（LLM 控制）

## 1️⃣ prompt.ts（改造：插入 AVAILABLE CAPABILITIES block）

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { Graph } from "../runtime/graph";
import { MethodSchema } from "../runtime/decorator";

function formatCapabilities(graph: Graph): string {
  const lines: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    const className = node.constructor.name;
    const capabilities = node.getCapabilities();

    if (capabilities.length === 0) continue;

    lines.push(`${className} (${nodeId}):`);

    for (const cap of capabilities) {
      const paramsSchema = zodToJsonSchema(cap.params) as any;
      const paramsStr = JSON.stringify(paramsSchema.properties || {});
      lines.push(`  - ${cap.methodName}(params: ${paramsStr}, returns: ${cap.returns})`);
      lines.push(`    ${cap.description}`);
    }
  }

  return lines.join("\n");
}

export function buildPrompt(goal: string, history: any[], graph: Graph): string {
  const capabilitiesBlock = formatCapabilities(graph);

  return `
You are a reasoning agent.

GOAL:
${goal}

AVAILABLE CAPABILITIES:
${capabilitiesBlock}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore
- If confident → stop

Available actions:
1. traverse { from, relation }
2. call { node, method, args }
3. stop { reason }

History:
${JSON.stringify(history, null, 2)}

Respond ONLY JSON:
`;
}
```

---

## 2️⃣ loop.ts（改造：接受 graph 参数，使用结构化 ValidationResult）

```ts
import { Executor } from "../runtime/executor";
import { Validator } from "../runtime/validator";
import { NextAction } from "../runtime/types";
import { Graph } from "../runtime/graph";
import { buildPrompt } from "./prompt";

async function callLLM(prompt: string): Promise<NextAction> {
  console.log("\nPROMPT:\n", prompt);

  return { op: "stop", reason: "Demo finished" };
}

export async function runAgentLoop(
  goal: string,
  graph: Graph,           // ← 新增：用于生成 capabilities block
  executor: Executor,
  validator: Validator
) {
  const history: any[] = [];

  for (let step = 0; step < 6; step++) {
    const prompt = buildPrompt(goal, history, graph);  // ← 传入 graph

    const action = await callLLM(prompt);

    console.log("ACTION:", action);

    const validation = validator.validate(action);  // ← 返回 ValidationResult
    if (!validation.valid) {
      console.log("❌ Invalid action:", validation.error);  // ← 输出具体原因
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

## data/seed.ts（改造：使用 @agentMethod + 实现 getCapabilities()）

```ts
import { z } from 'zod'
import { Graph, BaseNode } from '../runtime/graph'
import { agentMethod, AgentMethodRegistry, MethodSchema } from '../runtime/decorator'

export class Person extends BaseNode {
  workload: number

  constructor(id: string, workload: number) {
    super(id)
    this.workload = workload
  }

  @agentMethod({
    returns: 'number',
    description: 'Returns the workload value for this person',
  })
  getWorkload() {
    return this.workload
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Person')
  }
}

export class Project extends BaseNode {
  deadlineRisk: number

  constructor(id: string, deadlineRisk: number) {
    super(id)
    this.deadlineRisk = deadlineRisk
  }

  @agentMethod({
    params: z.object({ teamLoad: z.number() }),
    returns: "{ risk: 'HIGH' | 'LOW' }",
    description: 'Checks risk status based on team load and deadline risk',
  })
  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) {
      return { risk: 'HIGH' }
    }
    return { risk: 'LOW' }
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Project')
  }
}

export function seedGraph(): Graph {
  const g = new Graph()

  const p1 = new Person('person_1', 60)
  const p2 = new Person('person_2', 70)

  const project = new Project('project_1', 0.8)

  g.addNode(p1)
  g.addNode(p2)
  g.addNode(project)

  g.addEdge({ from: 'person_1', to: 'project_1', type: 'involved_in' })
  g.addEdge({ from: 'person_2', to: 'project_1', type: 'involved_in' })

  return g
}
```

---

# 🚀 五、入口

## index.ts（改造：将 graph 传入 runAgentLoop）

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
    graph,          // ← 新增：传入 graph 用于 capabilities 生成
    executor,
    validator
  );
}

main();
```

---

# 🔥 六、V2 与 V1 的关键差异

## Prompt 对比

**V1（LLM 靠猜）：**

```text
Available actions:
1. traverse { from, relation }
2. call { node, method }    ← 不知道有哪些 method、参数是什么
3. stop { reason }
```

**V2（LLM 有完整信息）：**

```text
AVAILABLE CAPABILITIES:
Person (person_1):
  - getWorkload(params: {}, returns: number)
    Returns the workload value for this person
Person (person_2):
  - getWorkload(params: {}, returns: number)
    Returns the workload value for this person
Project (project_1):
  - checkRiskStatus(params: {"teamLoad":{"type":"number"}}, returns: { risk: 'HIGH' | 'LOW' })
    Checks risk status based on team load and deadline risk

Available actions:
1. traverse { from, relation }
2. call { node, method, args }   ← args 现在有 schema 约束
3. stop { reason }
```

## Validator 对比

| 维度 | V1 | V2 |
|------|----|----|
| 返回值 | `boolean` | `ValidationResult { valid, error? }` |
| 节点检查 | ✓ | ✓ |
| 方法访问控制 | 只检查函数是否存在 | 只允许 `@agentMethod` 标注的方法 |
| 参数验证 | ✗ | ✓ Zod `safeParse` |
| 错误信息 | 无 | 具体错误原因 |

## Executor 对比

| 维度 | V1 | V2 |
|------|----|----|
| 参数传递 | `fn.call(node, action.args)` | Zod `parse` 后解构传入 |
| 方法安全性 | 任意方法都可调用 | 必须在 registry 中注册 |

---

# 🔥 七、你下一步要做的（关键）

V2 已实现 Schema Discovery 闭环，但 LLM 还没真正接入，下一步需要：

---

## 1️⃣ 接入真实 LLM（Claude / OpenAI）

把：

```ts
async function callLLM(prompt: string): Promise<NextAction> {
  return { op: "stop", reason: "Demo finished" };
}
```

换成真实 API，并强制 JSON 输出：

```text
Respond ONLY valid JSON. No explanation. No markdown.
```

---

## 2️⃣ 验证多步推理（核心升级）

现在图中存在依赖关系：`checkRiskStatus` 需要先聚合 `getWorkload`。

理想的推理链应该是：

```
1. traverse person_1 → involved_in → [project_1]
2. call person_1.getWorkload()     → 60
3. call person_2.getWorkload()     → 70
4. call project_1.checkRiskStatus({ teamLoad: 130 }) → { risk: "HIGH" }
5. stop "project_1 is HIGH risk due to team overload"
```

V2 的 capabilities block 已经为 LLM 提供了完整信息，验证 LLM 能否自主完成这条推理链是 V3 的核心目标。

---

## 3️⃣ 状态累积（上下文管理）

当前 `history` 只做追加，LLM 需要自己从历史中提取中间结果（如 workload 汇总）。可考虑引入显式状态变量：

```ts
state = {
  teamLoad: number  // 累积各 person 的 workload
}
```

---

# 🧨 最后说一句实话（很关键）

V2 做完后，你会第一次清晰看到：

> ✔ LLM 不再"盲目猜测"方法名和参数
> ✔ 而是在"有完整 API 文档的操作系统上跑推理程序"
> ✔ Schema Discovery 是 Agent 可靠性的基础，不是锦上添花
