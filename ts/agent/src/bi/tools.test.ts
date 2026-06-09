import { beforeAll, describe, expect, it } from 'vitest'
import { discover_entities, execute_query } from './tools'

describe('just test', () => {
  beforeAll(async () => {
    console.log('init success')
  })

  it('meta', async () => {
    const r = await discover_entities.handler({}, {}).then(console.log)
    console.log(r)
  })


  it('query', async () => {
    // {
    //   "dimensions": [
    //     "order_daily.merch_name"
    //   ],
    //   "measures": [
    //     "order_daily.count"
    //   ],
    //   "filters": [
    //     {
    //       "member": "order_daily.over_1000_count",
    //       "operator": "set"
    //     }
    //   ],
    //   "order": {
    //     "order_daily.count": "asc",
    //     "order_daily.merch_name": "desc"
    //   }
    // }
    const r = await execute_query.handler({
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
    }, {}).then(console.log)
    console.log(r)
  })


})
