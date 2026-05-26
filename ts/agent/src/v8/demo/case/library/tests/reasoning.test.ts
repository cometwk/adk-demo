import { describe, it, expect } from 'vitest'
import { seedGraph } from '../seed'
import { OPEN_POLICY } from '../../../../policy/context'
import { buildTestOntology, buildTestRules, newPipelineTestContext, useCaseScenarios } from '../helper'
import { buildReasoningPrompt, ExecuteParams, executeReasoning, PipelineTask } from '../../../../pipeline'
import { model } from '../../../../../lib/model'

/**
 * 推理测试
 * 数据来源：src/v8/demo/case/library/seed.ts
 * 场景对照：src/v8/demo/case/library/helper.ts
 */

describe('Reasoning 场景测试', () => {
  // const store = seedGraph()

  it('S1: 评估小红是否能从西馆借阅《人类简史》', async () => {
    const { goal, entryEntities } = useCaseScenarios.S1
    const ctx = newPipelineTestContext()
    // const task: PipelineTask = { type: 'reasoning', goal, entryEntities }
    const r = await ctx.runTask('reasoning', { goal, entryEntities })
    console.log(r)

    // const systemPrompt = buildReasoningPrompt({
    //   ontology: buildTestOntology(),
    //   rules: buildTestRules().list(),
    //   task,
    // })
    // const params: ExecuteParams = {
    //   task,
    //   systemPrompt,
    //   tools: {},
    //   model: model,
    // }
    // const result = await executeReasoning(params)
    // expect(result).toHaveProperty('facts')
    // expect(result).toHaveProperty('modelVerdict')
    // expect(result).toHaveProperty('rawText')
  })
})
