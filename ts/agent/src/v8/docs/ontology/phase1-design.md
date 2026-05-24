# Ontology Module — 设计文档

> 本文档描述 V8 本体层（Layer 1 — T）与行为桥接层的设计：
>
> - Schema 体系（TypeSchema / RelationSchema / Ontology）
> - Registry（类型/属性/方法/关系注册表）
> - Decorator 声明（@agentType / @agentProperty / @agentMethod / @agentRelations）
> - BaseNode（节点基类 + 方法执行载体）
> - Ontology Builder（本体构建）
> - RelationBinding + Validation（关系类型到物理存储映射与校验）
> - Ontology Tools（inspect_schema）与 Method Tools（describe_method, call_method）
> - System Prompt 集成
>
> 不包含：GraphStore 相关内容（已实现于 engine）、Rule 规则相关内容（待后续处理）。

---

## 1. 架构定位

### 1.1 在三层模型中的位置

```text
┌─────────────────────────────────────────────────────┐
│ Layer 1 — Ontology (T)  ← 本文档                     │
│   Schema 声明 / Registry / Decorator / Builder       │
├─────────────────────────────────────────────────────┤
│ Layer 2 — GraphStore (E,R)  ← engine 已实现          │
│   GraphStore / ComputeStore / VectorStore            │
├─────────────────────────────────────────────────────┤
│ Layer 3 — Behavior (C)  ← 部分由 BaseNode 桥接       │
│   BaseNode / call_method / NodeInstanceContainer     │
└─────────────────────────────────────────────────────┘
```

### 1.2 与 V6 的关键差异

| 维度 | V6 | V8 |
|------|----|----|
| BaseNode 与 Store 关系 | WeakMap 持有 Store 引用 | 通过 NodeInstanceContainer 接口解耦 |
| Registry 生命周期 | 全局静态，测试需手动 clear | 保留全局静态，提供 `AgentRegistry.clear()` 进行便捷清理 |
| RelationBinding 位置 | `ontology/relation-binding.ts` | 保留在 ontology 模块 |
| Ontology Tools | `inspect_schema` 仅查询 | 增强为 V8 tool 体系，支持 policy 过滤 |
| System Prompt | 手动拼接 | 提供 `buildOntologyPrompt()` 统一构建 |

### 1.3 核心职责边界

```text
Ontology 负责"类型是什么"（DDL）
Engine 负责"怎么查数据"（DML）
BaseNode 负责"能做什么"（存储过程）
```

---

## 2. Schema 体系

### 2.1 类型定义

```typescript
// ── Type schema (T) ──

export type TypeProperty = {
  name: string
  type: string               // 'string' | 'number' | 'boolean' | 'date' 等
  description: string
  agentVisible?: boolean     // 是否对 Agent 可见（默认 true）
  sensitive?: boolean        // PII / 敏感标记，用于脱敏
}

export type TypeMethod = {
  name: string
  description: string
}

export type TypeSchema = {
  name: string               // 类型名，如 'Reader', 'Book'
  description: string
  properties: TypeProperty[]
  methods: TypeMethod[]
}

// ── Relation schema (R) ──
// 结构性关系声明（非因果），因果关系待 Rule 模块处理

export type RelationSchema = {
  type: string               // 关系类型名，如 'borrows'
  fromType: string           // 源实体类型名，如 'Reader'
  toType: string             // 目标实体类型名，如 'Book'
  description: string
}

// ── Ontology ──

export type Ontology = {
  version: string            // semver，用于校准追踪
  types: TypeSchema[]
  relations: RelationSchema[]
}
```

### 2.2 辅助函数

```typescript
/** 按名称查找 TypeSchema */
export function getTypeSchema(ontology: Ontology, typeName: string): TypeSchema | undefined {
  return ontology.types.find((t) => t.name === typeName)
}

/** 查找与指定类型相关的所有 RelationSchema */
export function getRelationsFor(ontology: Ontology, typeName: string): RelationSchema[] {
  return ontology.relations.filter((r) => r.fromType === typeName || r.toType === typeName)
}

/** 按关系类型名查找 RelationSchema */
export function getRelationByType(ontology: Ontology, relationType: string): RelationSchema | undefined {
  return ontology.relations.find((r) => r.type === relationType)
}
```

### 2.3 与 V6 的变化

| 项目 | V6 | V8 | 原因 |
|------|----|----|------|
| `TypeProperty.agentVisible` | 默认 `false` | 默认 `true` | Agent 主导，属性默认可见更合理 |
| `getRelationByType` | 无 | 新增 | `GraphStore.getNeighbors` 要求 `relation` 必填，需要按类型查找 Schema |
| 其他 | 不变 | 不变 | 稳定接口，无需破坏性变更 |

