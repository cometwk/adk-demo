import { describe, it, expect, vi } from 'vitest'
import { reasoningPlugin } from '../../../tasks/reasoning/index'
import type { PromptParams, ToolParams, ExecuteParams, PipelineTask } from '../../../core/types'

const mockOntology = {
  version: '1.0.0',
  types: [{ name: 'Merch', description: 'Merchant', properties: [], methods: [] }],
  relations: [],
}

const mockTask: PipelineTask = {
  type: 'reasoning',
  goal: '分析商户',
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

describe('Reasoning TaskPlugin', () => {
  it('should have correct type', () => {
    expect(reasoningPlugin.type).toBe('reasoning')
  })

  it('should implement buildPrompt', () => {
    expect(reasoningPlugin.buildPrompt).toBeDefined()
    const prompt = reasoningPlugin.buildPrompt({
      task: mockTask,
      ontology: mockOntology,
    })
    expect(prompt).toContain('语义推理')
  })

  it('should implement buildTools', () => {
    expect(reasoningPlugin.buildTools).toBeDefined()
    const tools = reasoningPlugin.buildTools({
      runtime: mockRuntime,
      workspace: mockWorkspace,
      policy: mockPolicy,
    })
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('bind_fact')
  })

  it('should implement execute', () => {
    expect(reasoningPlugin.execute).toBeDefined()
    // Execute requires actual model, so we just verify it exists
  })

  it('should not have critique', () => {
    expect(reasoningPlugin.critique).toBeUndefined()
  })

  it('should implement TaskPlugin interface correctly', () => {
    // Type assertion to verify interface compliance
    const plugin: typeof reasoningPlugin = reasoningPlugin
    expect(plugin.type).toBe('reasoning')
    expect(typeof plugin.buildPrompt).toBe('function')
    expect(typeof plugin.buildTools).toBe('function')
    expect(typeof plugin.execute).toBe('function')
  })
})