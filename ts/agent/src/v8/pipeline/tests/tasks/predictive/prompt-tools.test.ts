import { describe, it, expect, vi } from 'vitest'
import { buildPredictivePrompt } from '../../../tasks/predictive/prompt'
import { createPredictiveTools, getCounterfactualOffers, resetCounterfactuals } from '../../../tasks/predictive/tools'
import type { PromptParams } from '../../../core/types'

const mockOntology = {
  version: '1.0.0',
  types: [
    { name: 'Reader', description: 'Library reader', properties: [{ name: 'name', type: 'string', description: 'Reader name' }], methods: [] },
    { name: 'Book', description: 'Library book', properties: [{ name: 'title', type: 'string', description: 'Book title' }], methods: [] },
  ],
  relations: [
    { type: 'borrows', fromType: 'Reader', toType: 'Book', description: 'Reader borrows book' },
  ],
}

const mockTask = {
  type: 'predictive',
  goal: '评估读者风险等级',
}

const mockRuntime = {
  inspectNode: vi.fn(),
  searchNodes: vi.fn(),
  queryNeighbors: vi.fn(),
  executeGraphQuery: vi.fn(),
  executeComputeQuery: vi.fn(),
  executeVectorQuery: vi.fn(),
} as any

const mockWorkspace = {
  bindings: [],
  candidates: [],
  getFacts: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), getValue: vi.fn(), forEntity: vi.fn(() => []) })),
  addBinding: vi.fn(),
  setCandidates: vi.fn(),
  allBindings: vi.fn(() => []),
} as any

const mockPolicy = {
  principal: { userId: 'test', roles: ['admin'] },
  scope: {},
  redaction: { sensitiveProperties: [], mode: 'drop' },
  audit: { logToolCalls: false, logFactReads: false },
} as any

describe('Predictive Prompt', () => {
  it('should build prompt with ontology section', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildPredictivePrompt(params)
    expect(prompt).toContain('前向推断')
    expect(prompt).toContain('Ontology')
    expect(prompt).toContain('Reader')
    expect(prompt).toContain('Book')
  })

  it('should include rules when provided', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
      rules: [
        { id: 'rule_1', version: '1.0', kind: 'soft_criterion', appliesTo: ['Reader'], description: '风险规则', direction: 'risk_up', weight: 0.8 },
      ],
    }
    const prompt = buildPredictivePrompt(params)
    expect(prompt).toContain('规则摘要')
    expect(prompt).toContain('rule_1')
    expect(prompt).toContain('风险规则')
  })

  it('should include task instructions', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildPredictivePrompt(params)
    expect(prompt).toContain('候选与证据')
    expect(prompt).toContain('评分边界')
    expect(prompt).toContain('输出格式')
    expect(prompt).toContain('recommendedCandidateId')
  })

  it('should include custom context', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
      customContext: '自定义扩展：重点关注逾期记录',
    }
    const prompt = buildPredictivePrompt(params)
    expect(prompt).toContain('自定义扩展：重点关注逾期记录')
  })

  it('should mention counterfactual simulation', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildPredictivePrompt(params)
    expect(prompt).toContain('反事实模拟')
    expect(prompt).toContain('simulate_counterfactual')
  })
})

describe('Predictive Tools', () => {
  it('should create all tool categories', () => {
    const tools = createPredictiveTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('search_nodes')
    expect(tools).toHaveProperty('query_neighbors')
    expect(tools).toHaveProperty('graph_query')
    expect(tools).toHaveProperty('compute_query')
    expect(tools).toHaveProperty('vector_query')
    expect(tools).toHaveProperty('bind_fact')
    expect(tools).toHaveProperty('lookup_fact')
    expect(tools).toHaveProperty('propose_candidates')
    expect(tools).toHaveProperty('record_evidence')
    expect(tools).toHaveProperty('declare_uncertainty')
    expect(tools).toHaveProperty('simulate_counterfactual')
  })

  it('should reset counterfactual offers on each create', () => {
    resetCounterfactuals()
    // Simulate adding offers
    const offersBefore = getCounterfactualOffers()
    expect(offersBefore).toHaveLength(0)

    // Create tools again resets
    createPredictiveTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(getCounterfactualOffers()).toHaveLength(0)
  })

  it('should have simulate_counterfactual tool defined', () => {
    const tools = createPredictiveTools(mockRuntime, mockWorkspace, mockPolicy)
    const simTool = tools.simulate_counterfactual
    expect(simTool).toBeDefined()
    expect(simTool.description).toContain('反事实提议')
  })
})