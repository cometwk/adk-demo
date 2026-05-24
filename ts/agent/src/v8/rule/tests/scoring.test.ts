import { describe, it, expect, beforeEach } from 'vitest'
import { DefaultMCDAScorer } from '../runtime/scoring'
import { DEFAULT_DIRECTION_MAPPING } from '../types/scoring'
import type { Candidate, ScoredCandidate } from '../types/verdict'
import type { EvaluatedRule } from '../types/scoring'
import type { Rule, RuleKind, RuleDirection } from '../types/rule'
import type { RuleResult } from '../types/context'
import { DEFAULT_RULE_RUNTIME_CONFIG } from '../runtime/config'

// ── Test Fixtures ──

const createTestRule = (
  id: string,
  kind: RuleKind = 'soft_criterion',
  direction: RuleDirection = 'risk_up',
  weight: number = 0.5,
): Rule => ({
  id,
  version: '1.0',
  kind,
  appliesTo: ['Merch'],
  description: `Test rule ${id}`,
  direction,
  weight,
  evaluator: async () => ({ triggered: false }),
})

const createEvaluatedRule = (
  rule: Rule,
  triggered: boolean = true,
  missingFacts?: { entityId?: string; property: string }[],
): EvaluatedRule => ({
  rule,
  result: {
    triggered,
    missingFacts,
  } as RuleResult,
})

const createCandidate = (id: string, label: string): Candidate => ({
  candidateId: id,
  label,
})

