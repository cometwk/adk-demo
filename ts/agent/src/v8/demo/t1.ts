import { newPipelineTestContext, useCaseScenarios } from "./case/library/helper"

const { goal, entryEntities } = useCaseScenarios.S1
const ctx = newPipelineTestContext()
const r = await ctx.runTask('reasoning', { goal, entryEntities })
console.log(r)