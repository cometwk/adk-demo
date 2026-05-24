import { describe, it, expect } from 'vitest'
import type {
  TaskType,
  PipelineTask,
  PipelineResult,
  ClarificationQuestion,
  ClarificationRequest,
  TaskPlugin,
  PromptParams,
  ToolParams,
  ExecuteParams,
  CritiqueParams,
  TaskExecuteResult,
  CritiqueResult,
  Frontend,
  FrontendResult,
  Reconciliation,
  TaskTypeNotFoundError,
  PromptBuildError,
  ExecuteError,
} from '../core/types'

describe('Core Types', () => {
  describe('TaskType', () => {
    it('should accept string values', () => {
      const type: TaskType = 'reasoning'
      expect(type).toBe('reasoning')
    })

    it('should accept custom task types', () => {
      const type: TaskType = 'custom-analysis'
      expect(type).toBe('custom-analysis')
    })
  })

  describe('PipelineTask', () => {
    it('should accept minimal task with type and goal', () => {
      const task: PipelineTask = {
        type: 'reasoning',
        goal: 'Analyze entity',
      }
      expect(task.type).toBe('reasoning')
      expect(task.goal).toBe('Analyze entity')
    })

    it('should accept full task with all optional fields', () => {
      const task: PipelineTask = {
        type: 'predictive',
        goal: 'Predict risk',
        entryEntities: ['Merch:M001'],
        intent: 'risk_assessment',
        context: { threshold: 0.8 },
      }
      expect(task.entryEntities).toEqual(['Merch:M001'])
      expect(task.context).toEqual({ threshold: 0.8 })
    })

    it('should accept Record<string, unknown> for context', () => {
      const task: PipelineTask = {
        type: 'reasoning',
        goal: 'Test',
        context: {
          nested: { value: 123 },
          array: [1, 2, 3],
          string: 'hello',
        },
      }
      expect(task.context?.nested).toEqual({ value: 123 })
    })
  })

  describe('ClarificationQuestion', () => {
    it('should accept question without options', () => {
      const q: ClarificationQuestion = {
        id: 'q1',
        question: 'Which entity?',
      }
      expect(q.options).toBeUndefined()
    })

    it('should accept question with options', () => {
      const q: ClarificationQuestion = {
        id: 'q1',
        question: 'Select one:',
        options: ['Option A', 'Option B'],
      }
      expect(q.options).toHaveLength(2)
    })
  })

  describe('ClarificationRequest', () => {
    it('should combine questions with original query', () => {
      const req: ClarificationRequest = {
        questions: [{ id: 'q1', question: 'Which?' }],
        originalQuery: '分析商户',
      }
      expect(req.originalQuery).toBe('分析商户')
    })
  })

  describe('PipelineResult', () => {
    it('should accept minimal result', () => {
      const result: PipelineResult = {
        taskType: 'reasoning',
        facts: [],
        modelVerdict: { answer: 'test' },
        rawText: 'output',
      }
      expect(result.systemVerdict).toBeUndefined()
      expect(result.reconciliation).toBeUndefined()
    })

    it('should accept result with system verdict and reconciliation', () => {
      const result: PipelineResult = {
        taskType: 'predictive',
        facts: [],
        modelVerdict: { recommendation: 'A' },
        systemVerdict: { recommendedCandidateId: 'A' },
        reconciliation: {
          agreed: true,
          modelRecommendation: 'A',
          systemRecommendation: 'A',
          discrepancies: [],
          rationale: 'Full agreement',
        },
        rawText: 'output',
      }
      expect(result.reconciliation?.agreed).toBe(true)
    })
  })

  describe('TaskPlugin interface', () => {
    it('should type-check correctly for plugin with all methods', () => {
      const plugin: TaskPlugin = {
        type: 'test',
        buildPrompt: (_params: PromptParams) => 'prompt',
        buildTools: (_params: ToolParams) => ({ tool1: {} as any }),
        execute: async (_params: ExecuteParams) => ({
          facts: [],
          modelVerdict: {},
          rawText: '',
        }),
        critique: async (_params: CritiqueParams) => ({
          systemVerdict: {},
        }),
      }
      expect(plugin.type).toBe('test')
      expect(plugin.critique).toBeDefined()
    })

    it('should type-check correctly for plugin without critique', () => {
      const plugin: TaskPlugin = {
        type: 'reasoning',
        buildPrompt: (_params: PromptParams) => 'prompt',
        buildTools: (_params: ToolParams) => ({ tool1: {} as any }),
        execute: async (_params: ExecuteParams) => ({
          facts: [],
          modelVerdict: {},
          rawText: '',
        }),
        // critique is optional - not provided
      }
      expect(plugin.critique).toBeUndefined()
    })
  })

  describe('Frontend interface', () => {
    it('should type-check for ready result', () => {
      const result: FrontendResult = {
        status: 'ready',
        task: { type: 'reasoning', goal: 'test' },
      }
      expect(result.status).toBe('ready')
    })

    it('should type-check for clarify result', () => {
      const result: FrontendResult = {
        status: 'clarify',
        questions: [{ id: 'q1', question: 'Which?' }],
      }
      expect(result.status).toBe('clarify')
    })
  })

  describe('Error types', () => {
    it('TaskTypeNotFoundError should have correct properties', () => {
      class MockTaskTypeNotFoundError extends Error {
        readonly type = 'task_type_not_found'
        readonly taskType: string
        constructor(taskType: string) {
          super(`Task type '${taskType}' not found`)
          this.name = 'TaskTypeNotFoundError'
          this.taskType = taskType
        }
      }
      const err = new MockTaskTypeNotFoundError('unknown')
      expect(err.type).toBe('task_type_not_found')
      expect(err.taskType).toBe('unknown')
    })

    it('PromptBuildError should wrap cause', () => {
      class MockPromptBuildError extends Error {
        readonly type = 'prompt_build_error'
        readonly taskType: string
        readonly cause: Error
        constructor(taskType: string, cause: Error) {
          super(`Prompt build failed: ${cause.message}`)
          this.name = 'PromptBuildError'
          this.taskType = taskType
          this.cause = cause
        }
      }
      const original = new Error('bad prompt')
      const err = new MockPromptBuildError('test', original)
      expect(err.cause).toBe(original)
    })
  })
})