# V7 事实系统实现分析

基于 `docs/design/v7-0-2-facts.md` 设计文档，分析 `src/v7` 中的具体实现。

---

## 1. FactBinding 结构化绑定 (`runtime/types.ts:91-103`)

设计文档要求从扁平 KV 转为结构化对象，V7 的实现：

```typescript
export type FactBinding = {
  entityId: string        // 实体命名空间
  property: string        // 属性名
  value: unknown          // 值
  source: FactSource      // 来源（关键！）
  confidence: number      // 置信度 0..1
  validFrom: string       // 生效时间
  validUntil?: string     // 失效时间
  observedAt: string      // 记录时间
}
```

**来源类型 (`types.ts:79-89`)**:
- `graph_property` — 从图节点读取
- `method_result` — 方法调用返回
- `aggregation` — 聚合计算结果
- `user_input` — 用户直接输入
- `derived` — 推导计算

---

## 2. FactStore 实现 (`runtime/eventStore.ts:24-70`)

```typescript
export class FactStore {
  private bindings = new Map<string, FactBinding>()  // key = `${entityId}.${property}`

  get(entityId: string, property: string): FactBinding | undefined
  getValue(entityId: string, property: string): unknown
  forEntity(entityId: string): FactBinding[]    // 查询某实体所有绑定
  forProperty(property: string): FactBinding[]  // 查询某属性所有绑定
  has(entityId: string, property: string): boolean
  withDerived(additional: FactBinding[]): FactStore  // 合并推导事实
}
```

**冲突解决**: 构造时高置信度绑定优先。

---

## 3. bind_fact / lookup_fact 工具 (`agent/tools/facts.ts`)

### bind_fact (第 29-84 行) — 将事实写入 FactStore

```typescript
const bind_fact = tool({
  inputSchema: z.object({
    entityId: z.string(),
    property: z.string(),
    value: z.unknown(),
    sourceKind: z.enum(['graph_property', 'method_result', ...]),
    confidence: z.number().min(0).max(1).default(0.9),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
  }),
  execute: async ({ entityId, property, value, ... }) => {
    const binding: FactBinding = {
      entityId, property, value,
      source: { kind: sourceKind, ref: sourceRef },
      confidence,
      validFrom, validUntil,
      observedAt: new Date().toISOString(),
    }
    _mutableBindings.push(binding)  // 会话级绑定收集
    return toolOk({ bound: true, entityId, property, value, confidence })
  }
})
```

### lookup_fact (第 86-125 行) — 查询已绑定事实

```typescript
const lookup_fact = tool({
  inputSchema: z.object({
    entityId: z.string(),
    property: z.string(),
  }),
  execute: async ({ entityId, property }) => {
    const store = getSessionFactStore()
    const binding = store.get(entityId, property)
    if (!binding) {
      return toolOk({
        found: false,
        hint: `No fact bound for ${entityId}.${property}. Use inspect_node then bind_fact.`,
      })
    }
    return toolOk({ found: true, value: binding.value, confidence, source, ... })
  }
})
```

---

## 4. call_method 前置断言 (`agent/tools/method.ts:25-70`)

防止 V5 的"盲零调用"问题：

```typescript
function assertPreconditions(nodeId: string, methodName: string, args: Record<string, unknown>, facts: FactStore): string | null {
  const node_facts = facts.forEntity(nodeId)
  const factsByProperty = new Map(node_facts.map(f => [f.property, f.value]))

  for (const [paramName, paramValue] of Object.entries(args)) {
    if (paramValue === 0) {
      const bound = factsByProperty.get(paramName)
      // 如果 FactStore 有非零绑定，说明传入 0 是错误的
      if (bound !== undefined && bound !== 0) {
        return `Precondition failed: arg '${paramName}' is 0 but FactStore has ${bound}. Use lookup_fact first.`
      }
      // 如果 FactStore 没有记录，说明没有先获取值
      if (bound === undefined) {
        return `Precondition failed: no fact binding for ${nodeId}.${paramName}. Collect with bind_fact first.`
      }
    }
  }
  return null
}
```

**call_method 执行时检查 (第 143-149 行)**:

```typescript
const preconditionError = assertPreconditions(nodeId, method, args, facts)
if (preconditionError) {
  return toolErr('PRECONDITION_FAILED', preconditionError, { retryable: false })
}
```

---

## 5. 规则自动评估 (`ontology/rules.ts` + `agent/tools/rules.ts`)

### 规则结构 (`rules.ts:54-70`)

```typescript
export type Rule = {
  id: string
  kind: RuleKind                    // hard_constraint / inference_rule / soft_criterion
  appliesTo: string[]               // 适用实体类型
  requiredFacts: RequiredFact[]     // 所需事实声明
  evaluator: (ctx: RuleContext) => RuleResult
}
```

### evaluate_rule 工具 (`rules.ts:52-89`) — 系统按命名空间自动绑定评估

```typescript
const evaluate_rule = tool({
  inputSchema: z.object({
    ruleId: z.string(),
    entityId: z.string().optional(),
  }),
  execute: async ({ ruleId, entityId }) => {
    const evaluated = evaluateSingleRule(ruleId, facts, graph, entityId)
    return toolOk({
      triggered: evaluated.result.triggered,
      severity: evaluated.result.severity,
      missingFacts: evaluated.result.missingFacts,  // 系统自动检测缺失事实
    })
  }
})
```

---

## 6. 反事实推理支持 (`runtime/eventStore.ts:130-136`)

```typescript
// 用于 but-for test 的"擦除事件"功能
eraseEvent(eventId: string): EventStore {
  const clone = new EventStore()
  for (const e of this.events) {
    if (e.id !== eventId) clone.addEvent(e)
  }
  return clone
}
```

**attribution.ts 的 but-for 测试 (第 48-76 行)** 实际使用此功能：

```typescript
function butForScore(causeEventId, outcomeEventId, eventStore): number {
  const counterfactualStore = eventStore.eraseEvent(causeEventId)  // 创建反事实场景
  // 检查结果事件是否还存在...
}
```

---

## 总结对比

| 维度 | V5 | V7 实现 |
|------|----|----|
| 数据结构 | `Record<string, any>` | `FactBinding(entityId, property, value, source, confidence, validFrom/Until)` |
| 归属 | 无，硬编码变量名 | `entityId + property` 组合键 |
| 来源追溯 | 弱 | 强，`source.kind + source.ref` |
| 盲调用防护 | 无 | `assertPreconditions` 检查零值参数 |
| 规则评估 | LLM 手动匹配 | `evaluate_rule` 自动绑定 `requiredFacts` |
| 反事实 | 无 | `eraseEvent` + `butForScore` |