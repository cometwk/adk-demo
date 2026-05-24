import { tool } from 'ai'
import { z } from 'zod'
import type { RuleRuntime } from '../runtime/rule-runtime'
import type { Workspace } from '../../engine/runtime/workspace'
import type { GraphStore } from '../../engine/stores/graph-store'
import type { PolicyContext } from '../../policy/context'
import type { ToolResult } from '../../engine/runtime/types'
import { toolOk, toolErr } from '../../engine/runtime/types'
import { checkEntityAccess, maybeLogToolCall } from '../../policy/filters'
import type { SystemVerdict } from '../types/verdict'
import type { SemanticVerdict } from '../../engine/agent/verdict'

// ── Rule Tools Factory ──

export function createRuleTools(
  runtime: RuleRuntime,
  workspace: Workspace,
  graphStore: GraphStore,
  policy: PolicyContext,
  getCurrentVerdict: () => SystemVerdict | undefined,
  setCurrentVerdict: (verdict: SystemVerdict) => void,
) {
  // ── inspect_rules ──
  const inspect_rules = tool({
    description:
      '查询已注册的规则元数据。可按实体类型、规则类型或意图过滤。返回规则列表（不含 evaluator 逻辑）。',
    inputSchema: z.object({
      entityType: z.string().optional().describe('按实体类型过滤（如 "Merch", "Reader"）'),
      kind: z.enum(['hard_constraint', 'soft_criterion']).optional().describe('按规则类型过滤'),
      intent: z.string().optional().describe('按意图关键词过滤（如 "risk_assessment", "compliance"）'),
    }),
    execute: async ({ entityType, kind, intent }): Promise<ToolResult> => {
      maybeLogToolCall('inspect_rules', { entityType, kind, intent }, policy)

      // TODO: Add type/intent permission check branch when policy expands
      const result = runtime.inspectRules({
        entityType,
        kind,
        intent,
      })

      return result
    },
  })

  // ── evaluate_rule ──
  const evaluate_rule = tool({
    description:
      '评估单条规则。返回规则是否触发、缺失事实、解释等。' +
      '注意：此结果用于 MCDA 评分，请勿尝试推断最终得分。',
    inputSchema: z.object({
      ruleId: z.string().describe('规则 ID'),
      entityId: z.string().optional().describe('实体 ID（可选，用于逐实体评估）'),
    }),
    execute: async ({ ruleId, entityId }): Promise<ToolResult> => {
      maybeLogToolCall('evaluate_rule', { ruleId, entityId }, policy)

      // Permission check: if entityId specified, verify access
      if (entityId && !checkEntityAccess(entityId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${entityId}' is denied`)
      }

      // Build RuleContext
      const facts = workspace.getFacts()
      const now = workspace.getSessionClock?.() ?? new Date()

      const ctx = {
        facts,
        graph: graphStore,
        entityId,
        now,
      }

      const result = await runtime.evaluateRule(ruleId, ctx)

      // Add note for agent
      if (result.ok) {
        return toolOk({
          ...result.data,
          note: 'The critic uses this result for scoring. Do not attempt to infer the final score.',
        })
      }

      return result
    },
  })

  // ── inspect_verdict ──
  const inspect_verdict = tool({
    description: '查看当前系统判决结果。返回推荐候选、评分排名、否决列表等。',
    inputSchema: z.object({}),
    execute: async (): Promise<ToolResult> => {
      maybeLogToolCall('inspect_verdict', {}, policy)

      const verdict = getCurrentVerdict()
      if (!verdict) {
        return toolErr('PRECONDITION_FAILED', 'No verdict has been generated yet')
      }

      return toolOk(verdict)
    },
  })

  // ── reconcile_verdict ──
  const reconcile_verdict = tool({
    description:
      '对比模型判决与系统判决的一致性。返回是否一致、双方候选 ID、冲突描述。',
    inputSchema: z.object({
      modelAnswer: z.string().describe('模型给出的结论（如 "HIGH", "LOW", "ALLOWED"）'),
      modelRationale: z.string().optional().describe('模型的推理理由'),
    }),
    execute: async ({ modelAnswer, modelRationale }): Promise<ToolResult> => {
      maybeLogToolCall('reconcile_verdict', { modelAnswer }, policy)

      const systemVerdict = getCurrentVerdict()
      if (!systemVerdict) {
        return toolErr('PRECONDITION_FAILED', 'No system verdict available for reconciliation')
      }

      const modelVerdict: SemanticVerdict = {
        answer: modelAnswer,
        rationale: modelRationale ?? 'Agent reasoning',
      }

      const result = runtime.reconcile({
        modelVerdict,
        systemVerdict,
      })

      return toolOk(result)
    },
  })

  return {
    inspect_rules,
    evaluate_rule,
    inspect_verdict,
    reconcile_verdict,
  }
}