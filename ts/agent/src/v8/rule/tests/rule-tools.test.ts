import { describe, it, expect, beforeEach } from 'vitest'
import { createRuleTools } from '../tools/rule-tools'
import { InMemoryRuleRuntime } from '../runtime/rule-runtime'
import { InMemoryRuleRegistry } from '../registry/registry'
import { DefaultMCDAScorer } from '../runtime/scoring'
import { DefaultReconciler } from '../runtime/reconciler'
import { DEFAULT_RULE_RUNTIME_CONFIG } from '../runtime/config'
import type { Rule } from '../types/rule'
import type { RuleContext, RuleResult } from '../types/context'
import type { SystemVerdict } from '../types/verdict'
import type { Workspace } from '../../engine/runtime/workspace'
import type { PolicyContext } from '../../policy/context'
import { OPEN_POLICY } from '../../policy/context'

// ── Test Fixtures ──

const createTestRule = (id: string): Rule => ({
  id,
  version: '1.0',
  kind: 'soft_criterion',
  appliesTo: ['Merch'],
  description: `Test rule ${id}`,
  direction: 'risk_up',
  weight: 0.5,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => ({
    triggered: false,
  }),
})

const createMockWorkspace = (): Workspace => {
  const bindings: any[] = []
  return {
    getFacts: () => ({
      get: () => null,
      getAll: () => bindings,
    } as any),
    addBinding: (b: any) => bindings.push(b),
    setCandidates: () => {},
    getSessionClock: () => new Date(),
  } as any
}

const createMockGraphStore = (): any => ({
  getNode: async () => null,
})

describe('createRuleTools', () => {
  let registry: InMemoryRuleRegistry
  let runtime: InMemoryRuleRuntime
  let workspace: Workspace
  let graphStore: any
  let policy: PolicyContext
  let currentVerdict: SystemVerdict | undefined
  let tools: ReturnType<typeof createRuleTools>

  beforeEach(() => {
    registry = new InMemoryRuleRegistry()
    const scorer = new DefaultMCDAScorer(DEFAULT_RULE_RUNTIME_CONFIG)
    const reconciler = new DefaultReconciler()
    runtime = new InMemoryRuleRuntime(registry, scorer, reconciler, DEFAULT_RULE_RUNTIME_CONFIG)

    workspace = createMockWorkspace()
    graphStore = createMockGraphStore()
    policy = OPEN_POLICY
    currentVerdict = undefined

    tools = createRuleTools(
      runtime,
      workspace,
      graphStore,
      policy,
      () => currentVerdict,
      (v) => { currentVerdict = v },
    )
  })

  describe('inspect_rules', () => {
    it('returns rule list', async () => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))

      const result = await tools.inspect_rules.execute({})

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.length).toBe(2)
      }
    })

    it('filters by kind', async () => {
      registry.register(createTestRule('soft-1'))
      const hardRule: Rule = {
        id: 'hard-1',
        version: '1.0',
        kind: 'hard_constraint',
        appliesTo: ['Merch'],
        description: 'Hard rule',
        direction: 'neutral',
        evaluator: async () => ({ triggered: false }),
      }
      registry.register(hardRule)

      const result = await tools.inspect_rules.execute({ kind: 'hard_constraint' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.length).toBe(1)
        expect(result.data[0].kind).toBe('hard_constraint')
      }
    })
  })

  describe('evaluate_rule', () => {
    it('returns result for existing rule', async () => {
      registry.register(createTestRule('test-rule'))

      const result = await tools.evaluate_rule.execute({ ruleId: 'test-rule' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.triggered).toBe(false)
        expect(result.data.note).toContain('scoring')
      }
    })

    it('returns NOT_FOUND for non-existent rule', async () => {
      const result = await tools.evaluate_rule.execute({ ruleId: 'non-existent' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND')
      }
    })

    it('returns PERMISSION_DENIED when entity access denied', async () => {
      registry.register(createTestRule('test-rule'))

      const deniedPolicy: PolicyContext = {
        principal: { userId: 'user-001', roles: ['reader'] },
        scope: {
          allowedEntityIds: ['Merch:M001'],
          deniedEntityIds: ['Merch:M002'],
        },
        redaction: { sensitiveProperties: [], mode: 'none' },
        audit: { logToolCalls: false },
      }

      const toolsWithDeniedPolicy = createRuleTools(
        runtime,
        workspace,
        graphStore,
        deniedPolicy,
        () => currentVerdict,
        (v) => { currentVerdict = v },
      )

      const result = await toolsWithDeniedPolicy.evaluate_rule.execute({
        ruleId: 'test-rule',
        entityId: 'Merch:M002',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('POLICY_DENIED')
      }
    })
  })

  describe('inspect_verdict', () => {
    it('returns verdict when exists', async () => {
      currentVerdict = {
        recommendedCandidateId: 'c1',
        ranking: [
          { candidateId: 'c1', label: 'HIGH', rawScore: 0.8, normalizedScore: 1, confidence: 0.8, triggeredRuleIds: [], blockingRuleIds: [], rationale: '' },
        ],
        vetoedIds: [],
        generatedAt: Date.now(),
      }

      const result = await tools.inspect_verdict.execute({})

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.recommendedCandidateId).toBe('c1')
      }
    })

    it('returns PRECONDITION_FAILED when no verdict', async () => {
      const result = await tools.inspect_verdict.execute({})

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('PRECONDITION_FAILED')
      }
    })
  })

  describe('reconcile_verdict', () => {
    it('returns agreed=true when model matches system', async () => {
      currentVerdict = {
        recommendedCandidateId: 'c1',
        ranking: [
          { candidateId: 'c1', label: 'HIGH', rawScore: 0.8, normalizedScore: 1, confidence: 0.8, triggeredRuleIds: [], blockingRuleIds: [], rationale: '' },
        ],
        vetoedIds: [],
        generatedAt: Date.now(),
      }

      const result = await tools.reconcile_verdict.execute({
        modelAnswer: 'HIGH',
        modelRationale: 'Model reasoning',
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.agreed).toBe(true)
      }
    })

    it('returns PRECONDITION_FAILED when no system verdict', async () => {
      const result = await tools.reconcile_verdict.execute({
        modelAnswer: 'HIGH',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('PRECONDITION_FAILED')
      }
    })
  })
})