---

## 3. Registry

### 3.1 设计原则

保留 V6 的全局静态 Registry 模式：

- **简单直观**：装饰器副作用自动注册，无需手动管理生命周期
- **与 Decorator 天然配合**：装饰器执行时即完成注册
- **测试隔离**：每个 Registry 提供 `clear()` 方法，测试中在 before/after 调用

### 3.2 AgentTypeRegistry

```typescript
export type TypeSchemaEntry = {
  description: string
}

export class AgentTypeRegistry {
  private static types: Map<string, TypeSchemaEntry> = new Map()

  static register(className: string, entry: TypeSchemaEntry): void
  static get(className: string): TypeSchemaEntry | undefined
  static getRegisteredClasses(): string[]
  static clear(): void
  static all(): TypeSchemaEntry[]
}
```

### 3.3 AgentPropertyRegistry

```typescript
export type PropertySchema = {
  propertyName: string
  type: string
  description: string
  agentVisible: boolean
  sensitive: boolean
}

export type PropertySchemaConfig = {
  type: string
  description: string
  agentVisible?: boolean    // V8 默认 true
  sensitive?: boolean       // 默认 false
}

export class AgentPropertyRegistry {
  private static properties: Map<string, PropertySchema> = new Map()

  static register(className: string, propertyName: string, schema: PropertySchema): void
  static get(className: string, propertyName: string): PropertySchema | undefined

  /** 获取类的属性，支持递归查询继承链，并包含基类 BaseNode 的 id 属性 */
  static getPropertiesForClass(className: string): PropertySchema[]

  static has(className: string, propertyName: string): boolean
  static clear(): void
  static all(): PropertySchema[]
}
```

### 3.4 AgentMethodRegistry

```typescript
export type MethodPrecondition = {
  param: string
  check: 'must_be_positive' | 'must_be_in_facts' | 'must_be_non_empty_string'
  description?: string
}

export type MethodSchema = {
  methodName: string
  params: z.ZodType<unknown>
  returns: string
  description: string
  requiredFacts?: string[]
  relatedRuleIds?: string[]
  preconditions?: MethodPrecondition[]
}

export type MethodSchemaConfig = {
  params?: z.ZodType<unknown>
  returns: string
  description: string
  requiredFacts?: string[]
  relatedRuleIds?: string[]
  preconditions?: MethodPrecondition[]
}

export class AgentMethodRegistry {
  private static methods: Map<string, MethodSchema> = new Map()

  static register(className: string, methodName: string, schema: MethodSchema): void
  static get(className: string, methodName: string): MethodSchema | undefined
  /** 获取类的方法，支持递归查询继承链 */
  static getMethodsForClass(className: string): MethodSchema[]
  static has(className: string, methodName: string): boolean
  static clear(): void
  static all(): MethodSchema[]
}
```

### 3.5 AgentRelationRegistry

```typescript
export type RelationRegistryEntry = {
  type: string
  fromType: string
  toType: string
  description: string
}

export class AgentRelationRegistry {
  private static relations: Map<string, RelationRegistryEntry[]> = new Map()

  static register(className: string, entry: RelationRegistryEntry): void
  static getRelationsForClass(className: string): RelationRegistryEntry[]

  /** 反向查找：目标类型匹配的所有关系 */
  static getRelationsForToType(toType: string): RelationRegistryEntry[]

  /** 获取所有已注册的 RelationSchema */
  static getRelationSchemas(): RelationSchema[]

  static clear(): void
  static all(): RelationRegistryEntry[][]
}
```

### 3.6 AgentRegistry Facade

```typescript
export const AgentRegistry = {
  /** 获取完整的 TypeSchema（type + properties + methods 三合一） */
  getTypeSchema(className: string): TypeSchema | undefined

  /** 返回所有通过 @agentType 注册的类名 */
  getRegisteredClasses(): string[]

  /** 获取所有通过 @agentRelations 注册的 RelationSchema */
  getRelationSchemas(): RelationSchema[]

  /** 一次性清空所有 Registry（测试用） */
  clear(): void

  all(): { types, properties, methods, relations }
}
```

---

## 4. Decorator

### 4.1 设计原则

保留 V6 的 Decorator 模式，作为类型声明的语法糖：

- 装饰器副作用 = 自动注册到全局 Registry
- 类级装饰器：`@agentType`, `@agentRelations`
- 属性级装饰器：`@agentProperty`
- 方法级装饰器：`@agentMethod`

