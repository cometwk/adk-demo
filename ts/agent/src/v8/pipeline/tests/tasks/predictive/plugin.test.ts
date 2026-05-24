import { describe, it, expect, vi } from 'vitest'
import { predictivePlugin } from '../../../tasks/predictive/index'
import type { PromptParams, ToolParams, PipelineTask } from '../../../core/types'

const mockOntology = {
  version: '1.0.0',
  types: [{ name: 'Reader', description: 'Library reader', properties: [], methods: [] }],
  relations: [],
}

const mockTask: PipelineTask = {
  type: 'predictive',
  goal: '评估风险等级',
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

describe('Predictive TaskPlugin', () => {
  it('should have correct type', () => {
    expect(predictivePlugin.type).toBe('predictive')
  })

  it('should implement buildPrompt', () => {
    expect(predictivePlugin.buildPrompt).toBeDefined()
    const prompt = predictivePlugin.buildPrompt({
      task: mockTask,
      ontology: mockOntology,
    })
    expect(prompt).toContain('前向推断')
  })

  it('should implement buildTools', () => {
    expect(predictivePlugin.buildTools).toBeDefined()
    const tools = predictivePlugin.buildTools({
      runtime: mockRuntime,
      workspace: mockWorkspace,
      policy: mockPolicy,
    })
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('propose_candidates')
    expect(tools).toHaveProperty('simulate_counterfactual')
  })

  it('should implement execute', () => {
    expect(predictivePlugin.execute).toBeDefined()
  })

  it('should implement critique', () => {
    expect(predictivePlugin.critique).toBeDefined()
    // Predictive has critique (MCDA + veto)
  })

  it('should implement TaskPlugin interface correctly', () => {
    const plugin: typeof predictivePlugin = predictivePlugin
    expect(plugin.type).toBe('predictive')
    expect(typeof plugin.buildPrompt).toBe('function')
    expect(typeof plugin.buildTools).toBe('function')
    expect(typeof plugin.execute).toBe('function')
    expect(typeof plugin.critique).toBe('function')
  })

  it('should include counterfactual tools', () => {
    const tools = predictivePlugin.buildTools({
      runtime: mockRuntime,
      workspace: mockWorkspace,
      policy: mockPolicy,
    })
    expect(tools).toHaveProperty('simulate_counterfactual')
  })
})