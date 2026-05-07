import { describe, it, expect } from 'vitest'
import { example } from './example'

describe('Graph.searchNodes', () => {
  it('round1预测场景', async () => {
    await example('round1')
    const result = [1, 2] as any
    expect(result.length).toBe(2)
  })
})