### 4.2 @agentType

```typescript
export type TypeSchemaConfig = {
  name?: string             // 显式实体类型名（可选，提供此项以防止混淆/压缩后 constructor.name 失效）
  description: string
}

export function agentType(config: TypeSchemaConfig): ClassDecorator

// 注：装饰器内部逻辑除了注册外，需在 prototype 上写入 agentTypeName 属性（target.prototype.agentTypeName = config.name || target.name），供后续通过 node.agentTypeName 稳定读取实体类型，避免混淆导致 runtime 反射失败。
```

### 4.3 @agentProperty

```typescript
export function agentProperty(config: PropertySchemaConfig): PropertyDecorator
```

V8 变更：`agentVisible` 默认值从 `false` 改为 `true`。

### 4.4 @agentMethod

```typescript
export function agentMethod(config: MethodSchemaConfig): MethodDecorator
```

### 4.5 @agentRelations

```typescript
export type RelationSchemaConfig = {
  type: string
  toType: string
  description: string
}

/** 类级关系 Schema 声明（DDL），替代已移除的方法级 @agentRelation */
export function agentRelations(relations: RelationSchemaConfig[]): ClassDecorator
```

### 4.6 使用示例

```typescript
@agentType({ description: '图书馆读者，可借阅和归还图书' })
@agentRelations([
  { type: 'borrows', toType: 'Book', description: '当前借阅（未归还）' },
  { type: 'overdue', toType: 'Book', description: '逾期未还' },
  { type: 'registered_at', toType: 'Branch', description: '注册分馆' },
])
export class Reader extends BaseNode {
  @agentProperty({ type: 'string', description: '读者姓名' })
  name!: string

  @agentProperty({ type: 'string', description: '联系方式', sensitive: true })
  phone!: string

  @agentMethod({
    params: z.object({ bookId: z.string() }),
    returns: 'string',
    description: '借阅一本图书',
  })
  borrowBook(bookId: string): string {
    // 业务逻辑
  }
}
```

---

## 5. BaseNode

### 5.1 定位

BaseNode 是 Layer 3（行为层）的核心载体：

- 持有节点 ID，承载 `@agentMethod` 标注的业务方法
- 通过 Registry 反射获取属性、能力、关系 Schema
- 不再直接持有 GraphStore 引用（V6 的 WeakMap 模式废弃）

### 5.2 接口定义

```typescript
export abstract class BaseNode {
  id: NodeId

  constructor(id: NodeId)

  /** 获取当前实例的方法能力列表（从 AgentMethodRegistry 反射） */
  getCapabilities(): MethodSchema[]

  /** 获取当前实例的属性值（从 AgentPropertyRegistry 反射 + 实例取值） */
  getProperties(): Record<string, unknown>

  /** 获取当前实例类声明的关系 Schema（从 AgentRelationRegistry 反射） */
  getRelationSchemas(): RelationRegistryEntry[]
}
```

### 5.3 与 V6 的变化

| 项目 | V6 | V8 | 原因 |
|------|----|----|------|
| `getGraphStore()` | 通过 WeakMap 持有 | **移除** | V8 通过 NodeInstanceContainer 解耦，BaseNode 不应感知 Store |
| `setNodeGraphStore()` | WeakMap 注册 | **移除** | 同上 |
| `getNodeGraphStore()` | WeakMap 获取 | **移除** | 同上 |
| 构造函数 | `constructor(id)` | 不变 | 稳定接口 |
| 其他方法 | 不变 | 不变 | — |

### 5.4 NodeInstanceContainer 与 BaseNode 的关系

`NodeInstanceContainer` 在 ontology 模块内定义，作为行为层（Layer 3）获取 BaseNode 实例的标准接口：

```typescript
// src/v8/ontology/base-node.ts
export interface NodeInstanceContainer {
  getBaseNode(id: string): Promise<BaseNode | undefined>
}
```

- 异步化：`getBaseNode` 返回 `Promise<BaseNode | undefined>`，适配未来从 SQL/REST 等远程数据源动态恢复 BaseNode 实例的场景
- BaseNode 实例由 `InMemoryGraphStore`（或未来的 `SqlNodeContainer`）实现该接口，提供给 `call_method` / `describe_method` 工具
- BaseNode 自身不再感知其容器（V6 的 WeakMap 模式废弃）

---

## 6. Ontology Builder

### 6.1 接口

```typescript
export type OntologyBuildOpts = {
  version: string
  /** 手动补充的边类型声明（向后兼容；通常不再需要，@agentRelations 会自动收集） */
  relations?: RelationSchema[]
}

export function buildOntology(opts: OntologyBuildOpts): Ontology
```

