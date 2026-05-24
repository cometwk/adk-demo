import type { RuleRegistry } from '../registry/registry'
import { toMetadata } from '../registry/registry'
import type { MCDAScorer } from './scoring'
import type { Reconciler } from './reconciler'
import type { RuleRuntimeConfig } from './config'
import { toolOk, toolErr, type ToolResult } from '../../engine/runtime/types'
import type {
  Rule,
  RuleEvaluationInput,
  RuleEvaluationOutput,
  VerdictInput,
  RuleFilter,
  RuleMetadata,
} from '../types/rule'
import type { RuleContext, RuleResult } from '../types/context'
import type { SystemVerdict, Candidate } from '../types/verdict'
import type { CandidateScoringInput } from '../types/scoring'
import type { ReconcileInput, ReconcileResult } from '../types/reconcile'
import type { GraphStore } from '../../engine/stores/graph-store'

// ── Rule Runtime Interface ──

export interface RuleRuntime {
  evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput>
  scoreCandidates(input: CandidateScoringInput): Promise<SystemVerdict['candidates']>
  generateVerdict(input: VerdictInput): Promise<SystemVerdict>
  evaluateRule(ruleId: string, ctx: RuleContext): Promise<ToolResult<RuleResult>>
  inspectRules(filter?: RuleFilter): ToolResult<RuleMetadata[]>
  reconcile(input: ReconcileInput): ReconcileResult
}

// ── InMemory Rule Runtime ──

export class InMemoryRuleRuntime implements RuleRuntime {
  constructor(
    private registry: RuleRegistry,
    private scorer: MCDAScorer,
    private reconciler: Reconciler,
    private config: RuleRuntimeConfig,
  ) {}

  // ── Evaluate Rules ──

  async evaluateRules(input: RuleEvaluationInput): Promise<RuleEvaluationOutput> {
    const { context, entityIds, ruleIds } = input

    // Resolve rules from registry
    const rules = this.registry.resolve(ruleIds)
    if (rules.length > this.config.maxRulesPerEvaluation) {
      rules.splice(this.config.maxRulesPerEvaluation) // truncate
    }

    const evaluatedRules: import('../types/scoring').EvaluatedRule[] = []
    const vetoedLabels = new Set<string>()
    const vetoedIds = new Set<string>()

    for (const rule of rules) {
      const matchingEntities = await this.filterMatchingEntities(
        rule,
        entityIds,
        context.graph,
      )

      if (matchingEntities.length === 0) {
        // Global rule (no specific entity match)
        const result = await this.evaluateSingleRule(rule, context)
        evaluatedRules.push({ rule, result })

        if (rule.kind === 'hard_constraint' && result.triggered && rule.veto) {
          this.collectVetos(rule.veto, vetoedLabels, vetoedIds)
        }
      } else {
        // Per-entity evaluation
        for (const entityId of matchingEntities) {
          const result = await this.evaluateSingleRule(rule, {
            ...context,
            entityId,
          })
          evaluatedRules.push({ rule, entityId, result })

          if (rule.kind === 'hard_constraint' && result.triggered && rule.veto) {
            this.collectVetos(rule.veto, vetoedLabels, vetoedIds)
          }
        }
      }
    }

    return { evaluatedRules, vetoedLabels, vetoedIds }
  }

  // ── Score Candidates ──

  async scoreCandidates(input: CandidateScoringInput): Promise<SystemVerdict['candidates']> {
    return this.scorer.score(input)
  }

  // ── Generate Verdict ──

  async generateVerdict(input: VerdictInput): Promise<SystemVerdict> {
    const { context, entityIds, ruleIds } = input

    const evaluation = await this.evaluateRules({
      context,
      entityIds,
      ruleIds,
    })

    const scoredCandidates = await this.scoreCandidates({
      candidates: input.candidates,
      evaluatedRules: evaluation.evaluatedRules,
      vetoedLabels: evaluation.vetoedLabels,
      vetoedIds: evaluation.vetoedIds,
    })

    return {
      recommendedCandidateId: scoredCandidates[0]?.candidateId,
      candidates: scoredCandidates,
      vetoedLabels: Array.from(evaluation.vetoedLabels),
      vetoedIds: Array.from(evaluation.vetoedIds),
      generatedAt: Date.now(),
    }
  }

  // ── Evaluate Single Rule (debug) ──

  async evaluateRule(ruleId: string, ctx: RuleContext): Promise<ToolResult<RuleResult>> {
    const rule = this.registry.get(ruleId)
    if (!rule) {
      return toolErr('NOT_FOUND', `Rule '${ruleId}' not found`, {
        retryable: false,
        expected: { availableRuleIds: this.registry.list().map((r) => r.id) },
      })
    }

    try {
      const result = await rule.evaluator(ctx)
      return toolOk(result)
    } catch (err) {
      return toolErr(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err),
        { retryable: false },
      )
    }
  }

  // ── Inspect Rules ──

  inspectRules(filter?: RuleFilter): ToolResult<RuleMetadata[]> {
    const rules = this.registry.list(filter)
    return toolOk(rules.map(toMetadata))
  }

  // ── Reconcile ──

  reconcile(input: ReconcileInput): ReconcileResult {
    return this.reconciler.compare(input)
  }

  // ── Internal Methods ──

  private async evaluateSingleRule(rule: Rule, ctx: RuleContext): Promise<RuleResult> {
    try {
      return await rule.evaluator(ctx)
    } catch (err) {
      return {
        triggered: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async filterMatchingEntities(
    rule: Rule,
    entityIds: string[],
    graph?: GraphStore,
  ): Promise<string[]> {
    if (!graph || entityIds.length === 0) return []

    const matching: string[] = []
    for (const eid of entityIds) {
      try {
        const nodeData = await graph.getNode(eid)
        if (nodeData && rule.appliesTo.includes(nodeData.type)) {
          matching.push(eid)
        }
      } catch {
        // Node not found or inaccessible, skip
      }
    }
    return matching
  }

  private collectVetos(
    veto: import('../types/rule').VetoConfig,
    vetoedLabels: Set<string>,
    vetoedIds: Set<string>,
  ): void {
    if (veto.candidatesByLabel) {
      for (const label of veto.candidatesByLabel) {
        vetoedLabels.add(label)
      }
    }
    if (veto.candidatesById) {
      for (const id of veto.candidatesById) {
        vetoedIds.add(id)
      }
    }
  }
}