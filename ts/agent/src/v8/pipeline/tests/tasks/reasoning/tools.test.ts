import { describe, it, expect, vi } from 'vitest'
import { createReasoningTools } from '../../../tasks/reasoning/tools'

// Mock RuntimeOrchestrator
const mockRuntime = {
  inspectNode: vi.fn(),
  searchNodes: vi.fn(),
  queryNeighbors: vi.fn(),
  executeGraphQuery: vi.fn(),
  executeComputeQuery: vi.fn(),
  executeVectorQuery: vi.fn(),
} as any

// Mock Workspace
const mockWorkspace = {
  bindings: [],
  candidates: [],
  getFacts: vi.fn(() => ({
    get: vi.fn(),
    all: vi.fn(() => []),
    getValue: vi.fn(),
    forEntity: vi.fn(() => []),
  })),
  addBinding: vi.fn(),
  addBindings: vi.fn(),
  setCandidates: vi.fn(),
  allBindings: vi.fn(() => []),
} as any

// Mock Policy
const mockPolicy = {
  principal: { userId: 'test', roles: ['admin'] },
  scope: {},
  redaction: { sensitiveProperties: [], mode: 'drop' },
  audit: { logToolCalls: false, logFactReads: false },
} as any

describe('Reasoning Tools', () => {
  it('should create all graph tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('inspect_node')
    expect(tools).toHaveProperty('search_nodes')
    expect(tools).toHaveProperty('query_neighbors')
    expect(tools).toHaveProperty('graph_query')
  })

  it('should create compute tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('compute_query')
  })

  it('should create vector tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('vector_query')
  })

  it('should create fact tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('bind_fact')
    expect(tools).toHaveProperty('lookup_fact')
  })

  it('should create candidate tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    expect(tools).toHaveProperty('propose_candidates')
    expect(tools).toHaveProperty('record_evidence')
    expect(tools).toHaveProperty('declare_uncertainty')
    expect(tools).toHaveProperty('list_workspace')
  })

  it('should return tool object with all expected tools', () => {
    const tools = createReasoningTools(mockRuntime, mockWorkspace, mockPolicy)
    const expectedTools = [
      'inspect_node',
      'search_nodes',
      'query_neighbors',
      'graph_query',
      'compute_query',
      'vector_query',
      'bind_fact',
      'lookup_fact',
      'propose_candidates',
      'record_evidence',
      'declare_uncertainty',
      'list_workspace',
    ]
    for (const name of expectedTools) {
      expect(tools).toHaveProperty(name)
    }
  })
})