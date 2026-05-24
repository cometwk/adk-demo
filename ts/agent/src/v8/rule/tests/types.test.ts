import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RULE_RUNTIME_CONFIG,
  createRuleRuntimeConfig,
  type RuleRuntimeConfig,
} from '../runtime/config'
import {
  type RuleKind,
  type RuleDirection,
  type VetoConfig,
  INTENT_KEYWORDS,
} from '../types/rule'

describe('Rule Types & Config', () => {
  describe('RuleRuntimeConfig', () => {
    it('DEFAULT_RULE_RUNTIME_CONFIG contains all fields with correct defaults', () => {
      expect(DEFAULT_RULE_RUNTIME_CONFIG.maxRulesPerEvaluation).toBe(100)
      expect(DEFAULT_RULE_RUNTIME_CONFIG.enableReconciler).toBe(true)
      expect(DEFAULT_RULE_RUNTIME_CONFIG.enableDirectionMapping).toBe(true)
      expect(DEFAULT_RULE_RUNTIME_CONFIG.enableVeto).toBe(true)
      expect(DEFAULT_RULE_RUNTIME_CONFIG.missingFactPenalty).toBe(0.8)
      expect(DEFAULT_RULE_RUNTIME_CONFIG.includeRuleTrace).toBe(true)
    })

    it('createRuleRuntimeConfig({}) returns default config', () => {
      const config = createRuleRuntimeConfig({})
      expect(config).toEqual(DEFAULT_RULE_RUNTIME_CONFIG)
    })

    it('createRuleRuntimeConfig({ maxRulesPerEvaluation: 50 }) only overrides specified field', () => {
      const config = createRuleRuntimeConfig({ maxRulesPerEvaluation: 50 })
      expect(config.maxRulesPerEvaluation).toBe(50)
      expect(config.enableReconciler).toBe(true) // unchanged
    })
  })

  describe('RuleKind', () => {
    it('accepts only hard_constraint or soft_criterion', () => {
      const validKinds: RuleKind[] = ['hard_constraint', 'soft_criterion']
      expect(validKinds.length).toBe(2)
    })
  })

  describe('RuleDirection', () => {
    it('accepts only risk_up, risk_down, or neutral', () => {
      const validDirections: RuleDirection[] = ['risk_up', 'risk_down', 'neutral']
      expect(validDirections.length).toBe(3)
    })
  })

  describe('VetoConfig', () => {
    it('candidatesByLabel and candidatesById are both optional', () => {
      const veto1: VetoConfig = { candidatesByLabel: ['LOW'] }
      const veto2: VetoConfig = { candidatesById: ['candidate-001'] }
      const veto3: VetoConfig = { candidatesByLabel: ['LOW'], candidatesById: ['candidate-002'] }
      const veto4: VetoConfig = {} // both optional, at least one recommended but not enforced by type

      expect(veto1.candidatesByLabel).toBeDefined()
      expect(veto2.candidatesById).toBeDefined()
      expect(veto3.candidatesByLabel).toBeDefined()
      expect(veto3.candidatesById).toBeDefined()
    })
  })

  describe('INTENT_KEYWORDS', () => {
    it('contains expected intent mappings', () => {
      expect(INTENT_KEYWORDS.risk_assessment).toContain('risk')
      expect(INTENT_KEYWORDS.compliance).toContain('blacklist')
    })
  })
})