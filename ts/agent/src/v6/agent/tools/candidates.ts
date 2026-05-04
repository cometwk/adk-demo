import { tool } from 'ai'
import { z } from 'zod'
import type { DecisionWorkspace } from '../../ontology/decision'
import type { PolicyContext } from '../../policy/context'
import { maybeLogToolCall } from '../../policy/filters'
import { type ToolResult, toolOk } from '../../runtime/types'

// ── Candidate and Evidence tools ──
//
// Note: evaluate_candidates is NOT included here (removed from V6).
// The executor's job is to collect facts and evidence.
// The critic does the scoring.

export function createCandidateTools(workspace: DecisionWorkspace, policy: PolicyContext) {
  const propose_candidates = tool({
    description:
      '为决策提出互斥的候选答案。必须在记录证据之前调用一次（或更新）。' +
      "示例: [{label:'HIGH',description:'...'}, {label:'MEDIUM',...}, {label:'LOW',...}]",
    inputSchema: z.object({
      candidates: z.array(
        z.object({
          label: z.string().describe('简短的答案标签（如 HIGH, MEDIUM, LOW）'),
          description: z.string().describe('对该候选的一句话解释'),
        })
      ),
    }),
    execute: async ({ candidates }): Promise<ToolResult> => {
      maybeLogToolCall('propose_candidates', { count: candidates.length }, policy)

      const added = candidates.map((c) => workspace.addCandidate(c.label, c.description))
      return toolOk({
        candidates: added.map((c) => ({ id: c.id, label: c.label })),
        hint: 'Now collect facts and evidence, then call record_evidence to link them to candidates.',
      })
    },
  })

  const record_evidence = tool({
    description:
      '记录一条证据并将其关联到一个或多个候选答案。基础置信度由来源类型决定；' +
      '你可以应用 {-0.2, 0, +0.2} 范围内的修正值。请引用与该证据相关的规则 ID。',
    inputSchema: z.object({
      sourceKind: z
        .enum(['property', 'method_result', 'rule_evaluation', 'aggregation', 'event', 'causal_path'])
        .describe('证据来源类型'),
      entityIds: z.array(z.string()).describe('该证据涉及的实体 ID'),
      relatedRuleIds: z.array(z.string()).describe('该证据相关的规则 ID'),
      content: z.string().describe('证据的人类可读描述'),
      baseConfidence: z.number().min(0).max(1).describe('基础置信度 0..1'),
      confidenceModifier: z.number().min(-0.2).max(0.2).default(0).describe('LLM 修正值 ∈ {-0.2, 0, +0.2}'),
      supportsCandidateIds: z.array(z.string()).default([]).describe('该证据支持的候选 ID'),
    }),
    execute: async ({
      sourceKind,
      entityIds,
      relatedRuleIds,
      content,
      baseConfidence,
      confidenceModifier,
      supportsCandidateIds,
    }): Promise<ToolResult> => {
      maybeLogToolCall('record_evidence', { entityIds, sourceKind }, policy)

      const confidence = Math.max(0, Math.min(1, baseConfidence + confidenceModifier))
      const ev = workspace.addEvidence({
        sourceKind,
        entityIds,
        relatedRuleIds,
        content,
        confidence,
        observedAt: new Date().toISOString(),
      })

      for (const candId of supportsCandidateIds) {
        workspace.linkEvidenceToCandidate(candId, ev.id)
      }

      return toolOk({
        evidenceId: ev.id,
        confidence,
        linkedCandidates: supportsCandidateIds,
      })
    },
  })

  const list_workspace = tool({
    description: '列出当前工作区状态：候选、证据和不确定性。',
    inputSchema: z.object({}),
    execute: async (): Promise<ToolResult> => {
      return toolOk({
        candidates: workspace.listCandidates(),
        evidence: workspace.listEvidence().map((e) => ({
          id: e.id,
          sourceKind: e.sourceKind,
          content: e.content.slice(0, 100),
          confidence: e.confidence,
        })),
        uncertainties: workspace.listUncertainties(),
        triggeredRuleIds: workspace.listTriggeredRules(),
      })
    },
  })

  const declare_uncertainty = tool({
    description:
      '记录已知的不确定性 —— 缺失的事实或模糊的信号会影响置信度。' + '系统会在最终响应中展示未解决的不确定性。',
    inputSchema: z.object({
      description: z.string().describe('不确定的内容'),
      impact: z.enum(['low', 'medium', 'high']).describe('该不确定性对决策的影响程度'),
      missingFacts: z.array(z.string()).default([]).describe('缺失的属性名称'),
      nextQuery: z.string().optional().describe('建议的后续查询以解决此不确定性'),
    }),
    execute: async ({ description, impact, missingFacts, nextQuery }): Promise<ToolResult> => {
      const u = workspace.addUncertainty({
        description,
        impact,
        missingFacts,
        nextQuery,
      })
      return toolOk({ uncertaintyId: u.id })
    },
  })

  return {
    propose_candidates,
    record_evidence,
    list_workspace,
    declare_uncertainty,
  }
}
