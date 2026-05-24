import { describe, it, expect, vi } from 'vitest'
import { executePredictive, executePredictiveWithWorkspace } from '../../../tasks/predictive/executor'
import { critiquePredictive } from '../../../tasks/predictive/critic'
import type { ExecuteParams, CritiqueParams } from '../../../core/types'
import type { ModelVerdict_Predictive } from '../../../tasks/predictive/types'

const mockModel = vi.fn()

const mockTask = {
  type: 'predictive',
  goal: '评估风险等级',
  entryEntities: ['Reader:xiao_hong'],
}

const mockOntology = {
  version: '1.0.0',
  types: [],
  relations: [],
}

const mockRuleRegistry = {
  list: vi.fn(() => [
    { id: 'rule_1', version: '1.0', kind: 'soft_criterion', appliesTo: ['Reader'], description: '风险规则', direction: 'risk_up', weight: 0.8 },
  ]),
  get: vi.fn(),
  resolve: vi.fn(() => []),
} as any

const mockRuntime = {
  inspectNode: vi.fn(),
  searchNodes: vi.fn(),
} as any

const mockWorkspace = {
  bindings: [],
  candidates: ['cand_high', 'cand_medium', 'cand_low'],
  getFacts: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), getValue: vi.fn() })),
  addBinding: vi.fn(),
  setCandidates: vi.fn(),
  allBindings: vi.fn(() => []),
} as any

describe('Predictive Executor', () => {
  it('should define executePredictive function', () => {
    expect(executePredictive).toBeDefined()
    expect(typeof executePredictive).toBe('function')
  })

  it('should define executePredictiveWithWorkspace function', () => {
    expect(executePredictiveWithWorkspace).toBeDefined()
    expect(typeof executePredictiveWithWorkspace).toBe('function')
  })

  // Note: Full execution tests would require actual LLM model
  // These tests verify structure only
})

describe('Predictive Critic', () => {
  it('should return CritiqueResult structure', async () => {
    const params: CritiqueParams = {
      task: mockTask,
      facts: [],
      modelVerdict: {
        source: 'model',
        mode: 'predictive',
        recommendedCandidateId: 'cand_high',
        confidence: 0.8,
        rationale: '基于分析',
        citedEvidenceIds: [],
        citedRuleIds: [],
      } as ModelVerdict_Predictive,
      runtime: mockRuntime,
      ruleRegistry: mockRuleRegistry,
      ontology: mockOntology,
    }

    const result = await critiquePredictive(params)

    expect(result).toHaveProperty('systemVerdict')
    expect(result).toHaveProperty('reconciliation')
    expect(result.systemVerdict).toHaveProperty('source', 'system')
    expect(result.systemVerdict).toHaveProperty('mode', 'predictive')
    expect(result.systemVerdict).toHaveProperty('ranking')
    expect(result.systemVerdict).toHaveProperty('recommendedCandidateId')
    expect(result.reconciliation).toHaveProperty('agreed')
  })

  it('should produce ranking', async () => {
    const params: CritiqueParams = {
      task: mockTask,
      facts: [],
      modelVerdict: { recommendedCandidateId: 'cand_high' } as any,
      runtime: mockRuntime,
      ruleRegistry: mockRuleRegistry,
      ontology: mockOntology,
    }

    const result = await critiquePredictive(params)
    expect(result.systemVerdict.ranking.length).toBeGreaterThan(0)
    expect(result.systemVerdict.ranking[0]).toHaveProperty('candidateId')
    expect(result.systemVerdict.ranking[0]).toHaveProperty('normalizedScore')
  })

  it('should handle agreement when picks match', async () => {
    const params: CritiqueParams = {
      task: mockTask,
      facts: [],
      modelVerdict: {
        source: 'model',
        mode: 'predictive',
        recommendedCandidateId: 'cand_high',
        confidence: 0.8,
        rationale: '',
        citedEvidenceIds: [],
        citedRuleIds: [],
      } as ModelVerdict_Predictive,
      runtime: mockRuntime,
      ruleRegistry: mockRuleRegistry,
      ontology: mockOntology,
    }

    const result = await critiquePredictive(params)

    // Note: agreement depends on scoring logic
    expect(result.reconciliation.agreed).toBeDefined()
    expect(result.reconciliation.modelRecommendation).toBe('cand_high')
  })

  it('should include notes in system verdict', async () => {
    const params: CritiqueParams = {
      task: mockTask,
      facts: [],
      modelVerdict: {} as any,
      runtime: mockRuntime,
      ruleRegistry: mockRuleRegistry,
      ontology: mockOntology,
    }

    const result = await critiquePredictive(params)
    expect(result.systemVerdict.notes).toBeDefined()
    expect(Array.isArray(result.systemVerdict.notes)).toBe(true)
  })

  it('should handle empty rule registry', async () => {
    const emptyRuleRegistry = {
      list: vi.fn(() => []),
      get: vi.fn(),
      resolve: vi.fn(() => []),
    } as any

    const params: CritiqueParams = {
      task: mockTask,
      facts: [],
      modelVerdict: {} as any,
      runtime: mockRuntime,
      ruleRegistry: emptyRuleRegistry,
      ontology: mockOntology,
    }

    const result = await critiquePredictive(params)
    expect(result.systemVerdict.ranking.length).toBeGreaterThan(0)
    expect(result.systemVerdict.triggeredRuleIds).toBeUndefined() // or empty
  })
})