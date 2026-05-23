import { tool } from 'ai'
import { z } from 'zod'
import type { Workspace } from '../runtime/workspace'
import type { ToolResult } from '../runtime/types'
import { toolOk } from '../runtime/types'
import type { PolicyContext } from '../../policy/context'
import { maybeLogToolCall } from '../../policy/filters'

// ── Candidate and Evidence Tools (V8) ──
// Simplified version - supports candidates list and evidence recording
// Note: evaluate_candidates is handled by Agent reasoning, not a tool

export function createCandidateTools(workspace: Workspace, policy: PolicyContext) {
  // propose_candidates - propose decision candidates
  const propose_candidates = tool({
    description:
      '为决策提出候选答案集合。将候选 ID 存入 workspace.candidates 供后续 compute_query 动态引用使用。' +
      '示例: [{label:"M001",description:"Merchant 1"}, {label:"M002",...}]',
    inputSchema: z.object({
      candidates: z.array(
        z.object({
          label: z.string().describe('候选答案标签（如商户 ID）'),
          description: z.string().optional().describe('对该候选的描述'),
        })
      ),
    }),
    execute: async ({ candidates }): Promise<ToolResult> => {
      maybeLogToolCall('propose_candidates', { count: candidates.length }, policy)

      // Store candidate global IDs in workspace
      const ids = candidates.map((c) => c.label)
      workspace.setCandidates(ids)

      return toolOk({
        candidates: candidates.map((c) => ({ label: c.label, description: c.description })),
        count: candidates.length,
        hint: 'Candidates stored in workspace.candidates. Use $workspace.candidates in compute_query filters.',
      })
    },
  })

  // record_evidence - record evidence for decision
  const record_evidence = tool({
    description:
      '记录一条证据并关联到候选答案。包含来源类型、置信度和支持/反对方向。',
    inputSchema: z.object({
      content: z.string().describe('证据的人类可读描述'),
      sourceKind: z
        .enum(['graph_property', 'compute_result', 'derived', 'rule_evaluation'])
        .describe('证据来源类型'),
      entityId: z.string().optional().describe('相关实体 ID'),
      confidence: z.number().min(0).max(1).default(0.8).describe('置信度 0..1'),
      supportsCandidate: z.string().optional().describe('该证据支持的候选标签'),
    }),
    execute: async ({
      content,
      sourceKind,
      entityId,
      confidence,
      supportsCandidate,
    }): Promise<ToolResult> => {
      maybeLogToolCall('record_evidence', { content, sourceKind }, policy)

      // Evidence is recorded as a fact binding
      const now = new Date().toISOString()
      const evidenceId = `evidence:${Date.now()}`

      if (supportsCandidate && entityId) {
        workspace.addBinding({
          entityId,
          property: 'evidence',
          value: {
            id: evidenceId,
            content,
            sourceKind,
            confidence,
            supports: supportsCandidate,
          },
          source: { kind: 'derived', ref: evidenceId },
          confidence,
          validFrom: now,
          observedAt: now,
        })
      }

      return toolOk({
        evidenceId,
        confidence,
        supports: supportsCandidate,
      })
    },
  })

  // declare_uncertainty - record known uncertainty
  const declare_uncertainty = tool({
    description:
      '记录已知的不确定性 —— 缺失的事实或模糊信号。' +
      '系统会在最终响应中展示未解决的不确定性。',
    inputSchema: z.object({
      description: z.string().describe('不确定的内容'),
      impact: z.enum(['low', 'medium', 'high']).describe('对决策的影响程度'),
      missingFacts: z.array(z.string()).optional().describe('缺失的属性名称'),
    }),
    execute: async ({ description, impact, missingFacts }): Promise<ToolResult> => {
      maybeLogToolCall('declare_uncertainty', { description, impact }, policy)

      const now = new Date().toISOString()
      const uncertaintyId = `uncertainty:${Date.now()}`

      workspace.addBinding({
        entityId: 'workspace',
        property: 'uncertainty',
        value: {
          id: uncertaintyId,
          description,
          impact,
          missingFacts: missingFacts ?? [],
        },
        source: { kind: 'derived' },
        confidence: 0.5,
        validFrom: now,
        observedAt: now,
      })

      return toolOk({
        uncertaintyId,
        impact,
        missingFacts: missingFacts ?? [],
      })
    },
  })

  // list_workspace - summarize workspace state
  const list_workspace = tool({
    description: '列出当前工作区状态：候选、事实绑定。',
    inputSchema: z.object({}),
    execute: async (): Promise<ToolResult> => {
      const facts = workspace.getFacts()
      const candidates = workspace.candidates

      return toolOk({
        candidates,
        factsCount: facts.all().length,
        recentBindings: facts.all().slice(-10).map((b) => ({
          entityId: b.entityId,
          property: b.property,
          value: b.value,
          source: b.source.kind,
        })),
      })
    },
  })

  return {
    propose_candidates,
    record_evidence,
    declare_uncertainty,
    list_workspace,
  }
}