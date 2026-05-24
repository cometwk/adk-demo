import { describe, it, expect } from 'vitest'
import { classifyIntentByRules, V8_INTENT_RULES } from '../../core/frontend/intent'
import type { IntentClassifyResult } from '../../core/types'

describe('Intent Classification', () => {
  describe('classifyIntentByRules', () => {
    it('should classify "预测商户风险" as predictive with high confidence', () => {
      const result = classifyIntentByRules('预测商户风险')
      expect(result.type).toBe('predictive')
      expect(result.confidence).toBeGreaterThan(0.5)
      expect(result.source).toBe('rule')
    })

    it('should classify "分析经营状况" as reasoning', () => {
      const result = classifyIntentByRules('分析经营状况')
      expect(result.type).toBe('reasoning')
      expect(result.source).toBe('rule')
    })

    it('should classify "为什么交易量下降" as diagnostic', () => {
      const result = classifyIntentByRules('为什么交易量下降')
      expect(result.type).toBe('diagnostic')
      expect(result.source).toBe('rule')
    })

    it('should return reasoning with low confidence for ambiguous query', () => {
      const result = classifyIntentByRules('查询商户') // No strong keywords
      expect(result.type).toBe('reasoning') // Default fallback
      expect(result.confidence).toBeLessThan(0.5)
    })

    it('should return reasoning default for no matches', () => {
      const result = classifyIntentByRules('随便说说') // No keywords match
      expect(result.type).toBe('reasoning')
      expect(result.confidence).toBe(0.3)
      expect(result.source).toBe('rule')
    })

    it('should use custom rules when provided', () => {
      const customRules = [
        { type: 'custom' as const, keywords: ['特殊'], confidence: 0.8 },
      ]
      const result = classifyIntentByRules('这是一个特殊查询', customRules)
      expect(result.type).toBe('custom')
      expect(result.confidence).toBeGreaterThan(0.3) // 0.8 * 1 / 2 = 0.4
    })

    it('should handle case-insensitive matching', () => {
      const result = classifyIntentByRules('PREDICT the outcome')
      expect(result.type).toBe('predictive')
    })
  })

  describe('V8_INTENT_RULES', () => {
    it('should contain predictive rules', () => {
      const predictive = V8_INTENT_RULES.find((r) => r.type === 'predictive')
      expect(predictive).toBeDefined()
      expect(predictive?.keywords).toContain('预测')
    })

    it('should contain diagnostic rules', () => {
      const diagnostic = V8_INTENT_RULES.find((r) => r.type === 'diagnostic')
      expect(diagnostic).toBeDefined()
      expect(diagnostic?.keywords).toContain('原因')
    })

    it('should contain reasoning rules', () => {
      const reasoning = V8_INTENT_RULES.find((r) => r.type === 'reasoning')
      expect(reasoning).toBeDefined()
      expect(reasoning?.keywords).toContain('分析')
    })
  })
})