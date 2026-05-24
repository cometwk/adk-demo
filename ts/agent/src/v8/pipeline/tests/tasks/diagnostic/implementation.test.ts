import { describe, it, expect, vi } from 'vitest'
import { diagnosticPlugin } from '../../../tasks/diagnostic/index'
import { buildDiagnosticPrompt } from '../../../tasks/diagnostic/prompt'
import { createDiagnosticTools } from '../../../tasks/diagnostic/tools'
import type { PromptParams, ToolParams, PipelineTask } from '../../../core/types'

const mockOntology = {
  version: '1.0.0',
  types: [{ name: 'Merch', description: 'Merchant', properties: [], methods: [] }],
  relations: [],
}

const mockTask: PipelineTask = {
  type: 'diagnostic',
  goal: '分析交易量骤降原因',
  entryEntities: ['Merch:M001'],
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

describe('Diagnostic Prompt', () => {
  it('should build prompt with ontology section', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildDiagnosticPrompt(params)
    expect(prompt).toContain('后向归因')
    expect(prompt).toContain('Ontology')
  })

  it('should include causal tracing instructions', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildDiagnosticPrompt(params)
    expect(prompt).toContain('因果路径追踪')
    expect(prompt).toContain('trace_causal')
  })

  it('should include output format', () => {
    const params: PromptParams = {
      task: mockTask,
      ontology: mockOntology,
    }
    const prompt = buildDiagnosticPrompt(params)
    expect(prompt).toContain('rankedAttributions')
    expect(prompt).toContain('attributionScore')
  })
})

describe('Diagnostic Tools', () => {
  it('should create all tool categories', () => {
    const tools = createDiagnosticTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('search_nodes')
    expect(tools).toHaveProperty('trace_causal')
    expect(tools).toHaveProperty('query_events')
    expect(tools).toHaveProperty('record_cause')
  })

  it('should have causal-specific tools', () => {
    const tools = createDiagnosticTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('trace_causal')
    expect(tools).toHaveProperty('query_events')
    expect(tools).toHaveProperty('record_cause')
  })
})

describe('Diagnostic TaskPlugin', () => {
  it('should have correct type', () => {
    expect(diagnosticPlugin.type).toBe('diagnostic')
  })

  it('should implement buildPrompt', () => {
    expect(diagnosticPlugin.buildPrompt).toBeDefined()
    const prompt = diagnosticPlugin.buildPrompt({
      task: mockTask,
      ontology: mockOntology,
    })
    expect(prompt).toContain('后向归因')
  })

  it('should implement buildTools', () => {
    expect(diagnosticPlugin.buildTools).toBeDefined()
    const tools = diagnosticPlugin.buildTools({
      runtime: mockRuntime,
      workspace: mockWorkspace,
      policy: mockPolicy,
    })
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('trace_causal')
  })

  it('should implement execute', () => {
    expect(diagnosticPlugin.execute).toBeDefined()
  })

  it('should implement critique', () => {
    expect(diagnosticPlugin.critique).toBeDefined()
    // Diagnostic has critique (4-dimension attribution)
  })

  it('should implement TaskPlugin interface correctly', () => {
    const plugin: typeof diagnosticPlugin = diagnosticPlugin
    expect(plugin.type).toBe('diagnostic')
    expect(typeof plugin.buildPrompt).toBe('function')
    expect(typeof plugin.buildTools).toBe('function')
    expect(typeof plugin.execute).toBe('function')
    expect(typeof plugin.critique).toBe('function')
  })
})