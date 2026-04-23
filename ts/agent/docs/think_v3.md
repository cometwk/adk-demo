
基于语义层(语义图)的 LLM Agent 推理 — V3：语义实体 + 黑板状态

# 目标

- V3 在 V2 的基础上解决两个根本缺陷：**Edge 没有生效** 和 **Node 语义不完整**
- V2 的 LLM 只是把图当成扁平的 RPC 服务注册中心，真正的"图游走"能力从未发挥
- Node 回归"知识图谱实体"本质：**属性（Properties）** + **连接（Edges）** + **动作（Actions）** 三位一体
- Runtime 引入 **AgentState 黑板**，防止 Context 爆炸和 LLM 注意力丢失
- 等式升级为：**语义实体（Property + Edge + Action） × 局部感知（Read / Traverse） × Zod 约束（Schema） × LLM 推理 × 黑板状态（AgentState）**

# 最小可验证原型

## 一、整体结构

```text
demo/
├── runtime/
│   ├── types.ts        ← 改造：新增 read_node / update_state op
│   ├── registry.ts     ← 改造：新增 AgentPropertyRegistry
│   ├── decorator.ts    ← 改造：新增 @agentProperty 装饰器
│   ├── graph.ts        ← 改造：BaseNode 增加 getProperties()
│   ├── state.ts        ← 新增：AgentState 黑板（Zod 类型安全）
│   ├── executor.ts     ← 改造：处理 read_node / update_state
│   └── validator.ts    ← 改造：校验 read_node / update_state
├── agent/
│   ├── prompt.ts       ← 改造：注入四块信息（Capabilities + Properties + Topology + Blackboard）
│   └── loop.ts         ← 改造：接受 state，仅传递 lastObservation，不传全量 history
├── data/
│   └── seed.ts         ← 改造：@agentProperty 标注可读属性，去掉 getWorkload()
└── index.ts            ← 改造：初始化 AgentState，传入 loop
```

---

## 二、Runtime 层（真正执行）

## 1️⃣ types.ts（改造：扩展 NextAction）

V3 新增两个关键指令：`read_node`（读属性+边）和 `update_state`（写黑板）。

```ts
export type NodeId = string;

export type Edge = {
  from: NodeId;
  to: NodeId;
  type: string;
};

export type NextAction =
  | { op: "traverse"; from: NodeId; relation: string }
  | { op: "read_node"; node: NodeId }           // ← 新增：读节点属性 + 出边
  | { op: "call"; node: NodeId; method: string; args?: any }
  | { op: "update_state"; key: string; value: any }  // ← 新增：写黑板
  | { op: "stop"; reason: string };

export type Observation = {
  success: boolean;
  data?: any;
  error?: string;
};
```

---

## 2️⃣ registry.ts（改造：新增 AgentPropertyRegistry）

V2 只有方法注册表，V3 补齐属性注册表，让 LLM 能知道节点有哪些可见属性。

```ts
import type { z } from "zod";

// ── Method 部分（不变）──────────────────────────────────
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
    AgentMethodRegistry.methods.set(`${className}:${methodName}`, schema);
  }
  static get(className: string, methodName: string): MethodSchema | undefined {
    return AgentMethodRegistry.methods.get(`${className}:${methodName}`);
  }
  static getMethodsForClass(className: string): MethodSchema[] {
    const methods: MethodSchema[] = [];
    for (const [key, schema] of AgentMethodRegistry.methods) {
      if (key.startsWith(`${className}:`)) methods.push(schema);
    }
    return methods;
  }
  static has(className: string, methodName: string): boolean {
    return AgentMethodRegistry.methods.has(`${className}:${methodName}`);
  }
  static clear(): void { AgentMethodRegistry.methods.clear(); }
}

// ── Property 部分（新增）─────────────────────────────────
export type PropertySchema = {
  propertyName: string;
  returns: string;
  description: string;
};

export type PropertySchemaConfig = {
  returns: string;
  description: string;
};

export class AgentPropertyRegistry {
  private static properties: Map<string, PropertySchema> = new Map();

  static register(className: string, propertyName: string, schema: PropertySchema): void {
    AgentPropertyRegistry.properties.set(`${className}:${propertyName}`, schema);
  }
  static get(className: string, propertyName: string): PropertySchema | undefined {
    return AgentPropertyRegistry.properties.get(`${className}:${propertyName}`);
  }
  static getPropertiesForClass(className: string): PropertySchema[] {
    const props: PropertySchema[] = [];
    for (const [key, schema] of AgentPropertyRegistry.properties) {
      if (key.startsWith(`${className}:`)) props.push(schema);
    }
    return props;
  }
  static has(className: string, propertyName: string): boolean {
    return AgentPropertyRegistry.properties.has(`${className}:${propertyName}`);
  }
  static clear(): void { AgentPropertyRegistry.properties.clear(); }
}
```

