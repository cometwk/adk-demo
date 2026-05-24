import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PipelineContext, newPipelineContext } from '../core/context'
import { InMemoryTaskRegistry } from '../core/registry'
import type {
  TaskPlugin,
  PipelineDeps,
  PromptParams,
  ToolParams,
  ExecuteParams,
  TaskExecuteResult,
  CritiqueParams,
  CritiqueResult,
} from '../core/types'
import { TaskTypeNotFoundError, PromptBuildError, ExecuteError } from '../core/types'
import type { Ontology } from '../../ontology/schema'

// Mock stores
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

// Mock plugin that succeeds
const successPlugin: TaskPlugin = {
  type: 'test-success',
  buildPrompt: (_params: PromptParams) => 'test system prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [{ entityId: 'test', property: 'value', value: 1, source: { kind: 'graph_property' }, confidence: 1, validFrom: '', observedAt: '' }],
    modelVerdict: { answer: 'success' },
    rawText: 'test output',
  }),
}

// Mock plugin with critique
const pluginWithCritique: TaskPlugin = {
  type: 'test-with-critique',
  buildPrompt: (_params: PromptParams) => 'test system prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: { answer: 'test' },
    rawText: 'test output',
  }),
  critique: async (_params: CritiqueParams): Promise<CritiqueResult> => ({
    systemVerdict: { score: 0.8 },
    reconciliation: {
      agreed: true,
      modelRecommendation: 'test',
      systemRecommendation: 'test',
      discrepancies: [],
      rationale: 'full agreement',
    },
  }),
}

// Mock plugin that throws in buildPrompt
const promptErrorPlugin: TaskPlugin = {
  type: 'test-prompt-error',
  buildPrompt: (_params: PromptParams) => {
    throw new Error('Prompt build failed')
  },
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: {},
    rawText: '',
  }),
}

// Mock plugin that throws in execute
const executeErrorPlugin: TaskPlugin = {
  type: 'test-execute-error',
  buildPrompt: (_params: PromptParams) => 'test prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => {
    throw new Error('Execute failed')
  },
}

// Mock plugin with failing critique
const critiqueFailPlugin: TaskPlugin = {
  type: 'test-critique-fail',
  buildPrompt: (_params: PromptParams) => 'test prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: { answer: 'test' },
    rawText: 'output',
  }),
  critique: async (_params: CritiqueParams): Promise<CritiqueResult> => {
    throw new Error('Critique failed')
  },
}

describe('PipelineContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should instantiate with minimal deps and auto-register reasoningPlugin', () => {
      const ctx = newPipelineContext(minimalDeps)
      expect(ctx.registry).toBeDefined()
      expect(ctx.registry.list()).toContain('reasoning')
    })

    it('should register plugins from deps', () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [successPlugin],
      })
      expect(ctx.registry.list()).toContain('test-success')
    })
  })

  describe('runTask', () => {
    it('should return result with known type', async () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [successPlugin],
      })
      const result = await ctx.runTask('test-success', { goal: 'test goal' })
      expect(result.taskType).toBe('test-success')
      expect(result.facts).toHaveLength(1)
      expect(result.modelVerdict).toEqual({ answer: 'success' })
      expect(result.rawText).toBe('test output')
    })

    it('should throw TaskTypeNotFoundError for unknown type', async () => {
      const ctx = newPipelineContext(minimalDeps)
      await expect(ctx.runTask('unknown', { goal: 'test' })).rejects.toThrow(TaskTypeNotFoundError)
    })

    it('should throw PromptBuildError when buildPrompt throws', async () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [promptErrorPlugin],
      })
      await expect(ctx.runTask('test-prompt-error', { goal: 'test' })).rejects.toThrow(PromptBuildError)
    })

    it('should throw ExecuteError when execute throws', async () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [executeErrorPlugin],
      })
      await expect(ctx.runTask('test-execute-error', { goal: 'test' })).rejects.toThrow(ExecuteError)
    })

    it('should return result without systemVerdict when critique throws', async () => {
      // Mock console.warn to suppress warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [critiqueFailPlugin],
      })
      const result = await ctx.runTask('test-critique-fail', { goal: 'test' })
      expect(result.taskType).toBe('test-critique-fail')
      expect(result.systemVerdict).toBeUndefined()
      expect(result.reconciliation).toBeUndefined()

      warnSpy.mockRestore()
    })

    it('should include systemVerdict when critique succeeds', async () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [pluginWithCritique],
      })
      const result = await ctx.runTask('test-with-critique', { goal: 'test' })
      expect(result.systemVerdict).toEqual({ score: 0.8 })
      expect(result.reconciliation?.agreed).toBe(true)
    })
  })

  describe('run (auto-routing)', () => {
    // Skip tests that require LLM calls
    it.skip('should route to reasoning task by default', async () => {
      const ctx = newPipelineContext({
        ...minimalDeps,
        plugins: [successPlugin],
      })
      // reasoningPlugin is auto-registered now
      const result = await ctx.run('test query')
      expect(result).toHaveProperty('taskType')
      // Check it's a PipelineResult, not ClarificationRequest
      expect('facts' in result).toBe(true)
    })
  })
})