### 6.2 构建逻辑

```text
buildOntology()
  │
  ├── AgentRegistry.getRelationSchemas()  → 自动收集 @agentRelations 声明
  │
  ├── opts.relations                      → 手动补充（dedup by fromType:type:toType）
  │
  ├── AgentRegistry.getRegisteredClasses() → 遍历每个类
  │   └── AgentRegistry.getTypeSchema()   → 组装 TypeSchema
  │
  ├── validateOntology(ontology)          → [新增] 跨引用校验：确保 relations 里的 fromType/toType 属于已注册 types，防止 typo
  │
  └── 返回 Ontology { version, types, relations }
```

去重策略：自动收集优先，手动补充去重。key = `${fromType}:${type}:${toType}`。

### 6.3 使用示例

```typescript
// 1. 装饰器副作用自动注册到全局 Registry
import './domain/reader'
import './domain/book'
import './domain/branch'

// 2. 构建 Ontology
const ontology = buildOntology({ version: '1.0.0' })

// 3. 注入到 RuntimeOrchestrator
const runtime = new SemanticRuntimeOrchestrator({
  graphStore, computeStore, vectorStore, factStore, ontology, ...
})
```

---

## 7. RelationBinding + Validation

### 7.1 定位

RelationBinding 是 **Schema（DDL）与物理存储（DML）之间的桥梁**：

- Schema 声明"存在什么关系"（如 `Reader --borrows--> Book`）
- Binding 说明"怎么从数据库查出这个关系的邻居"
- 两者独立，通过 `validateRelationBindings()` 校验一致性

### 7.2 类型定义

```typescript
export type RelationBinding =
  | JunctionBinding
  | ForeignKeyBinding
  | InverseForeignKeyBinding

/** 关联表：多对多或一对多事实表 */
export type JunctionBinding = {
  kind: 'junction'
  table: string
  fromColumn: string       // 指向源节点 id
  toColumn: string         // 指向目标节点 id
  /** 同一表多关系时用 where 区分 */
  where?: string
}

/** 源表上的外键列 → 目标表一行 */
export type ForeignKeyBinding = {
  kind: 'fk'
  onType: string           // 持有 FK 的实体类型
  column: string           // 如 branch_id
  toType: string           // 如 Branch
}

/** 目标表上的外键指向源（入边懒查时用） */
export type InverseForeignKeyBinding = {
  kind: 'inverse_fk'
  onType: string           // 持有 FK 的类型
  column: string           // 如 author_id
  fromType: string         // 如 Author
}

export type RelationBindingMap = Record<string, RelationBinding>
```

### 7.3 Validation

```typescript
/** 校验 RelationSchema 与 RelationBindingMap 的一致性 */
export function validateRelationBindings(
  relations: RelationSchema[],
  bindings: RelationBindingMap,
): void

/** 校验 Ontology 本身的一致性，防止 Schema 级别的 typo 引发 runtime 崩溃 */
export function validateOntology(ontology: Ontology): void
```

校验规则：

**validateRelationBindings：**
1. 每个 `RelationSchema.type` 在 `RelationBindingMap` 中必须有对应 binding
2. `RelationBindingMap` 中不应存在 `RelationSchema` 未声明 of 孤立 binding
3. 不满足时抛出 Error，列出缺失/孤立的条目

**validateOntology（[新增] 跨引用校验）：**
1. 确保所有的 `RelationSchema.fromType` 均在 `ontology.types` 的 `name` 列表中存在注册
2. 确保所有的 `RelationSchema.toType` 均在 `ontology.types` 的 `name` 列表中存在注册
3. 若检测到关系指向了未定义的实体类型，立即抛出明确的 Error（列出有问题的 type），防止 typo 或 domain 导入顺序不全导致 runtime 查询故障

### 7.4 与 V6 的变化

无变化。RelationBinding 类型与校验逻辑保持稳定，直接移植。

---

## 8. Tools

本模块提供两类工具：

- **Ontology Tools** — 本体 Schema 查询（Layer 1）
- **Method Tools** — 行为层方法执行（Layer 3 桥接）

### 8.1 工具列表

| 工具 | 职责 | 依赖 |
|------|------|------|
| `inspect_schema` | 查询本体的类型和关系 Schema | Ontology |
| `describe_method` | 获取节点方法的完整 Schema（参数、返回值、前置条件） | NodeInstanceContainer + AgentMethodRegistry |
| `call_method` | 调用节点上的已注册业务方法 | NodeInstanceContainer + AgentMethodRegistry + FactStore + PolicyContext |