---

## 3️⃣ decorator.ts（改造：新增 @agentProperty）

```ts
import { z } from "zod";
import { AgentMethodRegistry, AgentPropertyRegistry } from "./registry";
import type { MethodSchema, MethodSchemaConfig, PropertySchemaConfig } from "./registry";

// 方法装饰器（不变）
export function agentMethod(config: MethodSchemaConfig) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor => {
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

// 属性装饰器（新增）── 标注"对 LLM 可见"的字段，防止内部私有字段泄漏
export function agentProperty(config: PropertySchemaConfig) {
  return (target: any, propertyKey: string): void => {
    const className = target.constructor.name;
    AgentPropertyRegistry.register(className, propertyKey, {
      propertyName: propertyKey,
      returns: config.returns,
      description: config.description,
    });
  };
}

export { AgentMethodRegistry, AgentPropertyRegistry } from "./registry";
export type { MethodSchema, MethodSchemaConfig, PropertySchemaConfig } from "./registry";
```

---

## 4️⃣ graph.ts（改造：BaseNode 增加 getProperties()）

`getCapabilities()` 返回可调用的方法（动作），`getProperties()` 返回对 LLM 可见的属性值（状态）。

```ts
import type { Edge } from "./types";
import { AgentPropertyRegistry, type MethodSchema } from "./registry";

export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }

  abstract getCapabilities(): MethodSchema[];

  // ← 新增：读取所有 @agentProperty 标注字段的当前值
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

  traverse(from: string, relation: string): string[] {
    return this.edges
      .filter(e => e.from === from && e.type === relation)
      .map(e => e.to);
  }
}
```

---

## 5️⃣ state.ts（新增：AgentState 黑板）

黑板是 Runtime 层维护的类型安全工作内存。LLM 通过 `update_state` 写入，Prompt 每次只注入当前快照。

```ts
import type { z } from "zod";

export class AgentState<T extends z.ZodObject<any>> {
  private schema: T;
  private data: z.infer<T>;

  constructor(schema: T) {
    this.schema = schema;
    this.data = schema.parse({});  // 用 default 值初始化
  }

  getSchemaShape(): Record<string, z.ZodType<any>> {
    return this.schema.shape;
  }

  set<K extends keyof z.infer<T>>(key: K, value: z.infer<T>[K]): void {
    if (!(key in this.schema.shape)) {
      throw new Error(`Key '${String(key)}' not in state schema`);
    }
    // 写入时再次 Zod 校验，防止 LLM 写入错误类型
    const result = this.schema.shape[key as string].safeParse(value);
    if (!result.success) {
      throw new Error(`Validation failed for '${String(key)}': ${result.error.message}`);
    }
    (this.data as any)[key] = result.data;
  }

  get(): z.infer<T> {
    return { ...this.data };
  }

  toJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }
}
```

---

## 6️⃣ executor.ts（改造：处理 read_node / update_state）

