import { describe, it, expect } from 'vitest'
import { parseVerdict, createFallbackVerdict } from '../../../tasks/reasoning/verdict'
import type { SemanticVerdict, ReasoningTask } from '../../../tasks/reasoning/types'

describe('Reasoning Types and Verdict', () => {
  describe('parseVerdict', () => {
    it('should parse JSON from markdown block', () => {
      const text = `Here is the result:
\`\`\`json
{
  "verdict": {
    "answer": "商户经营状况良好",
    "entities": ["Merch:M001"],
    "rationale": "基于数据分析",
    "confidence": 0.85
  }
}
\`\`\`
`
      const result = parseVerdict(text)
      expect(result).not.toBeNull()
      expect(result?.answer).toBe('商户经营状况良好')
      expect(result?.entities).toContain('Merch:M001')
      expect(result?.confidence).toBe(0.85)
    })

    it('should parse raw JSON without markdown', () => {
      const text = `{"answer": "test answer", "entities": [], "rationale": "test", "confidence": 0.7}`
      const result = parseVerdict(text)
      expect(result).not.toBeNull()
      expect(result?.answer).toBe('test answer')
      expect(result?.confidence).toBe(0.7)
    })

    it('should return null for invalid JSON', () => {
      const text = 'This is not JSON at all'
      const result = parseVerdict(text)
      expect(result).toBeNull()
    })

    it('should return null for empty text', () => {
      const result = parseVerdict('')
      expect(result).toBeNull()
    })

    it('should handle missing fields with defaults', () => {
      const text = `{"answer": "partial answer"}`
      const result = parseVerdict(text)
      expect(result).not.toBeNull()
      expect(result?.entities).toEqual([])
      expect(result?.confidence).toBe(0.5)
    })
  })

  describe('createFallbackVerdict', () => {
    it('should create fallback with truncated answer', () => {
      const rawText = 'This is a very long answer that exceeds 200 characters and should be truncated...'
      const result = createFallbackVerdict(rawText)
      expect(result.answer.length).toBeLessThanOrEqual(200)
      expect(result.entities).toEqual([])
      expect(result.confidence).toBe(0.3)
    })

    it('should include rationale explaining failure', () => {
      const result = createFallbackVerdict('some text')
      expect(result.rationale).toContain('Failed to parse')
    })
  })

  describe('SemanticVerdict type', () => {
    it('should type-check correctly', () => {
      const verdict: SemanticVerdict = {
        answer: 'test',
        entities: ['E1'],
        rationale: 'reason',
        confidence: 0.8,
      }
      expect(verdict.confidence).toBe(0.8)
    })
  })

  describe('ReasoningTask type', () => {
    it('should extend PipelineTask', () => {
      const task: ReasoningTask = {
        type: 'reasoning',
        goal: 'Analyze entity',
        entryEntities: ['Merch:M001'],
      }
      expect(task.type).toBe('reasoning')
      expect(task.entryEntities).toContain('Merch:M001')
    })
  })
})