### 8.2 inspect_schema

```typescript
export function createOntologyTools(ontology: Ontology) {
  const inspect_schema = tool({
    description:
      '查询本体的类型和关系 Schema。' +
      '可按类型名称过滤，不指定则返回全部。' +
      '用于了解领域模型中有哪些实体类型、它们的属性和关系。',
    inputSchema: z.object({
      typeName: z.string().optional().describe("要检查的特定类型名称（如 'Reader'）。不指定则返回全部类型。"),
    }),
    execute: async ({ typeName }): Promise<ToolResult> => {
      if (typeName) {
        const ts = getTypeSchema(ontology, typeName)
        if (!ts) {
          return toolErr('NOT_FOUND', `类型 '${typeName}' 在本体中未找到`, {
            expected: { availableTypes: ontology.types.map((t) => t.name) },
          })
        }
        const relations = getRelationsFor(ontology, typeName)
        return toolOk({ type: ts, relations })
      }

      return toolOk({
        types: ontology.types.map((t) => ({
          name: t.name,
          description: t.description,
          propertyCount: t.properties.length,
          methodCount: t.methods.length,
        })),
        relations: ontology.relations,
      })
    },
  })

  return { inspect_schema }
}
```

### 8.3 describe_method

获取节点方法的完整 Schema：参数 JSON Schema、返回值类型、描述、所需事实、相关规则、前置条件。Agent 在调用不熟悉的方法之前应先调用此工具。

```typescript
export function createMethodTools(
  container: NodeInstanceContainer,
  facts: FactStore,
  policy: PolicyContext,
) {
  const describe_method = tool({
    description:
      '获取方法的完整模式：参数、返回值、描述、所需事实和相关规则。' +
      '在调用不熟悉的方法之前，务必先调用此方法。',
    inputSchema: z.object({
      nodeId: z.string().describe('拥有该方法的节点'),
      method: z.string().describe('要描述的方法名称'),
    }),
    execute: async ({ nodeId, method }): Promise<ToolResult> => {
      // Policy 检查
      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      const node = await container.getBaseNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      const className = (node as any).agentTypeName || node.constructor.name
      const schema = AgentMethodRegistry.get(className, method)
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName)
        return toolErr('METHOD_NOT_FOUND', `Method '${method}' not found on ${className}`, {
          expected: { availableMethods: available },
        })
      }

      const paramsJsonSchema = schemaToJsonSchema(schema.params)

      return toolOk({
        methodName: schema.methodName,
        description: schema.description,
        params: (paramsJsonSchema.properties as Record<string, unknown>) ?? {},
        required: (paramsJsonSchema.required as string[]) ?? [],
        returns: schema.returns,
        requiredFacts: schema.requiredFacts ?? [],
        relatedRuleIds: schema.relatedRuleIds ?? [],
        preconditions: schema.preconditions ?? [],
      })
    },
  })
```

### 8.4 call_method

调用图节点上的已注册方法。包含前置条件校验、参数 Zod 校验、Policy 检查。

```typescript
  const call_method = tool({
    description:
      '调用图节点上的已注册方法。以命名键值对形式传递参数。' +
      '重要：在调用之前，从 FactStore (lookup_fact) 或 inspect_node 获取所有参数值 —— ' +
      '切勿为尚未获取的数值参数传递 0。',
    inputSchema: z.object({
      nodeId: z.string().describe('要调用方法的节点'),
      method: z.string().describe('方法名称'),
      args: z.record(z.string(), z.unknown()).default({}).describe('参数为 { paramName: value }'),
    }),
    execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
      // Policy 检查
      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      // 获取 BaseNode 实例（通过 NodeInstanceContainer，而非 InMemoryGraphStore）
      const node = await container.getBaseNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      // 查找方法 Schema
      const className = (node as any).agentTypeName || node.constructor.name
      const schema = AgentMethodRegistry.get(className, method)
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName)
        return toolErr('METHOD_NOT_FOUND', `Method '${method}' not found on ${className}`, {
          expected: { availableMethods: available },
        })
      }

      // 前置条件校验
      const preconditionError = assertPreconditions(nodeId, method, args, facts)
      if (preconditionError) {
        return toolErr('PRECONDITION_FAILED', preconditionError, { retryable: true })
      }

      // 参数 Zod 校验
      const parseResult = schema.params.safeParse(args)
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        return toolErr('INVALID_ARGS', `Invalid args for ${method}: ${issues.join('; ')}`, {
          expected: {
            params: Object.keys(
              (schemaToJsonSchema(schema.params).properties as Record<string, unknown>) ?? {},
            ),
          },
        })
      }

      // 反射调用
      const fn = (node as unknown as Record<string, unknown>)[method]
      if (typeof fn !== 'function') {
        return toolErr('INTERNAL_ERROR', `${method} is not callable`)
      }

      const result = (fn as (args: unknown) => unknown).call(node, parseResult.data)
      return toolOk(result)
    },
  })

  return { describe_method, call_method }
}
```