```ts
import { AgentMethodRegistry } from "./decorator";
import type { Graph } from "./graph";
import type { AgentState } from "./state";
import type { NextAction, Observation } from "./types";

export class Executor {
  constructor(
    private graph: Graph,
    private agentState: AgentState<any>,   // ← 新增：持有黑板引用
  ) {}

  execute(action: NextAction): Observation {
    try {
      if (action.op === "traverse") {
        const targetIds = this.graph.traverse(action.from, action.relation);
        // traverse 返回不止 ID，还附带目标节点的 className 和可用方法名
        const summaries = targetIds.map(id => {
          const node = this.graph.getNode(id);
          if (!node) return { nodeId: id, className: "Unknown", methodNames: [] };
          const methods = AgentMethodRegistry.getMethodsForClass(node.constructor.name);
          return { nodeId: id, className: node.constructor.name, methodNames: methods.map(m => m.methodName) };
        });
        return { success: true, data: summaries };
      }

      if (action.op === "read_node") {
        // ← 新增：一次性返回节点的 properties + 出边，激活图游走
        const node = this.graph.getNode(action.node);
        if (!node) throw new Error(`Node '${action.node}' not found`);

        const properties = node.getProperties();
        const edges: Record<string, string[]> = {};
        for (const edge of this.graph.edges) {
          if (edge.from === action.node) {
            if (!edges[edge.type]) edges[edge.type] = [];
            edges[edge.type].push(edge.to);
          }
        }
        return { success: true, data: { properties, edges } };
      }

      if (action.op === "call") {
        const node = this.graph.getNode(action.node);
        if (!node) throw new Error("Node not found");

        const className = node.constructor.name;
        const schema = AgentMethodRegistry.get(className, action.method);
        if (!schema) throw new Error(`Method '${action.method}' not in registry`);

        const fn = (node as any)[action.method];
        if (typeof fn !== "function") throw new Error("Invalid method");

        let result;
        if (action.args !== undefined) {
          const parsed = schema.params.parse(action.args);
          if (typeof parsed === "object" && parsed !== null) {
            result = fn.apply(node, Object.values(parsed));
          } else {
            result = fn.call(node, parsed);
          }
        } else {
          result = fn.call(node);
        }
        return { success: true, data: result };
      }

      if (action.op === "update_state") {
        // ← 新增：LLM 主动写入黑板，Runtime 强制 Zod 校验
        this.agentState.set(action.key, action.value);
        return { success: true, data: { updated: action.key } };
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

## 7️⃣ validator.ts（改造：校验 read_node / update_state）

```ts
import { AgentMethodRegistry } from "./decorator";
import type { Graph } from "./graph";
import type { AgentState } from "./state";
import type { NextAction } from "./types";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export class Validator {
  constructor(
    private graph: Graph,
    private agentState: AgentState<any>,   // ← 新增：用于校验 update_state 的 key
  ) {}

  validate(action: NextAction): ValidationResult {
    if (action.op === "traverse") {
      const node = this.graph.getNode(action.from);
      if (!node) return { valid: false, error: `Node '${action.from}' not found` };
      return { valid: true };
    }

    if (action.op === "read_node") {
      // ← 新增：只校验节点存在
      const node = this.graph.getNode(action.node);
      if (!node) return { valid: false, error: `Node '${action.node}' not found` };
      return { valid: true };
    }

    if (action.op === "call") {
      const node = this.graph.getNode(action.node);
      if (!node) return { valid: false, error: `Node '${action.node}' not found` };

      const className = node.constructor.name;
      if (!AgentMethodRegistry.has(className, action.method)) {
        return { valid: false, error: `Method '${action.method}' is not an agent-accessible method on ${className}` };
      }
      const schema = AgentMethodRegistry.get(className, action.method);
      if (schema && action.args !== undefined) {
        const result = schema.params.safeParse(action.args);
        if (!result.success) {
          return { valid: false, error: `Args validation failed: ${result.error.message}` };
        }
      }
      return { valid: true };
    }

    if (action.op === "update_state") {
      // ← 新增：只允许写入黑板 schema 中已声明的 key
      const schemaShape = this.agentState.getSchemaShape();
      if (!(action.key in schemaShape)) {
        return { valid: false, error: `Key '${action.key}' not in state schema` };
      }
      return { valid: true };
    }

    if (action.op === "stop") {
      return { valid: true };
    }

    // TypeScript 穷尽检查，编译期确保所有 op 已处理
    const _exhaustiveCheck: never = action;
    return { valid: false, error: `Unknown op: ${(_exhaustiveCheck as any).op}` };
  }
}
```

---

# 🧠 三、Agent 层（LLM 控制）

## 1️⃣ prompt.ts（改造：注入四块结构化信息）

V2 只有 CAPABILITIES，V3 新增三块：PROPERTIES（可读属性目录）、TOPOLOGY（图拓扑），以及 BLACKBOARD STATE（黑板快照）。History 被彻底移除，换成单条 `LAST OBSERVATION`。

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { AgentPropertyRegistry } from "../runtime/decorator";
import type { Graph } from "../runtime/graph";
import type { AgentState } from "../runtime/state";

// 可调用的方法（动作）
function formatCapabilities(graph: Graph): string {
  const lines: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    const capabilities = node.getCapabilities();
    if (capabilities.length === 0) continue;
    lines.push(`${node.constructor.name} (${nodeId}):`);
    for (const cap of capabilities) {
      const paramsSchema = zodToJsonSchema(cap.params) as any;
      const paramsStr = JSON.stringify(paramsSchema.properties || {});
      lines.push(`  - ${cap.methodName}(params: ${paramsStr}, returns: ${cap.returns})`);
      lines.push(`    ${cap.description}`);
    }
  }
  return lines.join("\n");
}

// 可读的属性（状态）
function formatProperties(graph: Graph): string {
  const lines: string[] = [];
  for (const [nodeId, node] of graph.nodes) {
    const props = AgentPropertyRegistry.getPropertiesForClass(node.constructor.name);
    if (props.length === 0) continue;
    lines.push(`${node.constructor.name} (${nodeId}):`);
    for (const prop of props) {
      lines.push(`  - ${prop.propertyName}: ${prop.returns} — ${prop.description}`);
    }
  }
  return lines.join("\n");
}

// 图拓扑（已知的边）── LLM 以此决定游走路径，不再盲目猜 relation
function formatTopology(graph: Graph): string {
  const lines: string[] = [];
  const edgesByFrom: Record<string, Record<string, string[]>> = {};
  for (const edge of graph.edges) {
    if (!edgesByFrom[edge.from]) edgesByFrom[edge.from] = {};
    if (!edgesByFrom[edge.from][edge.type]) edgesByFrom[edge.from][edge.type] = [];
    edgesByFrom[edge.from][edge.type].push(edge.to);
  }
  for (const [from, relations] of Object.entries(edgesByFrom)) {
    for (const [relation, targets] of Object.entries(relations)) {
      lines.push(`${from}: ${relation} → [${targets.join(", ")}]`);
    }
  }
  return lines.join("\n");
}

export function buildPrompt(
  goal: string,
  graph: Graph,
  state: AgentState<any>,
  lastObservation: string,   // ← 不再传全量 history，只传最近一条观测
): string {
  return `
