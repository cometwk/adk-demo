import { describe, it, expect, beforeEach } from 'vitest'
import {
  InMemoryRuleRegistry,
  toMetadata,
} from '../registry/registry'
import type { Rule, RuleKind, RuleDirection } from '../types/rule'
import type { RuleContext, RuleResult } from '../types/context'

// ── Test Fixtures ──

const createTestRule = (
  id: string,
  kind: RuleKind = 'soft_criterion',
  appliesTo: string[] = ['Merch'],
  direction: RuleDirection = 'risk_up',
): Rule => ({
  id,
  version: '1.0',
  kind,
  appliesTo,
  description: `Test rule ${id}`,
  direction,
  weight: 0.5,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => ({
    triggered: false,
  }),
})

describe('InMemoryRuleRegistry', () => {
  let registry: InMemoryRuleRegistry

  beforeEach(() => {
    registry = new InMemoryRuleRegistry()
  })

  describe('register + get', () => {
    it('returns registered rule by id', () => {
      const rule = createTestRule('rule-001')
      registry.register(rule)
      expect(registry.get('rule-001')).toBe(rule)
    })

    it('returns undefined for non-existent id', () => {
      expect(registry.get('non-existent')).toBeUndefined()
    })

    it('throws error on duplicate id', () => {
      const rule1 = createTestRule('rule-001')
      registry.register(rule1)
      const rule2 = createTestRule('rule-001')
      expect(() => registry.register(rule2)).toThrow(
        "Rule 'rule-001' already registered",
      )
    })
  })

  describe('list', () => {
    beforeEach(() => {
      registry.register(createTestRule('rule-risk', 'soft_criterion', ['Merch'], 'risk_up'))
      registry.register(createTestRule('rule-compliance', 'hard_constraint', ['Reader'], 'neutral'))
      registry.register(createTestRule('rule-priority', 'soft_criterion', ['Merch', 'Project'], 'risk_down'))
    })

    it('returns all rules when no filter', () => {
      const rules = registry.list()
      expect(rules.length).toBe(3)
    })

    it('filters by entityType', () => {
      const rules = registry.list({ entityType: 'Merch' })
      expect(rules.length).toBe(2)
      expect(rules.every((r) => r.appliesTo.includes('Merch'))).toBe(true)
    })

    it('filters by kind', () => {
      const rules = registry.list({ kind: 'hard_constraint' })
      expect(rules.length).toBe(1)
      expect(rules[0].id).toBe('rule-compliance')
    })

    it('filters by intent', () => {
      // Register a rule with risk keyword
      registry.register(createTestRule('rule-overload', 'soft_criterion', ['Engineer'], 'risk_up'))
      const rules = registry.list({ intent: 'risk_assessment' })
      expect(rules.length).toBeGreaterThan(0)
      expect(rules.some((r) => r.id.includes('risk') || r.description.includes('risk'))).toBe(true)
    })

    it('filters by multiple criteria (intersection)', () => {
      const rules = registry.list({
        entityType: 'Merch',
        kind: 'soft_criterion',
      })
      expect(rules.length).toBe(2)
      expect(rules.every((r) => r.appliesTo.includes('Merch'))).toBe(true)
      expect(rules.every((r) => r.kind === 'soft_criterion')).toBe(true)
    })
  })

  describe('resolve', () => {
    beforeEach(() => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))
      registry.register(createTestRule('rule-003'))
    })

    it('returns all rules when no ids provided', () => {
      const rules = registry.resolve()
      expect(rules.length).toBe(3)
    })

    it('returns specified rules, skipping non-existent', () => {
      const rules = registry.resolve(['rule-001', 'rule-999', 'rule-002'])
      expect(rules.length).toBe(2)
      expect(rules.map((r) => r.id)).toEqual(['rule-001', 'rule-002'])
    })

    it('returns empty array for all non-existent ids', () => {
      const rules = registry.resolve(['rule-999', 'rule-888'])
      expect(rules.length).toBe(0)
    })
  })

  describe('clear', () => {
    it('clears all rules', () => {
      registry.register(createTestRule('rule-001'))
      registry.register(createTestRule('rule-002'))
      registry.clear()
      expect(registry.list().length).toBe(0)
      expect(registry.get('rule-001')).toBeUndefined()
    })
  })

  describe('toMetadata', () => {
    it('converts rule to metadata', () => {
      const rule = createTestRule('rule-001')
      const meta = toMetadata(rule)
      expect(meta.id).toBe('rule-001')
      expect(meta.kind).toBe('soft_criterion')
      expect(meta.appliesTo).toEqual(['Merch'])
      expect(meta.direction).toBe('risk_up')
      expect(meta.weight).toBe(0.5)
      // evaluator and explanation not included in metadata
    })
  })
})