### 8.5 辅助函数

```typescript
/** 将 Zod Schema 转换为 JSON Schema（用于 describe_method 输出） */
function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  if ('toJSONSchema' in schema && typeof schema.toJSONSchema === 'function') {
    return (schema as unknown as { toJSONSchema: () => Record<string, unknown> }).toJSONSchema()
  }
  return {}
}

/** 前置条件断言：防止 Agent 对未获取的参数传入 0，并执行声明的 MethodPrecondition 检查 */
function assertPreconditions(
  nodeId: string,
  methodName: string,
  args: Record<string, unknown>,
  facts: FactStore,
): string | null {
  const node_facts = facts.forEntity(nodeId)
  const factsByProperty = new Map(node_facts.map((f) => [f.property, f.value]))

  // 1. 0 默认值安全防护
  for (const [paramName, paramValue] of Object.entries(args)) {
    if (paramValue === 0) {
      const bound = factsByProperty.get(paramName)
      if (bound !== undefined && bound !== 0) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but FactStore has bound value ${JSON.stringify(bound)}. ` +
          `Use lookup_fact to get the correct value before calling this method.`
        )
      }
      if (bound === undefined) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but no fact binding found for ${nodeId}.${paramName}. ` +
          `Collect the fact with inspect_node / bind_fact first.`
        )
      }
    }
  }

  // 2. MethodPrecondition 校验执行（从 Registry 查找该方法已注册的 preconditions 并遍历校验：
  // 'must_be_positive' | 'must_be_non_empty_string' | 'must_be_in_facts'，不满足则返回对应 Precondition failed 错误提示）

  return null
}
```

### 8.6 与 V6 的关键差异

| 项目 | V6 | V8 | 原因 |
|------|----|----|------|
| 方法工具的依赖 | `GraphStore`（持有 `getBaseNode`） | `NodeInstanceContainer`（接口解耦） | V8 三层解耦原则 |
| `createMethodTools` 签名 | `(graph: GraphStore, facts, policy)` | `(container: NodeInstanceContainer, facts, policy)` | 依赖抽象容器，而非具体 Store |
| Policy 检查 | V6 已有 | 保留，使用 V8 的 `checkEntityAccess` | 一致性 |

### 8.7 与 V8 Tool 体系的集成

- `inspect_schema` 不经过 `RuntimeOrchestrator` 路由，直接读取 `Ontology` 对象（纯内存，无 Store 交互）
- `describe_method` / `call_method` 也不经过 `RuntimeOrchestrator`，直接操作 `NodeInstanceContainer` + `AgentMethodRegistry`
- 若需 Policy 过滤，在 `execute` 中加入 Policy 检查

---

## 9. System Prompt 集成

### 9.1 buildOntologyPrompt()

```typescript
/** 将 Ontology 序列化为 System Prompt 片段 */
export function buildOntologyPrompt(ontology: Ontology): string {
  const typeLines = ontology.types.map((t) => {
    const props = t.properties
      .filter((p) => p.agentVisible !== false && p.sensitive !== true)
      .map((p) => `    ${p.name}: ${p.type} — ${p.description}`)
      .join('\n')
    const methods = t.methods
      .map((m) => `    ${m.name}() — ${m.description}`)
      .join('\n')
    return `- ${t.name}: ${t.description}\n  属性:\n${props}\n  方法:\n${methods}`
  })

  const relLines = ontology.relations.map(
    (r) => `- ${r.fromType} --${r.type}--> ${r.toType}: ${r.description}`,
  )

  return [
    '# 本体 Schema',
    '',
    '## 实体类型',
    ...typeLines,
    '',
    '## 关系类型',
    ...relLines,
  ].join('\n')
}
```

### 9.2 在 Agent 中的使用

```typescript
const systemPrompt = [
  '你是支付领域分析助手。',
  buildOntologyPrompt(ontology),
  '',  // 其他 prompt 规则...
].join('\n')
```

---

## 10. 目录结构