You are a reasoning agent.

GOAL:
${goal}

AVAILABLE CAPABILITIES:
${formatCapabilities(graph) || "(none)"}

AVAILABLE PROPERTIES:
${formatProperties(graph) || "(none)"}

AVAILABLE TOPOLOGY:
${formatTopology(graph) || "(none)"}

CURRENT BLACKBOARD STATE:
${state.toJSON()}

LAST OBSERVATION:
${lastObservation}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore via read_node or traverse
- Store intermediate results via update_state
- If confident → stop

Available actions:
1. traverse { from, relation }
2. read_node { node }
3. call { node, method, args }
4. update_state { key, value }
5. stop { reason }

Respond ONLY JSON:
`;
}
```

---

## 2️⃣ loop.ts（改造：接受 state，维护 lastObservation）

```ts
import type { Executor } from "../runtime/executor";
import type { Graph } from "../runtime/graph";
import type { AgentState } from "../runtime/state";
import type { NextAction } from "../runtime/types";
import type { Validator } from "../runtime/validator";
import { buildPrompt } from "./prompt";

// Mock 推理链（用于 Demo 验证 V3 完整闭环）
const mockActions: NextAction[] = [
  { op: "read_node", node: "person_1" },
  { op: "update_state", key: "teamLoadAccumulator", value: 60 },
  { op: "read_node", node: "person_2" },
  { op: "update_state", key: "teamLoadAccumulator", value: 130 },
  { op: "call", node: "project_1", method: "checkRiskStatus", args: { teamLoad: 130 } },
  { op: "stop", reason: "Project risk is HIGH due to overloaded team" },
];

let actionIndex = 0;

async function callLLM(prompt: string): Promise<NextAction> {
  console.log("\nPROMPT:\n", prompt);
  if (actionIndex >= mockActions.length) return { op: "stop", reason: "Demo finished" };
  return mockActions[actionIndex++];
}

export async function runAgentLoop(
  goal: string,
  graph: Graph,
  executor: Executor,
  validator: Validator,
  state: AgentState<any>,   // ← 新增：从外部注入黑板
) {
  let lastObservation = "(none)";

  for (let step = 0; step < 10; step++) {
    const prompt = buildPrompt(goal, graph, state, lastObservation);  // ← 不再传 history
    const action = await callLLM(prompt);

    console.log("ACTION:", action);

    const validation = validator.validate(action);
    if (!validation.valid) {
      console.log("❌ Invalid action:", validation.error);
      break;
    }

    const obs = executor.execute(action);
    console.log("OBS:", obs);

    // 只保留最近一条观测，不累积冗长 history
    if (obs.success && obs.data !== undefined) {
      lastObservation = `${action.op} → ${JSON.stringify(obs.data)}`;
    } else if (!obs.success) {
      lastObservation = `${action.op} → ERROR: ${obs.error}`;
    }

    if (action.op === "stop") {
      console.log("✅ DONE:", obs.data);
      break;
    }
  }
}
```

