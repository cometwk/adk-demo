import { beforeAll, describe, expect, it } from 'vitest'
import { discover_entities, execute_query } from './tools'

const toolOptions = { toolCallId: 'test', messages: [] }

describe('just test', () => {
  beforeAll(async () => {
    console.log('init success')
  })

  it('meta', async () => {
    const r = await discover_entities.execute!({}, toolOptions)
    console.log(r)
  })


  it('query', async () => {
    const r = await execute_query.execute!({
      entity_name: 'order_daily',
      measures: ['order_daily.count'],
      dimensions: ['order_daily.merch_name'],
      filters: [],
      timeDimensions: [],
      segments: [],
      limit: 10,
      total: false,
      offset: 0,
      order: [{
        member: 'order_daily.count',
        direction: 'asc',
      }],
      timezone: 'Asia/Shanghai',
      renewQuery: false,
      ungrouped: false,
    }, toolOptions)
    console.log(r)
  })


})
