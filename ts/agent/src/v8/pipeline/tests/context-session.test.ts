import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PipelineContext, newPipelineContext } from '../core/context'
import type {
  TaskPlugin,
  PipelineDeps,
  PromptParams,
  ToolParams,
  ExecuteParams,
  TaskExecuteResult,
} from '../core/types'
import { TaskTypeNotFoundError } from '../core/types'
import type { Ontology } from '../../ontology/schema'

// ── Mock Stores ──

const mockGraphStore = {
  getNode: vi.fn(),
  findNodes: vi.fn(),
  getNeighbors: vi.fn(),
  query: vi.fn(),
} as any

const mockComputeStore = {
  aggregate: vi.fn(),
} as any

const mockVectorStore = {
  search: vi.fn(),
} as any

const mockOntology: Ontology = {
  version: '1.0.0',
  types: [{ name: 'TestType', description: 'Test', properties: [], methods: [] }],
  relations: [],
}

const mockRuleRegistry = {
  register: vi.fn(),
  get: vi.fn(),
  resolve: vi.fn(),
  list: vi.fn(() => []),
  clear: vi.fn(),
} as any

const minimalDeps: PipelineDeps = {
  graphStore: mockGraphStore,
  computeStore: mockComputeStore,
  vectorStore: mockVectorStore,
  ontology: mockOntology,
  ruleRegistry: mockRuleRegistry,
}

const testPlugin: TaskPlugin = {
  type: 'test-session',
  buildPrompt: (_params: PromptParams) => 'test system prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: { answer: 'test' },
    rawText: 'test output',
  }),
}

describe('PipelineContext.createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a PipelineSession instance', () => {
    const ctx = newPipelineContext({
      ...minimalDeps,
      plugins: [testPlugin],
    })
    const session = ctx.createSession({ type: 'test-session', goal: 'test goal' })
    expect(session).toBeDefined()
    expect(typeof session.run).toBe('function')
    expect(typeof session.chat).toBe('function')
    expect(typeof session.getFacts).toBe('function')
    expect(typeof session.getHistory).toBe('function')
  })

  it('should throw TaskTypeNotFoundError for unknown type', () => {
    const ctx = newPipelineContext(minimalDeps)
    expect(() => ctx.createSession({ type: 'unknown', goal: 'test' })).toThrow(TaskTypeNotFoundError)
  })

  it('should not affect runTask() behavior', async () => {
    const ctx = newPipelineContext({
      ...minimalDeps,
      plugins: [testPlugin],
    })

    // runTask should still work
    const result = await ctx.runTask('test-session', { goal: 'test' })
    expect(result.taskType).toBe('test-session')

    // createSession should also work
    const session = ctx.createSession({ type: 'test-session', goal: 'another test' })
    expect(session).toBeDefined()
  })
})
