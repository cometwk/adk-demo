import { tool } from 'ai'
import { z } from 'zod'
import { type ToolResult, toolOk, toolErr } from '../../runtime/types'
import { getRuleById, getRules, queryRules } from '../../ontology/rules'
import { evaluateSingleRule } from '../../ontology/ruleDag'
import type { FactStore } from '../../runtime/eventStore'
import type { Graph } from '../../provider/in-memory'
import type { PolicyContext } from '../../policy/context'
import { maybeLogToolCall } from '../../policy/filters'

// ── Rule inspection tools ──
//
// These tools give the executor read-only access to the rule set.
// The executor CANNOT modify rules or weights.
// Fine-grained evaluate_rule replaces V5's evaluate_candidates as the scoring oracle.

export function createRuleTools(facts: FactStore, graph: Graph, policy: PolicyContext) {
  const inspect_rules = tool({
    description:
      '列出适用于给定实体类型和/或意图的规则。返回规则元数据（id, kind, description, direction, weight, requiredFacts）。' +
      '在调用 evaluate_rule 之前使用此方法，以了解哪些规则适用。',
    inputSchema: z.object({
      entityType: z.string().optional().describe("按实体类型过滤（如 'Engineer', 'Project'）"),
      intent: z.string().optional().describe("按意图关键词过滤（如 'risk_assessment', 'diagnosis'）"),
      kind: z
        .enum(['hard_constraint', 'soft_criterion'])
        .optional()
        .describe('按规则类型过滤'),
    }),
    execute: async ({ entityType, intent, kind }): Promise<ToolResult> => {
      maybeLogToolCall('inspect_rules', { entityType, intent, kind }, policy)

      const rules = queryRules({ entityType, intent, kind })
      return toolOk({
        rules: rules.map((r) => ({
          id: r.id,
          version: r.version,
          kind: r.kind,
          appliesTo: r.appliesTo,
          description: r.description,
          direction: r.direction,
          weight: r.weight,
          requiredFacts: r.requiredFacts,
        })),
      })
    },
  })

  const evaluate_rule = tool({
    description:
      '针对特定实体，使用当前 FactStore 评估单个规则。' +
      '返回 triggered, severity, explanation, missingFacts。' +
      '注意：你无法控制评分权重。请记录证据而非解读分数。',
    inputSchema: z.object({
      ruleId: z.string().describe('要评估的规则 ID'),
      entityId: z.string().optional().describe('要评估规则的实体 ID'),
    }),
    execute: async ({ ruleId, entityId }): Promise<ToolResult> => {
      maybeLogToolCall('evaluate_rule', { ruleId, entityId }, policy)

      const rule = getRuleById(ruleId)
      if (!rule) {
        const available = getRules().map((r) => r.id)
        return toolErr('NOT_FOUND', `Rule '${ruleId}' not found`, {
          expected: { availableRuleIds: available },
        })
      }

      const evaluated = evaluateSingleRule(ruleId, facts, graph, entityId)
      if (!evaluated) {
        return toolErr('INTERNAL_ERROR', `Failed to evaluate rule '${ruleId}'`)
      }

      return toolOk({
        ruleId,
        entityId,
        kind: rule.kind,
        direction: rule.direction,
        triggered: evaluated.result.triggered,
        explanation: evaluated.result.explanation,
        missingFacts: evaluated.result.missingFacts ?? [],
        note: 'The critic uses this result for scoring. Do not attempt to infer the final score.',
      })
    },
  })

  return { inspect_rules, evaluate_rule }
}