```text
src/v8/ontology/
├── index.ts                   — 模块导出
├── schema.ts                  — TypeSchema / RelationSchema / Ontology + 辅助函数
├── relation-binding.ts        — RelationBinding / RelationBindingMap
├── validate-bindings.ts       — validateRelationBindings()
├── registry.ts                — AgentTypeRegistry / AgentPropertyRegistry / AgentMethodRegistry / AgentRelationRegistry / AgentRegistry
├── decorator.ts               — @agentType / @agentProperty / @agentMethod / @agentRelations
├── builder.ts                 — buildOntology()
├── base-node.ts               — BaseNode 抽象基类
├── prompt.ts                  — buildOntologyPrompt()
├── tools.ts                   — createOntologyTools() (inspect_schema)
└── method-tools.ts            — createMethodTools() (describe_method / call_method)
```

### 10.1 依赖关系

```text
decorator.ts ──→ registry.ts ──→ schema.ts
                                     │
builder.ts   ──→ registry.ts         │
              ──→ schema.ts ─────────┘

base-node.ts ──→ registry.ts

tools.ts     ──→ schema.ts
              ──→ engine/runtime/types.ts (ToolResult)

method-tools.ts ──→ registry.ts
                 ──→ base-node.ts (BaseNode, NodeInstanceContainer)
                 ──→ engine/runtime/types.ts (ToolResult)
                 ──→ engine/stores/fact-store.ts (FactStore)
                 ──→ policy/context.ts (PolicyContext)
                 ──→ policy/filters.ts (checkEntityAccess)

prompt.ts    ──→ schema.ts

validate-bindings.ts ──→ schema.ts
                      ──→ relation-binding.ts
```

### 10.2 外部依赖

ontology 模块依赖 engine 模块的 `ToolResult` / `toolOk` / `toolErr` 类型。对于 `BaseNode`，engine 模块依赖 ontology 模块（`NodeInstanceContainer.getBaseNode` 返回 `BaseNode`）。为避免循环依赖：

- `base-node.ts` 定义在 ontology 模块内（纯类型 + 抽象类，不依赖 engine）
- engine 模块 import ontology 的 `BaseNode`
- ontology 的 `tools.ts` import engine 的 `ToolResult` 类型

```text
ontology ──(ToolResult 类型依赖)──→ engine
engine  ──(BaseNode 类型依赖)──→ ontology
```

这是单向可解的：`ToolResult` 等工具结果类型可从 `engine/runtime/types.ts` 导入；`BaseNode` 从 `ontology/base-node.ts` 导入。两者不构成循环。

---

## 11. 实现优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | `schema.ts` | 核心类型定义，其他模块的基础 |
| P0 | `registry.ts` | Registry 实现，装饰器的目标 |
| P0 | `decorator.ts` | 装饰器，用户 API 入口 |
| P0 | `base-node.ts` | BaseNode 抽象类，Layer 3 载体 |
| P0 | `builder.ts` | buildOntology()，本体构建入口 |
| P0 | `method-tools.ts` | describe_method + call_method，行为层工具 |
| P1 | `relation-binding.ts` | RelationBinding 类型，为 SqlGraphStore 预备 |
| P1 | `validate-bindings.ts` | 校验逻辑，配合 RelationBinding 使用 |
| P1 | `prompt.ts` | buildOntologyPrompt()，Agent Prompt 集成 |
| P1 | `tools.ts` | inspect_schema 工具，Agent 可调用 |
| P2 | 测试 | 单元测试 + 与 engine 的集成测试 |

---

## 12. 从 V6 迁移清单

### 12.1 直接移植（无需修改）

| 源文件 | 目标文件 | 说明 |
|--------|----------|------|
| `v6/ontology/schema.ts` | `v8/ontology/schema.ts` | 类型定义 + 辅助函数 |
| `v6/ontology/relation-binding.ts` | `v8/ontology/relation-binding.ts` | Binding 类型 |
| `v6/ontology/validate-bindings.ts` | `v8/ontology/validate-bindings.ts` | 校验逻辑 |
| `v6/runtime/registry.ts` | `v8/ontology/registry.ts` | Registry 全套 |

### 12.2 需修改移植

| 源文件 | 目标文件 | 修改点 |
|--------|----------|--------|
| `v6/runtime/decorator.ts` | `v8/ontology/decorator.ts` | `agentVisible` 默认值 `false` → `true` |
| `v6/runtime/ontology-builder.ts` | `v8/ontology/builder.ts` | 无逻辑修改，路径调整 |
| `v6/runtime/graph.ts` | `v8/ontology/base-node.ts` | 移除 `getGraphStore()` / WeakMap 相关代码 |
| `v6/agent/tools/method.ts` | `v8/ontology/method-tools.ts` | `GraphStore` → `NodeInstanceContainer`；import 路径调整 |

