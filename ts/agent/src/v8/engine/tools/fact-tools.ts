import { tool } from 'ai'
import { z } from 'zod'
import type { Workspace } from '../runtime/workspace'
import type { ToolResult, FactBinding } from '../runtime/types'
import { toolOk, toolErr } from '../runtime/types'
import type { PolicyContext } from '../../policy/context'
import { checkEntityAccess, maybeLogToolCall } from '../../policy/filters'

// ── Fact Tools (V8) ──
// bind_fact: Agent explicitly binds high-order semantic assertions
// lookup_fact: Read from FactStore snapshot
// Note: Low-order snapshot facts are auto-injected by RuntimeOrchestrator

export function createFactTools(workspace: Workspace, policy: PolicyContext) {
  // Helper to get current state as FactStore (read-only view)
  const getStore = () => workspace.getFacts()

  // bind_fact - explicit semantic assertion binding
  const bind_fact = tool({
    description:
      '将高阶语义断言记录到 FactStore。在分析完图过滤和列聚合数据后，显式写入推理结论。' +
      '示例："商户 Merch:M003 本月无交易且入驻不足30天，判定其符合退机考核条件"。' +
      '注意：Runtime 已自动注入低阶快照事实（如节点 ID、属性值），请勿重复绑定原始物理查询记录。',
    inputSchema: z.object({
      entityId: z.string().describe('属性所属的实体 ID'),
      property: z.string().describe("属性名称（如 'status', 'decision'）"),
      value: z.unknown().describe('属性值'),
      sourceKind: z
        .enum(['graph_property', 'compute_result', 'runtime_injection', 'user_input', 'derived'])
        .default('derived')
        .describe('该值的来源类型'),
      sourceRef: z.string().optional().describe('可选引用（evidenceId, nodeId）'),
      confidence: z.number().min(0).max(1).default(0.9).describe('置信度 0..1'),
      validFrom: z.string().optional().describe('ISO 8601: 该值开始生效的时间'),
      validUntil: z.string().optional().describe('ISO 8601: 该值失效的时间'),
    }),
    execute: async ({
      entityId,
      property,
      value,
      sourceKind,
      sourceRef,
      confidence,
      validFrom,
      validUntil,
    }): Promise<ToolResult> => {
      maybeLogToolCall('bind_fact', { entityId, property }, policy)

      if (!checkEntityAccess(entityId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${entityId}' is denied`)
      }

      const now = new Date().toISOString()
      const binding: FactBinding = {
        entityId,
        property,
        value,
        source: { kind: sourceKind, ref: sourceRef },
        confidence,
        validFrom: validFrom ?? now,
        validUntil,
        observedAt: now,
      }

      workspace.addBinding(binding)

      return toolOk({
        bound: true,
        entityId,
        property,
        value,
        confidence,
      })
    },
  })

  // lookup_fact - read from FactStore
  const lookup_fact = tool({
    description:
      '查询实体属性的已绑定事实值。返回绑定的值及其置信度、来源等信息。' +
      '如果事实尚未绑定，返回 null 并给出提示。',
    inputSchema: z.object({
      entityId: z.string().describe('实体 ID'),
      property: z.string().describe('属性名称'),
    }),
    execute: async ({ entityId, property }): Promise<ToolResult> => {
      maybeLogToolCall('lookup_fact', { entityId, property }, policy)

      if (!checkEntityAccess(entityId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${entityId}' is denied`)
      }

      const store = getStore()
      const binding = store.get(entityId, property)

      if (!binding) {
        return toolOk({
          found: false,
          entityId,
          property,
          hint: `No fact bound for ${entityId}.${property}. Use inspect_node or graph_query to obtain it.`,
        })
      }

      return toolOk({
        found: true,
        entityId,
        property,
        value: binding.value,
        confidence: binding.confidence,
        source: binding.source,
        validFrom: binding.validFrom,
        validUntil: binding.validUntil,
        observedAt: binding.observedAt,
      })
    },
  })

  return { bind_fact, lookup_fact }
}