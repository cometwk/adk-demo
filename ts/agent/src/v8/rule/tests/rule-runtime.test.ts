import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryRuleRuntime } from '../runtime/rule-runtime'
import { InMemoryRuleRegistry, toMetadata } from '../registry/registry'
import { DefaultMCDAScorer } from '../runtime/scoring'
import { DefaultReconciler } from '../runtime/reconciler'
import { DEFAULT_RULE_RUNTIME_CONFIG } from '../runtime/config'
import type { Rule, RuleKind, RuleDirection, VetoConfig } from '../types/rule'
import type { RuleContext, RuleResult } from '../types/context'
import type { Candidate } from '../types/verdict'
import { toolOk, toolErr } from '../../engine/runtime/types'

// ── Test Fixtures ──

const createTestRule = (
  id: string,
  kind: RuleKind = 'soft_criterion',
  direction: RuleDirection = 'risk_up',
  weight: number = 0.5,
  veto?: VetoConfig,
): Rule => ({
  id,
  version: '1.0',
  kind,
  appliesTo: ['Merch'],
  description: `Test rule ${id}`,
  direction,
  weight,
  veto,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => ({
    triggered: false,
  }),
})

const createCandidate = (id: string, label: string): Candidate => ({
  candidateId: id,
  label,
})

// Mock GraphStore
const createMockGraphStore = (): any => ({
  getNode: async (id: string) => {
    if (id.startsWith('Merch:')) {
      return { type: 'Merch', id }
    }
    if (id.startsWith('Reader:')) {
      return { type: 'Reader', id }
    }
    return null
  },
})

describe('InMemoryRuleRuntime', () => {
  let registry: InMemoryRuleRegistry
  let scorer: DefaultMCDAScorer
  let reconciler: DefaultReconciler
  let runtime: InMemoryRuleRuntime

  beforeEach(() => {
    registry = new InMemoryRuleRegistry()
    scorer = new DefaultMCDAScorer(DEFAULT_RULE_RUNTIME_CONFIG)
    reconciler = new DefaultReconciler()
    runtime = new InMemoryRuleRuntime(registry, scorer, reconciler, DEFAULT_RULE_RUNTIME_CONFIG)
  })

  describe('evaluateRules', () => {
    it('evaluates all registered rules when no ruleIds provided', async () => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRules({
        context,
        entityIds: [],
      })

      expect(result.evaluatedRules.length).toBe(2)
      expect(result.vetoedLabels.size).toBe(0)
    })

    it('evaluates only specified rules when ruleIds provided', async () => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))
      registry.register(createTestRule('rule-003'))

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRules({
        context,
        entityIds: [],
        ruleIds: ['rule-001', 'rule-002'],
      })

      expect(result.evaluatedRules.length).toBe(2)
    })

    it('filters entities by appliesTo when graph provided', async () => {
      const rule = createTestRule('merch-rule', 'soft_criterion', 'risk_up', 0.5)
      registry.register(rule)

      const mockFacts = { get: () => null } as any
      const mockGraph = createMockGraphStore()
      const context: RuleContext = { facts: mockFacts, graph: mockGraph }

      const result = await runtime.evaluateRules({
        context,
        entityIds: ['Merch:M001', 'Reader:R001'],
      })

      // Only Merch entity should be evaluated
      expect(result.evaluatedRules.length).toBe(1)
      expect(result.evaluatedRules[0].entityId).toBe('Merch:M001')
    })

    it('collects vetoedLabels from triggered hard_constraint', async () => {
      const vetoRule: Rule = {
        id: 'veto-rule',
        version: '1.0',
        kind: 'hard_constraint',
        appliesTo: ['Merch'],
        description: 'Blacklist check',
        direction: 'neutral',
        veto: { candidatesByLabel: ['LOW'] },
        evaluator: async () => ({ triggered: true }),
      }
      registry.register(vetoRule)

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRules({
        context,
        entityIds: [],
      })

      expect(result.vetoedLabels.has('LOW')).toBe(true)
    })

    it('collects vetoedIds from triggered hard_constraint', async () => {
      const vetoRule: Rule = {
        id: 'veto-id-rule',
        version: '1.0',
        kind: 'hard_constraint',
        appliesTo: ['Merch'],
        description: 'Blacklist by ID',
        direction: 'neutral',
        veto: { candidatesById: ['candidate-001'] },
        evaluator: async () => ({ triggered: true }),
      }
      registry.register(vetoRule)

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRules({
        context,
        entityIds: [],
      })

      expect(result.vetoedIds.has('candidate-001')).toBe(true)
    })
  })

  describe('generateVerdict', () => {
    it('returns SystemVerdict with ranking and recommendation', async () => {
      const rule = createTestRule('risk-up', 'soft_criterion', 'risk_up', 0.5)
      registry.register(rule)

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
      ]

      const verdict = await runtime.generateVerdict({
        context,
        entityIds: [],
        candidates,
      })

      expect(verdict.recommendedCandidateId).toBeDefined()
      expect(verdict.candidates.length).toBe(2)
      expect(verdict.generatedAt).toBeDefined()
    })
  })

  describe('evaluateRule', () => {
    it('returns ToolResult ok for existing rule', async () => {
      const rule = createTestRule('test-rule')
      registry.register(rule)

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRule('test-rule', context)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.triggered).toBe(false)
      }
    })

    it('returns ToolResult error for non-existent rule', async () => {
      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRule('non-existent', context) as any

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND')
      }
    })

    it('returns triggered=false with error when evaluator throws', async () => {
      const errorRule: Rule = {
        id: 'error-rule',
        version: '1.0',
        kind: 'soft_criterion',
        appliesTo: ['Merch'],
        description: 'Error rule',
        direction: 'risk_up',
        evaluator: async () => {
          throw new Error('Evaluator error')
        },
      }
      registry.register(errorRule)

      const mockFacts = { get: () => null } as any
      const context: RuleContext = { facts: mockFacts }

      const result = await runtime.evaluateRule('error-rule', context) as any

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INTERNAL_ERROR')
        expect(result.message).toContain('Evaluator error')
      }
    })
  })

  describe('inspectRules', () => {
    it('returns ToolResult with rule metadata', () => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))

      const result = runtime.inspectRules()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.length).toBe(2)
        expect(result.data[0].id).toBe('rule-001')
      }
    })

    it('filters by kind', () => {
      registry.register(createTestRule('soft-1', 'soft_criterion'))
      registry.register(createTestRule('hard-1', 'hard_constraint'))

      const result = runtime.inspectRules({ kind: 'hard_constraint' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.length).toBe(1)
        expect(result.data[0].kind).toBe('hard_constraint')
      }
    })
  })

  describe('reconcile', () => {
    it('delegates to Reconciler.compare', () => {
      const modelVerdict = { answer: 'HIGH', rationale: 'test', entities: [], confidence: 0.8 } as any
      const systemVerdict = {
        recommendedCandidateId: 'c1',
        candidates: [
          { candidateId: 'c1', label: 'HIGH', rawScore: 0.8, normalizedScore: 1, confidence: 0.8, triggeredRuleIds: [], blockingRuleIds: [], rationale: '' },
        ],
        vetoedLabels: [],
        vetoedIds: [],
        generatedAt: Date.now(),
      }

      const result = runtime.reconcile({
        modelVerdict,
        systemVerdict,
      })

      expect(result.agreed).toBe(true)
    })
  })
})