### 12.3 新增

| 目标文件 | 说明 |
|----------|------|
| `v8/ontology/prompt.ts` | 新增：buildOntologyPrompt() |
| `v8/ontology/tools.ts` | 从 `v6/agent/tools/ontology.ts` 适配为 V8 tool 体系 |
| `v8/ontology/index.ts` | 模块导出 |

### 12.4 废弃项（不迁移）

| V6 项 | 原因 |
|-------|------|
| `BaseNode.getGraphStore()` | V8 通过 NodeInstanceContainer 解耦 |
| `setNodeGraphStore()` / `getNodeGraphStore()` | WeakMap 模式废弃 |
| `BaseNode.resolveRelation` / `resolveAllRelations` | 已在 V6 标记废弃 |
| 方法级 `@agentRelation` | 已迁移至类级 `@agentRelations` |

---

## 13. 与 Engine 的集成点

### 13.1 Ontology → Engine

```typescript
// 1. Ontology 传给 RuntimeOrchestrator，用于 System Prompt 和类型校验
const runtime = new SemanticRuntimeOrchestrator({
  ontology,   // ← Ontology 实例
  graphStore, computeStore, vectorStore, factStore,
  config, workspace,
})

// 2. RelationBinding + validateRelationBindings
// SqlGraphStore 启动时校验
validateRelationBindings(ontology.relations, bindings)
```

### 13.2 Engine → Ontology

```typescript
// 1. InMemoryGraphStore implements NodeInstanceContainer
//    → 异步返回 BaseNode 实例（来自 ontology 模块）
class InMemoryGraphStore implements GraphStore, NodeInstanceContainer {
  async getBaseNode(id: string): Promise<BaseNode | undefined> { ... }
}

// 2. describe_method / call_method 工具通过 NodeInstanceContainer 获取 BaseNode
//    → 反射查询/调用 @agentMethod 标注的方法
//    调用链：Agent → method-tools → await container.getBaseNode() → BaseNode 实例
```

### 13.3 集成验证

端到端验证路径：

```text
1. 定义领域实体（@agentType + @agentProperty + @agentMethod + @agentRelations）
2. buildOntology() 构建 Ontology
3. 实例化 BaseNode 子类，加入 InMemoryGraphStore
4. inspect_schema 工具查询 Ontology
5. call_method 工具调用 BaseNode 上的方法
6. graph_query 工具查询关系（依赖 RelationSchema + RelationBinding）
```

---

## 附录 A：完整类型导出清单

```typescript
// schema.ts
export type { TypeProperty, TypeMethod, TypeSchema, RelationSchema, Ontology }
export { getTypeSchema, getRelationsFor, getRelationByType }

// relation-binding.ts
export type { RelationBinding, JunctionBinding, ForeignKeyBinding, InverseForeignKeyBinding, RelationBindingMap }

// validate-bindings.ts
export { validateRelationBindings }

// registry.ts
export type { TypeSchemaEntry, PropertySchema, PropertySchemaConfig, MethodSchema, MethodSchemaConfig, MethodPrecondition, RelationRegistryEntry }
export { AgentTypeRegistry, AgentPropertyRegistry, AgentMethodRegistry, AgentRelationRegistry, AgentRegistry }

// decorator.ts
export type { TypeSchemaConfig, RelationSchemaConfig }
export { agentType, agentProperty, agentMethod, agentRelations }

// builder.ts
export type { OntologyBuildOpts }
export { buildOntology }

// base-node.ts
export { BaseNode }
export type { NodeId, NodeInstanceContainer }

// prompt.ts
export { buildOntologyPrompt }

// tools.ts
export { createOntologyTools }

// method-tools.ts
export { createMethodTools }
```

## 附录 B：V6 → V8 Import 路径变更

| V6 路径 | V8 路径 |
|---------|---------|
| `@/v6/ontology/schema` | `@/v8/ontology/schema` |
| `@/v6/ontology/relation-binding` | `@/v8/ontology/relation-binding` |
| `@/v6/ontology/validate-bindings` | `@/v8/ontology/validate-bindings` |
| `@/v6/runtime/registry` | `@/v8/ontology/registry` |
| `@/v6/runtime/decorator` | `@/v8/ontology/decorator` |
| `@/v6/runtime/ontology-builder` | `@/v8/ontology/builder` |
| `@/v6/runtime/graph` (BaseNode) | `@/v8/ontology/base-node` |
| `@/v6/agent/tools/ontology` | `@/v8/ontology/tools` |
| `@/v6/agent/tools/method` | `@/v8/ontology/method-tools` |
