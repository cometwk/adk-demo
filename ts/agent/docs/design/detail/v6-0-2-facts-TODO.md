# V6.0.2 Facts 改造方案：虚拟 Scope ID

> **状态**: 待评估 / TODO
> **创建日期**: 2026-05-06
> **关联文档**: `v6-0-2-facts.md`, `v6-0-dual-track-verdict.md`

---

## 问题背景

当前 `bind_fact` 工具强制要求 `entityId` 参数，假设每条事实都属于某个具体实体。但以下两类事实无法归属到单一实体：

1. **聚合结果** (`aggregation`): 如"团队总负载=120"，不属于任何单个工程师
2. **推导结论** (`derived`): 如"团队是否过载"，是规则引擎基于多个事实推导的结论

**当前代码的临时处理**：`aggregate_facts` 返回的 hint 建议绑定到"相关实体"，但未解决归属问题。

---

## 方案 B：虚拟 Scope ID 格式

### 核心概念

将 `entityId` 语义扩展为「命名空间标识符」：

| 格式 | 含义 | 示例 |
|------|------|------|
| `{entityId}` | 真实体归属 | `engineer-001` |
| `scope:{scopeId}` | 虚拟范围归属 | `scope:team-alpha`, `scope:project-001` |
| `scope:global` | 全局范围 | `scope:global` |

---

## 一、类型层改动

### 1. `FactBinding` 扩展（`src/v6/runtime/types.ts`）

```typescript
export type FactBinding = {
  entityId: string       // 实体ID 或 scope:{scopeId}
  property: string
  value: unknown
  source: FactSource
  confidence: number

  // NEW: 记录聚合/推导的来源实体
  derivedFrom?: string[] // 对于 aggregation/derived，记录原始实体列表

  // Time dimension
  validFrom: string
  validUntil?: string
  observedAt: string
}

// NEW: 辅助函数识别 scope 类型
export function isScopeId(id: string): boolean {
  return id.startsWith('scope:')
}

export function parseScopeId(id: string): { type: 'entity' | 'scope'; id: string; scopeKind?: string } {
  if (id.startsWith('scope:')) {
    const parts = id.split(':')
    return { type: 'scope', id: parts.slice(1).join(':'), scopeKind: parts[1] }
  }
  return { type: 'entity', id }
}
```

### 2. `FactSource` 增加 `derivedFrom` 关联

```typescript
export type FactSource = {
  kind: FactSourceKind
  ref?: string
  // NEW: 聚合来源的可追溯性
  derivedFrom?: string[] // 参与计算的原始实体 ID 列表
}
```

---

## 二、工具层改动（`src/v6/agent/tools/facts.ts`）

### 1. `bind_fact` 参数扩展

```typescript
inputSchema: z.object({
  entityId: z.string().describe(
    '归属命名空间。可以是实体ID（如 engineer-001），' +
    '或虚拟scope（如 scope:team-alpha, scope:global）。' +
    '聚合结果应绑定到 scope:'
  ),
  property: z.string(),
  value: z.unknown(),
  sourceKind: z.enum([...]).default('graph_property'),
  sourceRef: z.string().optional(),
  derivedFrom: z.array(z.string()).optional().describe(
    '原始实体ID列表。aggregation/derived 类型必填，用于追溯'
  ),
  confidence: z.number().min(0).max(1).default(0.9),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
})
```

### 2. `aggregate_facts` 自动生成 scope

```typescript
execute: async ({ entityIds, property, operation }): Promise<ToolResult> => {
  // ... 计算逻辑 ...

  // NEW: 自动生成虚拟 scope ID
  // 规则：scope:{operation}:{property}:{参与实体hash前8位}
  const scopeHash = entityIds.join(',').slice(0, 8).replace(/[^a-zA-Z0-9]/g, '_')
  const scopeId = `scope:agg:${property}_${operation}_${scopeHash}`

  // 自动绑定聚合结果
  const now = new Date().toISOString()
  const aggregationBinding: FactBinding = {
    entityId: scopeId,
    property: `${property}_${operation}`, // e.g. "workload_sum"
    value: result,
    source: {
      kind: 'aggregation',
      derivedFrom: entityIds,
    },
    derivedFrom: entityIds,
    confidence: 0.95, // 聚合计算置信度较高
    validFrom: now,
    observedAt: now,
  }

  _mutableBindings.push(aggregationBinding)

  return toolOk({
    result,
    scopeId,          // NEW: 返回生成的 scope ID
    property: `${property}_${operation}`,
    derivedFrom: entityIds,
    entityCount: values.length,
    missingEntities: missing.length > 0 ? missing : undefined,
    hint: `Aggregation auto-bound to ${scopeId}.${property}_${operation}=${result}`,
  })
}
```

### 3. 新增 `bind_derived` 工具（规则引擎专用）

```typescript
const bind_derived = tool({
  description: '规则引擎推导结果的绑定入口。将推理规则计算的值绑定到 scope。',
  inputSchema: z.object({
    scopeId: z.string().describe('目标scope，如 scope:team-alpha 或 scope:global'),
    property: z.string().describe('推导属性名，如 is_overloaded'),
    value: z.unknown(),
    ruleId: z.string().describe('产生此结果的规则ID'),
    derivedFrom: z.array(z.string()).describe('作为输入的实体ID或scope列表'),
    confidence: z.number().min(0).max(1).default(0.8),
  }),
  execute: async ({ scopeId, property, value, ruleId, derivedFrom, confidence }) => {
    // 无需权限检查（scope 不对应真实体）
    const binding: FactBinding = {
      entityId: scopeId,
      property,
      value,
      source: { kind: 'derived', ref: ruleId, derivedFrom },
      derivedFrom,
      confidence,
      validFrom: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    }

    _mutableBindings.push(binding)
    return toolOk({ bound: true, scopeId, property, value })
  },
})
```

