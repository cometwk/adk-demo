import { describe, expect, it } from 'vitest'
import { useCaseScenarios } from '../helper'

/**
 * 推理测试
 * 数据来源：src/v8/demo/case/library/seed.ts
 * 场景对照：src/v8/demo/case/library/helper.ts
 */

describe('Reasoning 场景测试', () => {
  it('S1: 评估小红是否能从西馆借阅《人类简史》', async () => {
    expect(useCaseScenarios.S1.goal).toBe('评估小红是否能从西馆借阅《人类简史》')
    expect(useCaseScenarios.S1.entryEntities).toEqual(['Reader:xiao_hong', 'Book:book_sapiens', 'Branch:branch_west'])

    // const { goal, entryEntities } = useCaseScenarios.S1
    // const ctx = newPipelineTestContext()
    // // const task: PipelineTask = { type: 'reasoning', goal, entryEntities }
    // const r = await ctx.runTask('reasoning', { goal, entryEntities })
    // console.log(r)

  })
})
