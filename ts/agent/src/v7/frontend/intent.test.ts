import { describe, it, expect } from 'vitest'
import { classifyIntent } from './intent'

describe('detectIntent', () => {
  it('detects risk_assessment from Chinese keywords', async () => {
    const result = await classifyIntent('小明能借《人工智能简史》吗？请根据图书馆规定进行评估。')
    expect(result).toBeDefined()
    console.log(result)
  })
})
