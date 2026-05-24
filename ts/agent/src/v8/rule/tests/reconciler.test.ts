import { describe, it, expect } from 'vitest'
import { DefaultReconciler } from '../runtime/reconciler'
import type { SemanticVerdict } from '../../engine/agent/verdict'
import type { SystemVerdict, ScoredCandidate } from '../types/verdict'

// ── Test Fixtures ──

const createScoredCandidate = (
  id: string,
  label: string,
  rawScore: number = 0.5,
): ScoredCandidate => ({
  candidateId: id,
  label,
  rawScore,
  normalizedScore: rawScore,
  confidence: 0.8,
  triggeredRuleIds: [],
  blockingRuleIds: [],
  rationale: `${label} rationale`,
})

const createSystemVerdict = (
  recommendedId: string | undefined,
  candidates: ScoredCandidate[],
  vetoedIds: string[] = [],
): SystemVerdict => ({
  recommendedCandidateId: recommendedId,
  candidates,
  vetoedLabels: [],
  vetoedIds,
  generatedAt: Date.now(),
})

const createSemanticVerdict = (answer: string): SemanticVerdict => ({
  answer,
  rationale: '模型推理',
  entities: [],
  confidence: 0.8,
})

describe('DefaultReconciler', () => {
  const reconciler = new DefaultReconciler()

  describe('Agreement scenarios', () => {
    it('model HIGH matches system HIGH → agreed=true', () => {
      const modelVerdict = createSemanticVerdict('HIGH')
      const candidates = [
        createScoredCandidate('c1', 'HIGH', 0.8),
        createScoredCandidate('c2', 'LOW', 0.3),
      ]
      const systemVerdict = createSystemVerdict('c1', candidates)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(true)
      expect(result.modelCandidateId).toBe('HIGH')
      expect(result.systemCandidateId).toBe('c1')
      expect(result.reason).toBeUndefined()
    })

    it('model LOW matches system LOW (different case) → agreed=true', () => {
      const modelVerdict = createSemanticVerdict('low') // lowercase
      const ranking = [
        createScoredCandidate('c1', 'HIGH', 0.8),
        createScoredCandidate('c2', 'LOW', 0.3),
      ]
      const systemVerdict = createSystemVerdict('c2', ranking)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(true)
      expect(result.modelCandidateId).toBe('LOW')
    })

    it('model ALLOWED matches system ALLOWED → agreed=true', () => {
      const modelVerdict = createSemanticVerdict('ALLOWED')
      const ranking = [
        createScoredCandidate('c1', 'ALLOWED', 0.9),
        createScoredCandidate('c2', 'DENIED', 0.1),
      ]
      const systemVerdict = createSystemVerdict('c1', ranking)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(true)
    })
  })

  describe('Conflict scenarios', () => {
    it('model ALLOWED, system DENIED → agreed=false with conflict reason', () => {
      const modelVerdict = createSemanticVerdict('ALLOWED')
      const ranking = [
        createScoredCandidate('c1', 'DENIED', 0.8),
        createScoredCandidate('c2', 'ALLOWED', 0.2),
      ]
      const systemVerdict = createSystemVerdict('c1', ranking)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
      expect(result.modelCandidateId).toBe('ALLOWED')
      expect(result.systemCandidateId).toBe('c1')
      expect(result.reason).toContain('ALLOWED')
      expect(result.reason).toContain('DENIED')
    })

    it('model HIGH, system LOW → agreed=false', () => {
      const modelVerdict = createSemanticVerdict('HIGH')
      const ranking = [
        createScoredCandidate('c1', 'LOW', 0.8),
        createScoredCandidate('c2', 'HIGH', 0.3),
      ]
      const systemVerdict = createSystemVerdict('c1', ranking)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('no system recommendation (all vetoed) → agreed=false with reason', () => {
      const modelVerdict = createSemanticVerdict('HIGH')
      const candidates = [
        createScoredCandidate('c1', 'HIGH', -Infinity),
        createScoredCandidate('c2', 'LOW', -Infinity),
      ]
      const systemVerdict = createSystemVerdict(undefined, candidates, ['c1', 'c2'])

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
      expect(result.reason).toContain('无推荐候选')
    })

    it('empty system recommendation → agreed=false', () => {
      const modelVerdict = createSemanticVerdict('HIGH')
      const systemVerdict = createSystemVerdict('', [])

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
    })

    it('model answer does not match any candidate label → agreed=false', () => {
      const modelVerdict = createSemanticVerdict('UNKNOWN')
      const candidates = [
        createScoredCandidate('c1', 'HIGH', 0.8),
        createScoredCandidate('c2', 'LOW', 0.3),
      ]
      const systemVerdict = createSystemVerdict('c1', candidates)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
      expect(result.reason).toContain('不匹配任何候选标签')
      expect(result.reason).toContain('HIGH')
      expect(result.reason).toContain('LOW')
    })

    it('model answer is empty → agreed=false', () => {
      const modelVerdict = createSemanticVerdict('')
      const candidates = [createScoredCandidate('c1', 'HIGH', 0.8)]
      const systemVerdict = createSystemVerdict('c1', candidates)

      const result = reconciler.compare({ modelVerdict, systemVerdict })

      expect(result.agreed).toBe(false)
    })
  })
})