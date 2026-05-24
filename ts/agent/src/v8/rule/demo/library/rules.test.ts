import { describe, it, expect, beforeEach } from 'vitest'
import {
  LIBRARY_DEMO_RULES,
  rule_blacklist,
  rule_protection_period,
  rule_good_history,
  rule_low_violation,
  rule_high_demand,
} from './rules'
import {
  InMemoryRuleRegistry,
  createRuleRuntime,
} from '../../index'
import type { RuleContext, RuleResult } from '../../types/context'
import type { Candidate } from '../../types/verdict'

// ── Mock FactStore ──

const createMockFactStore = (bindings: Record<string, Record<string, unknown>>) => ({
  get: (entityId: string, property: string) => {
    const entityBindings = bindings[entityId]
    if (!entityBindings) return null
    const value = entityBindings[property]
    if (value === undefined) return null
    return { value, confidence: 0.9, source: { kind: 'graph_property' } }
  },
  getAll: () => [],
} as any)

// Mock GraphStore for entity type resolution
const createMockGraphStore = () => ({
  getNode: async (id: string) => {
    if (id.startsWith('Reader:')) {
      return { type: 'Reader', id }
    }
    if (id.startsWith('Book:')) {
      return { type: 'Book', id }
    }
    return null
  },
} as any)

describe('Library Demo Rules', () => {
  let registry: InMemoryRuleRegistry

  beforeEach(() => {
    registry = new InMemoryRuleRegistry()
  })

  describe('Rule registration', () => {
    it('all demo rules can be registered', () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const allRules = registry.list()
      expect(allRules.length).toBe(5)
    })

    it('rules can be filtered by kind', () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const hardRules = registry.list({ kind: 'hard_constraint' })
      expect(hardRules.length).toBe(2)
      expect(hardRules.every(r => r.id.includes('blacklist') || r.id.includes('protection'))).toBe(true)

      const softRules = registry.list({ kind: 'soft_criterion' })
      expect(softRules.length).toBe(3)
    })
  })

  describe('rule_blacklist', () => {
    it('triggers when reader is blacklisted', async () => {
      const facts = createMockFactStore({
        'Reader:R001': { blacklisted: true },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R001' }

      const result = await rule_blacklist.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('黑名单')
    })

    it('does not trigger for non-blacklisted reader', async () => {
      const facts = createMockFactStore({
        'Reader:R002': { blacklisted: false },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R002' }

      const result = await rule_blacklist.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  describe('rule_protection_period', () => {
    it('triggers for book published within 30 days', async () => {
      const now = new Date()
      const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago

      const facts = createMockFactStore({
        'Book:B001': { publishedAt: recentDate },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001', now }

      const result = await rule_protection_period.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('保护期')
    })

    it('does not trigger for book older than 30 days', async () => {
      const now = new Date()
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago

      const facts = createMockFactStore({
        'Book:B002': { publishedAt: oldDate },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002', now }

      const result = await rule_protection_period.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  describe('rule_good_history', () => {
    it('triggers for reader with >50 borrows and 0 overdue', async () => {
      const facts = createMockFactStore({
        'Reader:R003': { borrowCount: 60, overdueCount: 0 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R003' }

      const result = await rule_good_history.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('60')
    })

    it('does not trigger for reader with overdue', async () => {
      const facts = createMockFactStore({
        'Reader:R004': { borrowCount: 60, overdueCount: 2 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R004' }

      const result = await rule_good_history.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  describe('rule_low_violation', () => {
    it('triggers for violation rate < 5%', async () => {
      const facts = createMockFactStore({
        'Reader:R005': { violationRate: 0.02 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R005' }

      const result = await rule_low_violation.evaluator(ctx)
      expect(result.triggered).toBe(true)
    })

    it('does not trigger for violation rate >= 5%', async () => {
      const facts = createMockFactStore({
        'Reader:R006': { violationRate: 0.1 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R006' }

      const result = await rule_low_violation.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  describe('rule_high_demand', () => {
    it('triggers for book with >10 reservations', async () => {
      const facts = createMockFactStore({
        'Book:B003': { reservationCount: 15 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B003' }

      const result = await rule_high_demand.evaluator(ctx)
      expect(result.triggered).toBe(true)
    })
  })

  describe('Integration: generateVerdict', () => {
    it('blacklist rule triggers → ALLOWED candidate vetoed', async () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const runtime = createRuleRuntime(registry)
      const mockGraph = createMockGraphStore()

      const facts = createMockFactStore({
        'Reader:R001': { blacklisted: true },
      })

      const candidates: Candidate[] = [
        { candidateId: 'c1', label: 'ALLOWED' },
        { candidateId: 'c2', label: 'DENIED' },
      ]

      const verdict = await runtime.generateVerdict({
        context: { facts, graph: mockGraph },
        entityIds: ['Reader:R001'],
        candidates,
      })

      // ALLOWED should be vetoed by blacklist rule
      const allowedResult = verdict.candidates.find(r => r.label === 'ALLOWED')
      expect(allowedResult?.rawScore).toBe(-Infinity)

      // DENIED should be recommended
      expect(verdict.recommendedCandidateId).toBe('c2')
    })

    it('soft_criterion rules affect scoring direction', async () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const runtime = createRuleRuntime(registry)
      const mockGraph = createMockGraphStore()

      const facts = createMockFactStore({
        'Reader:R003': { borrowCount: 60, overdueCount: 0, violationRate: 0.02 },
      })

      const candidates: Candidate[] = [
        { candidateId: 'c1', label: 'ALLOWED' },
        { candidateId: 'c2', label: 'DENIED' },
      ]

      const verdict = await runtime.generateVerdict({
        context: { facts, graph: mockGraph },
        entityIds: ['Reader:R003'],
        candidates,
      })

      // ALLOWED should score higher due to risk_down rules
      const allowedResult = verdict.candidates.find(r => r.label === 'ALLOWED')
      const deniedResult = verdict.candidates.find(r => r.label === 'DENIED')

      expect(allowedResult?.rawScore).toBeGreaterThan(deniedResult?.rawScore ?? 0)
      expect(verdict.recommendedCandidateId).toBe('c1')
    })
  })
})