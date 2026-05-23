import { beforeAll, describe, expect, it } from 'vitest'
import { newAgentContext } from './helper'

describe('just test', () => {
  beforeAll(async () => {
    console.log('init success')
  })

  const testS0 = newAgentContext({
    taskId: 'S0',
    goal: '康传兵有几个下级代理商, 分别是谁？',
    entryEntities: [],
  })
  it('just test', async () => {
    console.log('just test')
    const fn = testS0.tools.search_nodes.execute
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
})