describe('DefaultMCDAScorer', () => {
  let scorer: DefaultMCDAScorer

  beforeEach(() => {
    scorer = new DefaultMCDAScorer(DEFAULT_RULE_RUNTIME_CONFIG)
  })

  describe('Direction-aware scoring', () => {
    it('risk_up rule triggered → HIGH scores higher than LOW', () => {
      const rule = createTestRule('rule-risk', 'soft_criterion', 'risk_up', 0.7)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
      ]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      const highResult = results.find((r) => r.label === 'HIGH')
      const lowResult = results.find((r) => r.label === 'LOW')

      expect(highResult!.rawScore).toBe(0.7) // 0.7 × (+1)
      expect(lowResult!.rawScore).toBe(-0.35) // 0.7 × (-0.5)
      expect(highResult!.rawScore).toBeGreaterThan(lowResult!.rawScore)
    })

    it('risk_down rule triggered → LOW scores higher than HIGH', () => {
      const rule = createTestRule('rule-safe', 'soft_criterion', 'risk_down', 0.8)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
      ]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      const highResult = results.find((r) => r.label === 'HIGH')
      const lowResult = results.find((r) => r.label === 'LOW')

      expect(highResult!.rawScore).toBe(-0.4) // 0.8 × (-0.5)
      expect(lowResult!.rawScore).toBe(0.8) // 0.8 × (+1)
      expect(lowResult!.rawScore).toBeGreaterThan(highResult!.rawScore)
    })

    it('neutral rule → all candidates get 0 contribution', () => {
      const rule = createTestRule('rule-neutral', 'soft_criterion', 'neutral', 0.5)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
      ]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      expect(results.every((r) => r.rawScore === 0)).toBe(true)
    })

    it('multiple soft_criterion triggered → rawScore is weighted sum', () => {
      const rule1 = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const rule2 = createTestRule('r2', 'soft_criterion', 'risk_up', 0.3)
      const evaluatedRules = [
        createEvaluatedRule(rule1, true),
        createEvaluatedRule(rule2, true),
      ]
      const candidates = [createCandidate('c1', 'HIGH')]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      // HIGH for risk_up: +1 × 0.5 + +1 × 0.3 = 0.8
      expect(results[0].rawScore).toBe(0.8)
    })

    it('hard_constraint rules do not contribute to score', () => {
      const hardRule = createTestRule('hard', 'hard_constraint', 'risk_up', 1.0)
      const softRule = createTestRule('soft', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [
        createEvaluatedRule(hardRule, true),
        createEvaluatedRule(softRule, true),
      ]
      const candidates = [createCandidate('c1', 'HIGH')]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      // Only soft contributes: 0.5 × +1 = 0.5
      expect(results[0].rawScore).toBe(0.5)
    })
  })

  describe('Normalization', () => {
    it('normalizedScore is in [0, 1] for non-vetoed candidates', () => {
      const rule = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
      ]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      const valid = results.filter((r) => r.rawScore > -Infinity)
      expect(valid.every((r) => r.normalizedScore >= 0 && r.normalizedScore <= 1)).toBe(true)
    })

    it('single non-vetoed candidate → normalizedScore = 1', () => {
      const rule = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [createCandidate('c1', 'HIGH')]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      expect(results[0].normalizedScore).toBe(1)
    })
  })

  describe('Veto (candidatesByLabel)', () => {
    it('candidatesByLabel veto → all candidates with that label are vetoed', () => {
      const candidates = [
        createCandidate('c1', 'LOW'),
        createCandidate('c2', 'LOW'),
        createCandidate('c3', 'HIGH'),
      ]
      const vetoedLabels = new Set(['LOW'])

      const results = scorer.score({
        candidates,
        evaluatedRules: [],
        vetoedLabels,
        vetoedIds: new Set(),
      })

      const lowResults = results.filter((r) => r.label === 'LOW')
      const highResult = results.find((r) => r.label === 'HIGH')

      expect(lowResults.every((r) => r.rawScore === -Infinity)).toBe(true)
      expect(lowResults.every((r) => r.normalizedScore === 0)).toBe(true)
      expect(highResult!.rawScore).not.toBe(-Infinity)
    })
  })

  describe('Veto (candidatesById)', () => {
    it('candidatesById veto → only specified candidate is vetoed (precise veto)', () => {
      const candidates = [
        createCandidate('c1', 'LOW'),
        createCandidate('c2', 'LOW'),
        createCandidate('c3', 'HIGH'),
      ]
      const vetoedIds = new Set(['c1'])

      const results = scorer.score({
        candidates,
        evaluatedRules: [],
        vetoedLabels: new Set(),
        vetoedIds,
      })

      const c1Result = results.find((r) => r.candidateId === 'c1')
      const c2Result = results.find((r) => r.candidateId === 'c2')

      expect(c1Result!.rawScore).toBe(-Infinity)
      expect(c1Result!.rationale).toContain('精准 ID')
      expect(c2Result!.rawScore).not.toBe(-Infinity) // c2 NOT vetoed despite same label
    })

    it('candidatesByLabel + candidatesById both work together', () => {
      const candidates = [
        createCandidate('c1', 'LOW'),
        createCandidate('c2', 'MEDIUM'),
        createCandidate('c3', 'HIGH'),
      ]
      const vetoedLabels = new Set(['LOW'])
      const vetoedIds = new Set(['c3'])

      const results = scorer.score({
        candidates,
        evaluatedRules: [],
        vetoedLabels,
        vetoedIds,
      })

      expect(results.filter((r) => r.rawScore === -Infinity).length).toBe(2) // c1 (label) + c3 (id)
    })
  })

  describe('Confidence', () => {
    it('confidence decreases with missingFacts', () => {
      const rule = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [
        createEvaluatedRule(rule, true, [{ property: 'workload' }]),
      ]
      const candidates = [createCandidate('c1', 'HIGH')]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      // 1 missing fact out of 1 total = ratio 1, confidence = max(0, 1 - 1 * 0.8) = 0.2
      expect(results[0].confidence).toBeCloseTo(0.2, 2)
    })

    it('no missingFacts → confidence = 1', () => {
      const rule = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [createCandidate('c1', 'HIGH')]

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels: new Set(),
        vetoedIds: new Set(),
      })

      expect(results[0].confidence).toBe(1)
    })
  })

  describe('Sorting', () => {
    it('sorted by normalizedScore descending; vetoed at bottom', () => {
      const rule = createTestRule('r1', 'soft_criterion', 'risk_up', 0.5)
      const evaluatedRules = [createEvaluatedRule(rule, true)]
      const candidates = [
        createCandidate('c1', 'HIGH'),
        createCandidate('c2', 'LOW'),
        createCandidate('c3', 'MEDIUM'),
      ]
      const vetoedLabels = new Set(['MEDIUM'])

      const results = scorer.score({
        candidates,
        evaluatedRules,
        vetoedLabels,
        vetoedIds: new Set(),
      })

      // HIGH (0.5) should be first, LOW (-0.25) second, MEDIUM (vetoed) last
      expect(results[0].label).toBe('HIGH')
      expect(results[1].label).toBe('LOW')
      expect(results[2].label).toBe('MEDIUM')
      expect(results[2].rawScore).toBe(-Infinity)
    })
  })
})