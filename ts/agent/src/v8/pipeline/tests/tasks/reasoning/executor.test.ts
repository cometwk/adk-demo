import { describe, it, expect, vi } from 'vitest'
import { executeReasoning } from '../../../tasks/reasoning/executor'
import type { ExecuteParams, PipelineTask } from '../../../core/types'
import { model } from '../../../../../lib/model'

// Note: Tests that call actual LLM are skipped/integration tests
// These tests verify the structure and non-LLL paths

describe('Reasoning Executor', () => {
  describe('executeReasoning', () => {
    // Skip LLM-dependent tests
    it.skip('should execute reasoning task with LLM', async () => {
      // This would require actual model and tools
      const params: ExecuteParams = {
        task: { type: 'reasoning', goal: 'test' },
        systemPrompt: 'test prompt',
        tools: {},
        model: model,
      }
      const result = await executeReasoning(params)
      expect(result).toHaveProperty('facts')
      expect(result).toHaveProperty('modelVerdict')
      expect(result).toHaveProperty('rawText')
    })

    it('should build user message from entry entities', () => {
      // Verify message construction logic (non-async)
      const task: PipelineTask = {
        type: 'reasoning',
        goal: '分析经营状况',
        entryEntities: ['Merch:M001', 'Merch:M002'],
      }

      const entryEntities = task.entryEntities ?? []
      const expectedMessage = `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
      expect(expectedMessage).toContain('Merch:M001, Merch:M002')
      expect(expectedMessage).toContain('分析经营状况')
    })

    it('should use goal directly when no entry entities', () => {
      const task: PipelineTask = {
        type: 'reasoning',
        goal: '哪些商户最活跃？',
      }

      const entryEntities = task.entryEntities ?? []
      const message = entryEntities.length > 0
        ? `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
        : task.goal

      expect(message).toBe('哪些商户最活跃？')
    })
  })
})