import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PipelineSession, type SessionDeps } from '../core/session'
import type {
  TaskPlugin,
  PipelineTask,
  PipelineResult,
  PromptParams,
  ToolParams,
  ExecuteParams,
  TaskExecuteResult,
  CritiqueParams,
  CritiqueResult,
} from '../core/types'
import { TaskTypeNotFoundError, PromptBuildError } from '../core/types'
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

const mockModel = { modelId: 'test-model' } as any

const baseDeps: SessionDeps = {
  graphStore: mockGraphStore,
  computeStore: mockComputeStore,
  vectorStore: mockVectorStore,
  ontology: mockOntology,
  ruleRegistry: mockRuleRegistry,
  model: mockModel,
}

// ── Mock Plugin ──

const testPlugin: TaskPlugin = {
  type: 'test',
  buildPrompt: (_params: PromptParams) => 'test system prompt',
  buildTools: (_params: ToolParams) => ({ test_tool: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: { answer: 'test' },
    rawText: 'test output',
  }),
}

// ── Helpers ──

// Mock generateText to avoid real LLM calls
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: '```json\n{"verdict":{"answer":"mock answer","entities":[],"rationale":"mock","confidence":0.9}}\n```',
      response: {
        messages: [{ role: 'assistant' as const, content: 'mock response' }],
      },
    }),
  }
})

function createSession(task?: PipelineTask, plugin?: TaskPlugin): PipelineSession {
  const t = task ?? { type: 'test', goal: 'test goal' }
  const session = new PipelineSession(t, baseDeps)
  session._setPlugin(plugin ?? testPlugin)
  return session
}

// ── Tests ──

describe('PipelineSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('run()', () => {
    it('should return PipelineResult with correct taskType', async () => {
      const session = createSession()
      const result = await session.run()
      expect(result.taskType).toBe('test')
      expect(result.rawText).toBeDefined()
      expect(result.facts).toBeInstanceOf(Array)
    })

    it('should throw TaskTypeNotFoundError when no plugin set', async () => {
      const session = new PipelineSession({ type: 'missing', goal: 'test' }, baseDeps)
      await expect(session.run()).rejects.toThrow(TaskTypeNotFoundError)
    })

    it('should throw PromptBuildError when buildPrompt fails', async () => {
      const badPlugin: TaskPlugin = {
        type: 'bad',
        buildPrompt: () => { throw new Error('build failed') },
        buildTools: () => ({}),
        execute: async () => ({ facts: [], modelVerdict: {}, rawText: '' }),
      }
      const session = createSession({ type: 'bad', goal: 'test' }, badPlugin)
      await expect(session.run()).rejects.toThrow(PromptBuildError)
    })

    it('should initialize messages with user message', async () => {
      const session = createSession({ type: 'test', goal: 'test goal', entryEntities: ['E1', 'E2'] })
      await session.run()
      const history = session.getHistory()
      expect(history.length).toBeGreaterThanOrEqual(2)
      expect(history[0]).toEqual({ role: 'user', content: '请分析以下实体：E1, E2。\n问题：test goal' })
    })

    it('should use goal directly when no entryEntities', async () => {
      const session = createSession({ type: 'test', goal: 'just the goal' })
      await session.run()
      const history = session.getHistory()
      expect(history[0]).toEqual({ role: 'user', content: 'just the goal' })
    })

    it('should include systemVerdict when plugin has critique', async () => {
      const pluginWithCritique: TaskPlugin = {
        type: 'test',
        buildPrompt: () => 'prompt',
        buildTools: () => ({}),
        execute: async () => ({ facts: [], modelVerdict: {}, rawText: 'output' }),
        critique: async (): Promise<CritiqueResult> => ({
          systemVerdict: { score: 0.9 },
          reconciliation: {
            agreed: true,
            modelRecommendation: 'test',
            systemRecommendation: 'test',
            discrepancies: [],
            rationale: 'ok',
          },
        }),
      }
      const session = createSession(undefined, pluginWithCritique)
      const result = await session.run()
      expect(result.systemVerdict).toEqual({ score: 0.9 })
    })

    it('should not throw when critique fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const pluginWithBadCritique: TaskPlugin = {
        type: 'test',
        buildPrompt: () => 'prompt',
        buildTools: () => ({}),
        execute: async () => ({ facts: [], modelVerdict: {}, rawText: 'output' }),
        critique: async () => { throw new Error('critique boom') },
      }
      const session = createSession(undefined, pluginWithBadCritique)
      const result = await session.run()
      expect(result.systemVerdict).toBeUndefined()
      warnSpy.mockRestore()
    })
  })

  describe('chat()', () => {
    it('should throw if run() not called first', async () => {
      const session = createSession()
      await expect(session.chat('hello')).rejects.toThrow('Session must call run() before chat()')
    })

    it('should return PipelineResult after run()', async () => {
      const session = createSession()
      await session.run()
      const result = await session.chat('follow up question')
      expect(result.taskType).toBe('test')
      expect(result.rawText).toBeDefined()
      expect(result.facts).toBeInstanceOf(Array)
    })

    it('should accumulate messages across run + chat', async () => {
      const session = createSession()
      await session.run()
      await session.chat('question 1')
      await session.chat('question 2')
      const history = session.getHistory()
      // user + assistant from run, user + assistant from chat1, user + assistant from chat2
      expect(history.length).toBe(6)
      expect(history[2]).toEqual({ role: 'user', content: 'question 1' })
      expect(history[4]).toEqual({ role: 'user', content: 'question 2' })
    })

    it('should accumulate workspace facts across chat turns', async () => {
      const session = createSession()
      await session.run()
      const factsAfterRun = session.getFacts().length
      await session.chat('more analysis')
      const factsAfterChat = session.getFacts().length
      // Facts should at least not decrease
      expect(factsAfterChat).toBeGreaterThanOrEqual(factsAfterRun)
    })
  })

  describe('getFacts()', () => {
    it('should return empty array before run()', () => {
      const session = createSession()
      expect(session.getFacts()).toEqual([])
    })

    it('should return facts after run()', async () => {
      const session = createSession()
      await session.run()
      expect(session.getFacts()).toBeInstanceOf(Array)
    })
  })

  describe('getHistory()', () => {
    it('should return empty array before run()', () => {
      const session = createSession()
      expect(session.getHistory()).toEqual([])
    })

    it('should return messages after run()', async () => {
      const session = createSession()
      await session.run()
      const history = session.getHistory()
      expect(history.length).toBeGreaterThanOrEqual(2)
    })

    it('should return a copy, not the internal array', async () => {
      const session = createSession()
      await session.run()
      const history1 = session.getHistory()
      const history2 = session.getHistory()
      expect(history1).not.toBe(history2) // different reference
      expect(history1).toEqual(history2) // same content
    })
  })
})
