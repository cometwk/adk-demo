import { describe, it, expect, beforeEach } from 'vitest'
import {
  LIBRARY_DEMO_RULES,
  rule_borrow_limit_exceeded,
  rule_overdue_blocks_borrow,
  rule_new_book_protection,
  rule_restricted_category_access,
  rule_series_order_required,
  rule_no_copies_available,
  rule_reservation_limit_exceeded,
  rule_popular_author_bonus,
  rule_reader_in_good_standing,
} from './rules'
import {
  InMemoryRuleRegistry,
  createRuleRuntime,
} from '../../index'
import type { RuleContext } from '../../types/context'
import type { Candidate } from '../../types/verdict'
import { FactStore } from '../../../engine/stores/fact-store'

// ── Mock FactStore ──

const createMockFactStore = (bindings: Record<string, Record<string, unknown>>) => {
  const factBindings = Object.entries(bindings).flatMap(([entityId, props]) =>
    Object.entries(props).map(([property, value]) => ({
      entityId,
      property,
      value,
      confidence: 0.9,
      source: { kind: 'graph_property' as const },
      validFrom: new Date().toISOString(),
      observedAt: new Date().toISOString(),
    }))
  )
  return new FactStore(factBindings)
}

// Mock GraphStore for entity type resolution and neighbor queries
const createMockGraphStore = (neighborsData?: Record<string, { direction: 'in' | 'out'; items: Array<{ relation: string; nodeId: string }> }>) => ({
  getNode: async (id: string) => {
    if (id.startsWith('Reader:')) {
      return { type: 'Reader', id }
    }
    if (id.startsWith('Book:')) {
      return { type: 'Book', id }
    }
    return null
  },
  getNeighbors: async (nodeId: string, opts: { direction?: 'in' | 'out' | 'both' }) => {
    const key = `${nodeId}:${opts.direction ?? 'both'}`
    const items = neighborsData?.[key]?.items ?? []
    return { items, page: { offset: 0, limit: 100, hasMore: false } }
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
      expect(allRules.length).toBe(9)
    })

    it('rules can be filtered by kind', () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const hardRules = registry.list({ kind: 'hard_constraint' })
      expect(hardRules.length).toBe(7)

      const softRules = registry.list({ kind: 'soft_criterion' })
      expect(softRules.length).toBe(2)
    })
  })

  // ── C1: borrow_limit_exceeded ──

  describe('rule_borrow_limit_exceeded', () => {
    it('triggers when borrow count reaches limit', async () => {
      const facts = createMockFactStore({
        'Reader:R001': { currentBorrowCount: 5, branchMaxBorrowPerReader: 5 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R001' }

      const result = await rule_borrow_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('达到分馆上限')
    })

    it('does not trigger when under limit', async () => {
      const facts = createMockFactStore({
        'Reader:R002': { currentBorrowCount: 3, branchMaxBorrowPerReader: 5 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R002' }

      const result = await rule_borrow_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })

    it('returns missingFacts when facts not bound', async () => {
      const facts = createMockFactStore({})
      const ctx: RuleContext = { facts, entityId: 'Reader:R003' }

      const result = await rule_borrow_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(false)
      expect(result.missingFacts?.length).toBe(2)
    })
  })

  // ── C2: overdue_blocks_borrow ──

  describe('rule_overdue_blocks_borrow', () => {
    it('triggers when has overdue books (from FactStore)', async () => {
      const facts = createMockFactStore({
        'Reader:R001': { overdueBookCount: 2 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R001' }

      const result = await rule_overdue_blocks_borrow.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('逾期')
    })

    it('triggers when has overdue books (from graph)', async () => {
      const facts = createMockFactStore({})
      const graph = createMockGraphStore({
        'Reader:R001:out': { direction: 'out', items: [{ relation: 'overdue', nodeId: 'Book:B001' }] },
      })
      const ctx: RuleContext = { facts, graph, entityId: 'Reader:R001' }

      const result = await rule_overdue_blocks_borrow.evaluator(ctx)
      expect(result.triggered).toBe(true)
    })

    it('does not trigger when no overdue', async () => {
      const facts = createMockFactStore({
        'Reader:R002': { overdueBookCount: 0 },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R002' }

      const result = await rule_overdue_blocks_borrow.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  // ── C3: new_book_protection ──

  describe('rule_new_book_protection', () => {
    it('triggers for book within protection period', async () => {
      const facts = createMockFactStore({
        'Book:B001': { daysOnShelf: 10, branchProtectionDays: 30 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001' }

      const result = await rule_new_book_protection.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('保护期')
    })

    it('does not trigger for book past protection period', async () => {
      const facts = createMockFactStore({
        'Book:B002': { daysOnShelf: 60, branchProtectionDays: 30 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002' }

      const result = await rule_new_book_protection.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  // ── C4: restricted_category_access ──

  describe('rule_restricted_category_access', () => {
    it('triggers when reader level below required', async () => {
      const facts = createMockFactStore({
        'Reader:R001': {
          categoryIsRestricted: true,
          membershipLevel: 'basic',
          categoryRequiredLevel: 'gold',
        },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R001' }

      const result = await rule_restricted_category_access.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('等级不足')
    })

    it('does not trigger when reader level meets required', async () => {
      const facts = createMockFactStore({
        'Reader:R002': {
          categoryIsRestricted: true,
          membershipLevel: 'gold',
          categoryRequiredLevel: 'silver',
        },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R002' }

      const result = await rule_restricted_category_access.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })

    it('does not trigger when category not restricted', async () => {
      const facts = createMockFactStore({
        'Reader:R003': { categoryIsRestricted: false },
      })
      const ctx: RuleContext = { facts, entityId: 'Reader:R003' }

      const result = await rule_restricted_category_access.evaluator(ctx)
      expect(result.triggered).toBe(false)
      expect(result.explanation).toContain('无会员等级限制')
    })
  })

  // ── C5: series_order_required ──

  describe('rule_series_order_required', () => {
    it('triggers when prior volumes not completed', async () => {
      const facts = createMockFactStore({
        'Book:B001': { seriesVolume: 3, readerCompletedPriorVolumes: false },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001' }

      const result = await rule_series_order_required.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('前序卷')
    })

    it('does not trigger when prior volumes completed', async () => {
      const facts = createMockFactStore({
        'Book:B002': { seriesVolume: 3, readerCompletedPriorVolumes: true },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002' }

      const result = await rule_series_order_required.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })

    it('does not trigger for volume 1 or non-series', async () => {
      const facts = createMockFactStore({
        'Book:B003': { seriesVolume: 1 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B003' }

      const result = await rule_series_order_required.evaluator(ctx)
      expect(result.triggered).toBe(false)
      expect(result.explanation).toContain('第一卷或非系列书')
    })
  })

  // ── C6: no_copies_available ──

  describe('rule_no_copies_available', () => {
    it('triggers when no copies available', async () => {
      const facts = createMockFactStore({
        'Book:B001': { availableCopies: 0 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001' }

      const result = await rule_no_copies_available.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('无库存')
    })

    it('does not trigger when copies available', async () => {
      const facts = createMockFactStore({
        'Book:B002': { availableCopies: 3 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002' }

      const result = await rule_no_copies_available.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  // ── C7: reservation_limit_exceeded ──

  describe('rule_reservation_limit_exceeded', () => {
    it('triggers when reservations exceed limit', async () => {
      const facts = createMockFactStore({
        'Book:B001': { reservationCount: 6 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001' }

      const result = await rule_reservation_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('超过上限')
    })

    it('does not trigger when reservations within limit', async () => {
      const facts = createMockFactStore({
        'Book:B002': { reservationCount: 3 },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002' }

      const result = await rule_reservation_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })

    it('can count reservations from graph', async () => {
      const facts = createMockFactStore({})
      const graph = createMockGraphStore({
        'Book:B003:in': {
          direction: 'in',
          items: [
            { relation: 'reserves', nodeId: 'Reader:R001' },
            { relation: 'reserves', nodeId: 'Reader:R002' },
            { relation: 'reserves', nodeId: 'Reader:R003' },
            { relation: 'reserves', nodeId: 'Reader:R004' },
            { relation: 'reserves', nodeId: 'Reader:R005' },
            { relation: 'reserves', nodeId: 'Reader:R006' },
          ],
        },
      })
      const ctx: RuleContext = { facts, graph, entityId: 'Book:B003' }

      const result = await rule_reservation_limit_exceeded.evaluator(ctx)
      expect(result.triggered).toBe(true)
    })
  })

  // ── S1: popular_author_bonus ──

  describe('rule_popular_author_bonus', () => {
    it('triggers for popular author', async () => {
      const facts = createMockFactStore({
        'Book:B001': { authorIsPopular: true },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B001' }

      const result = await rule_popular_author_bonus.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('热门作者')
    })

    it('does not trigger for non-popular author', async () => {
      const facts = createMockFactStore({
        'Book:B002': { authorIsPopular: false },
      })
      const ctx: RuleContext = { facts, entityId: 'Book:B002' }

      const result = await rule_popular_author_bonus.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  // ── S2: reader_in_good_standing ──

  describe('rule_reader_in_good_standing', () => {
    it('triggers for reader with low borrow count and no overdue', async () => {
      const facts = createMockFactStore({
        'Reader:R001': { currentBorrowCount: 1 },
      })
      const graph = createMockGraphStore({
        'Reader:R001:out': { direction: 'out', items: [] },
      })
      const ctx: RuleContext = { facts, graph, entityId: 'Reader:R001' }

      const result = await rule_reader_in_good_standing.evaluator(ctx)
      expect(result.triggered).toBe(true)
      expect(result.explanation).toContain('信用良好')
    })

    it('does not trigger for reader with high borrow count', async () => {
      const facts = createMockFactStore({
        'Reader:R002': { currentBorrowCount: 3 },
      })
      const graph = createMockGraphStore({
        'Reader:R002:out': { direction: 'out', items: [] },
      })
      const ctx: RuleContext = { facts, graph, entityId: 'Reader:R002' }

      const result = await rule_reader_in_good_standing.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })

    it('does not trigger for reader with overdue', async () => {
      const facts = createMockFactStore({
        'Reader:R003': { currentBorrowCount: 1 },
      })
      const graph = createMockGraphStore({
        'Reader:R003:out': { direction: 'out', items: [{ relation: 'overdue', nodeId: 'Book:B001' }] },
      })
      const ctx: RuleContext = { facts, graph, entityId: 'Reader:R003' }

      const result = await rule_reader_in_good_standing.evaluator(ctx)
      expect(result.triggered).toBe(false)
    })
  })

  // ── Integration Tests ──

  describe('Integration: generateVerdict', () => {
    it('hard constraint triggers → ALLOWED candidate vetoed', async () => {
      for (const rule of LIBRARY_DEMO_RULES) {
        registry.register(rule)
      }

      const runtime = createRuleRuntime(registry)
      const mockGraph = createMockGraphStore()

      const facts = createMockFactStore({
        'Reader:R001': { overdueBookCount: 2 },
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

      // ALLOWED should be vetoed by overdue rule
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
      const graph = createMockGraphStore({
        'Reader:R003:out': { direction: 'out', items: [] },
      })

      const facts = createMockFactStore({
        'Reader:R003': { currentBorrowCount: 1 },
        'Book:B001': { authorIsPopular: true },
      })

      const candidates: Candidate[] = [
        { candidateId: 'c1', label: 'ALLOWED' },
        { candidateId: 'c2', label: 'DENIED' },
      ]

      const verdict = await runtime.generateVerdict({
        context: { facts, graph },
        entityIds: ['Reader:R003', 'Book:B001'],
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