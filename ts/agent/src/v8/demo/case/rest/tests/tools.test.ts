import { beforeAll, describe, it } from 'vitest'
import { PipelineContext, reasoningPlugin } from '../../../../pipeline'
import { newPipelineTestContext } from '../helper'
import { Tool, ToolSet } from 'ai'
import { trace } from '../../../../../lib/trace'

describe('just test tools', () => {
  let ctx: PipelineContext
  let tools: Record<string, Tool>
  beforeAll(async () => {
    ctx = newPipelineTestContext()
    tools = ctx.debugBuildTools(reasoningPlugin)
    console.log('init success')
  })

  it('demo', async () => {
    console.log('just test')
    const fn = tools.search_nodes.execute
    if (!fn) throw new Error('search_nodes.execute is not defined')
    const r = await fn(
      {
        type: 'Agent',
        where: [{ property: 'name', op: 'eq', value: '康传兵' }],
        fields: ['id', 'agent_no', 'name', 'contact_name'],
      },
      { toolCallId: 'search_nodes', messages: [] }
    )
    console.log('search_nodes result =================================')
    console.log(JSON.stringify(r, null, 2))
  })

  it('graph', async () => {
    const fn = tools.graph_query.execute!
    const r = await fn(
      {
        match: {
          type: 'AgentRel',
          where: [
            { property: 'apply', op: 'eq', value: 1 },
            { property: 'agent_type', op: 'eq', value: 'MERCH' },
          ],
        },
        traverse: [
          { relation: 'for_agent', direction: 'out', alias: 'agent' },
          { relation: 'for_merch', direction: 'out', alias: 'merch' },
        ],
        return: { fields: ['agent_no', 'obj_no', 'obj_name'], limit: 200 },
      },
      { toolCallId: 'graph_query', messages: [] }
    )

    trace.log('graph_query result =================================', r)
  })
})