---

## 三、FactStore 扩展（`src/v6/runtime/eventStore.ts`）

```typescript
export class FactStore {
  // ... 现有方法 ...

  // NEW: 按 scope 查询
  forScope(scopeId: string): FactBinding[] {
    return [...this.bindings.values()].filter(b => b.entityId === scopeId)
  }

  // NEW: 查询某 scope 的所有 derivedFrom 来源
  getDerivedFrom(scopeId: string): string[] | undefined {
    const bindings = this.forScope(scopeId)
    if (bindings.length === 0) return undefined
    // 合并所有 derivedFrom
    const allSources = bindings.flatMap(b => b.derivedFrom ?? [])
    return [...new Set(allSources)]
  }

  // NEW: 追溯某个事实的完整证据链
  traceEvidence(entityId: string, property: string): FactBinding[] {
    const binding = this.get(entityId, property)
    if (!binding) return []

    const chain: FactBinding[] = [binding]

    // 递归追溯 derivedFrom
    if (binding.derivedFrom) {
      for (const srcId of binding.derivedFrom) {
        // 如果 srcId 是 scope，追溯其属性
        if (isScopeId(srcId)) {
          const srcBindings = this.forScope(srcId)
          chain.push(...srcBindings)
        } else {
          // srcId 是实体，追溯到其相关事实（按 property 匹配）
          // 这里简化处理，实际可能需要更复杂的逻辑
        }
      }
    }

    return chain
  }

  // NEW: 验证事实来源合法性（判决双轨制）
  validateSource(binding: FactBinding): { valid: boolean; reason?: string } {
    if (binding.source.kind === 'graph_property') {
      // graph_property 必须绑定到真实体
      if (isScopeId(binding.entityId)) {
        return { valid: false, reason: 'graph_property cannot bind to scope' }
      }
      return { valid: true }
    }

    if (binding.source.kind === 'aggregation') {
      // aggregation 必须有 derivedFrom
      if (!binding.derivedFrom || binding.derivedFrom.length === 0) {
        return { valid: false, reason: 'aggregation must have derivedFrom' }
      }
      // 验证 derivedFrom 的实体事实是否已绑定
      for (const srcId of binding.derivedFrom) {
        if (!isScopeId(srcId) && !this.has(srcId, binding.property)) {
          return { valid: false, reason: `Missing source fact: ${srcId}.${binding.property}` }
        }
      }
      return { valid: true }
    }

    return { valid: true }
  }
}
```

---

## 四、Policy 层改动（`src/v6/policy/filters.ts`）

```typescript
export function checkEntityAccess(entityId: string, policy: PolicyContext): boolean {
  // NEW: scope 不需要权限检查
  if (isScopeId(entityId)) {
    return true // scope 是虚拟命名空间，无权限限制
  }
  // 真实体走现有权限逻辑
  return policy.allowedEntities.includes(entityId) || policy.role === 'admin'
}
```

---

## 五、使用示例

```typescript
// 1. Agent 绑定实体属性（graph_property）
bind_fact({
  entityId: 'engineer-001',
  property: 'workload',
  value: 45,
  sourceKind: 'graph_property'
})

// 2. 调用聚合工具
aggregate_facts({
  entityIds: ['engineer-001', 'engineer-002', 'engineer-003'],
  property: 'workload',
  operation: 'sum'
})
// 返回: { result: 135, scopeId: 'scope:agg:workload_sum_eng_001', ... }
// 自动绑定到 scope

// 3. 规则引擎推导
bind_derived({
  scopeId: 'scope:team-alpha',
  property: 'is_overloaded',
  value: true,
  ruleId: 'rule-overload-threshold',
  derivedFrom: ['scope:agg:workload_sum_eng_001', 'engineer-001', 'engineer-002']
})

// 4. 追溯证据链
const evidence = store.traceEvidence('scope:team-alpha', 'is_overloaded')
// 返回完整推导链：derived -> aggregation -> graph_property
```

---

## 六、关键设计决策点

| 决策点 | 当前方案 | 待评估 |
|--------|----------|--------|
| scope ID 格式 | `scope:{kind}:{id}` | 是否需要更结构化？ |
| 聚合自动绑定 | aggregate_facts 内部自动执行 | 还是让 Agent 手动 bind？ |
| derivedFrom 存储位置 | 同时存于 `FactBinding` 和 `FactSource` | 是否冗余？ |
| scope 属性命名 | `{property}_{operation}` | 是否够清晰？ |
| 权限控制 | scope 允许无限制访问 | 是否需要 scope 级权限？ |

---

## 七、影响范围

| 文件 | 改动类型 | 影响程度 |
|------|----------|----------|
| `src/v6/runtime/types.ts` | 扩展 FactBinding, 新增辅助函数 | 中 |
| `src/v6/runtime/eventStore.ts` | 新增 forScope, traceEvidence 等方法 | 中 |
| `src/v6/agent/tools/facts.ts` | 扩展 bind_fact, 修改 aggregate_facts, 新增 bind_derived | 高 |
| `src/v6/policy/filters.ts` | 新增 scope 识别逻辑 | 低 |

---

## 八、后续 TODO

- [ ] 评估 scope ID 格式的可读性和可扩展性
- [ ] 决定聚合是否自动绑定 vs Agent 手动绑定
- [ ] 设计 scope 级权限控制（如有需要）
- [ ] 实现 `bind_derived` 工具
- [ ] 编写单元测试覆盖 scope 相关场景
- [ ] 更新文档 `v6-0-2-facts.md` 反映最终设计