---

# 🌱 四、数据初始化

## data/seed.ts（改造：@agentProperty 标注属性，去掉 getWorkload()）

V3 中，`workload` 是 `Person` 的一个公开属性，LLM 通过 `read_node` 直接读到，不再需要专门的 `getWorkload()` 动作。`@agentMethod` 仅留给真正改变状态或执行复杂计算的逻辑。

```ts
import { z } from "zod";
import { agentMethod, agentProperty, AgentMethodRegistry, type MethodSchema } from "../runtime/decorator";
import { BaseNode, Graph } from "../runtime/graph";

export class Person extends BaseNode {
  @agentProperty({ returns: "number", description: "Current workload in hours" })
  workload: number;

  constructor(id: string, workload: number) {
    super(id);
    this.workload = workload;
  }

  // getWorkload() 已删除 ── workload 现在是可读属性，不需要再封装成方法
  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass("Person");
  }
}

export class Project extends BaseNode {
  deadlineRisk: number;  // 内部字段，不暴露给 LLM

  constructor(id: string, deadlineRisk: number) {
    super(id);
    this.deadlineRisk = deadlineRisk;
  }

  @agentMethod({
    params: z.object({ teamLoad: z.number() }),
    returns: "{ risk: 'HIGH' | 'LOW' }",
    description: "Checks risk status based on team load and deadline risk",
  })
  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) return { risk: "HIGH" };
    return { risk: "LOW" };
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass("Project");
  }
}

export function seedGraph(): Graph {
  const g = new Graph();

  g.addNode(new Person("person_1", 60));
  g.addNode(new Person("person_2", 70));
  g.addNode(new Project("project_1", 0.8));

  g.addEdge({ from: "person_1", to: "project_1", type: "involved_in" });
  g.addEdge({ from: "person_2", to: "project_1", type: "involved_in" });

  return g;
}
```

---

# 🚀 五、入口

## index.ts（改造：初始化 AgentState，传入 loop）

```ts
import { z } from "zod";
import { runAgentLoop } from "./agent/loop";
import { seedGraph } from "./data/seed";
import { Executor } from "./runtime/executor";
import { AgentState } from "./runtime/state";
import { Validator } from "./runtime/validator";

async function main() {
  const graph = seedGraph();

  // ← 新增：在入口声明黑板 Schema，Zod default 自动初始化
  const workflowSchema = z.object({
    teamLoadAccumulator: z.number().default(0),
  });
  const state = new AgentState(workflowSchema);

  const executor = new Executor(graph, state);   // ← 新增 state 参数
  const validator = new Validator(graph, state); // ← 新增 state 参数

  await runAgentLoop(
    "Assess project risk for project_1",
    graph,
    executor,
    validator,
    state,   // ← 新增
  );
}

main();
```

---

# 🔥 六、V3 与 V2 的关键差异

## Prompt 对比

**V2（LLM 知道 API，但看不到图结构）：**

```text
AVAILABLE CAPABILITIES:
Person (person_1):
  - getWorkload(params: {}, returns: number)
    Returns the workload value for this person

Available actions:
1. traverse { from, relation }     ← relation 值靠猜，"involved_in" 哪来的？
2. call { node, method, args }
3. stop { reason }

History:
[...越来越长，Token 越烧越多...]
```

**V3（LLM 看到完整的物理世界）：**

```text
AVAILABLE CAPABILITIES:
Project (project_1):
  - checkRiskStatus(params: {"teamLoad":{"type":"number"}}, returns: ...)

AVAILABLE PROPERTIES:             ← 新增：节点状态目录
Person (person_1):
  - workload: number — Current workload in hours
Person (person_2):
  - workload: number — Current workload in hours

AVAILABLE TOPOLOGY:               ← 新增：边目录，游走有地图
person_1: involved_in → [project_1]
person_2: involved_in → [project_1]

CURRENT BLACKBOARD STATE:         ← 新增：中间结果持久化
{ "teamLoadAccumulator": 60 }

LAST OBSERVATION:                 ← 单条观测代替冗长 history
read_node → { properties: { workload: 60 }, edges: {} }

Available actions:
1. traverse { from, relation }
2. read_node { node }             ← 新增：观察属性 + 出边
3. call { node, method, args }
4. update_state { key, value }   ← 新增：写黑板
5. stop { reason }
```

## Node 语义对比

| 维度 | V2 | V3 |
|------|----|----|
| 属性可见性 | `getWorkload()` 需要专门的 agentMethod | `@agentProperty` 标注，`read_node` 直接读取 |
| 图游走 | LLM 猜测 relation 名称 | TOPOLOGY block 提供完整边目录 |
| 节点三位一体 | 只有 Actions | Properties + Edges + Actions |
| 内部状态保护 | 无区分 | 只有 `@agentProperty` 标注的字段对 LLM 可见 |

## 状态管理对比

| 维度 | V2 | V3 |
|------|----|----|
| 中间结果存储 | 追加到 `history[]`，LLM 自己记忆 | AgentState 黑板（类型安全） |
| Prompt 大小 | 随步数线性增长 | 固定大小（黑板快照 + 单条 lastObservation） |
| 写入校验 | 无 | Zod 二次 safeParse，防止 LLM 写入错误类型 |
| 可调试性 | 难以追踪 LLM 在哪步记错了数字 | `state.toJSON()` 随时打印当前黑板 |
| 写入权限 | LLM 无法主动写入 | `update_state { key, value }` 原语，Runtime 校验 key 合法性 |

## Executor / Validator 对比

| 维度 | V2 | V3 |
|------|----|----|
| 支持的 op | traverse / call / stop | + read_node + update_state |
| traverse 返回值 | 目标节点 ID 列表 | ID + className + 可用方法名（带上下文游走） |
| 参数安全 | Zod parse 后解构 | 不变 |

---

# 🔥 七、你下一步要做的（关键）

V3 实现了语义实体三位一体和黑板状态管理，LLM 物理世界已经具备，但推理还靠 Mock 驱动。

---

## 1️⃣ 接入真实 LLM（Claude / OpenAI）

把 Mock 序列替换为真实 API，强制结构化 JSON 输出：

```ts
async function callLLM(prompt: string): Promise<NextAction> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(res.choices[0].message.content!) as NextAction;
}
```

---

## 2️⃣ 验证多步图游走（核心升级）

V3 的完整推理链应该是：

```
1. read_node { node: "project_1" }
   → { properties: {}, edges: { involved_in: ["person_1", "person_2"] } }
2. read_node { node: "person_1" }
   → { properties: { workload: 60 }, edges: {} }
3. update_state { key: "teamLoadAccumulator", value: 60 }
4. read_node { node: "person_2" }
   → { properties: { workload: 70 }, edges: {} }
5. update_state { key: "teamLoadAccumulator", value: 130 }
6. call { node: "project_1", method: "checkRiskStatus", args: { teamLoad: 130 } }
   → { risk: "HIGH" }
7. stop { reason: "project_1 is HIGH risk: team overloaded (130h)" }
```

关键验证点：LLM 能否**自主发现边** → **顺图游走** → **写黑板累积** → **读黑板做最终计算**，不需要任何人工干预。

---

## 3️⃣ 扩展黑板 Schema（适配更复杂场景）

随着图规模扩大，可能需要在黑板中追踪多个维度：

```ts
const workflowSchema = z.object({
  teamLoadAccumulator: z.number().default(0),
  discoveredRisks: z.array(z.string()).default([]),
  visitedNodes: z.array(z.string()).default([]),
});
```

---

## 4️⃣ 考虑反向边游走（Incoming Edges）

当前 `read_node` 只暴露出边（outgoing edges）。如果需要"谁在参与这个项目"（反向查询），需要在 Executor 中额外处理：

```ts
// executor.ts 中 read_node 的增强版本
const incomingEdges: Record<string, string[]> = {};
for (const edge of this.graph.edges) {
  if (edge.to === action.node) {
    if (!incomingEdges[edge.type]) incomingEdges[edge.type] = [];
    incomingEdges[edge.type].push(edge.from);
  }
}
return { success: true, data: { properties, outEdges: edges, inEdges: incomingEdges } };
```

---

# 🧨 最后说一句实话（很关键）

V3 做完后，你会第一次清晰看到：

> ✔ Node 不再是 RPC 端点，而是有属性、有关系、有动作的**语义实体**
> ✔ LLM 不再瞎猜边名称，而是根据**拓扑地图**决策游走路径
> ✔ 中间状态不再堆积在 Context Window，而是沉淀在**类型安全的黑板**里
> ✔ 黑板模式是 Agent 从"玩具"走向"工程化中间件"的分水岭
>
> **图结构提供空间上的广度，AgentState 提供时间上的记忆。**
