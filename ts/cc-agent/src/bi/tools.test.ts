import { beforeAll, describe, expect, it } from 'vitest'
import { search_entities, get_entity_schema, execute_query } from './tools'
import { createExtra } from './extra'

const toolOptions = { toolCallId: 'test', messages: [] }

describe('BI tools', () => {
  beforeAll(async () => {
    console.log('init success')
  })

  const ctx = createExtra()

  it('search_entities by keyword', async () => {
    const r = await search_entities(ctx).execute!({ keyword: 'order' }, toolOptions)
    console.log(r)
    expect(r).toHaveProperty('matched')
    expect(r).toHaveProperty('all_entity_names')
  })

  it('get_entity_schema for specific entities', async () => {
    const r = await get_entity_schema(ctx).execute!({ entity_names: ['order_daily'] }, toolOptions)
    console.log(r)
    expect(r).toHaveProperty('entities')
    expect((r as any).entities).toHaveProperty('order_daily')
  })

  it('get_entity_schema with not found entity', async () => {
    const r = await get_entity_schema(ctx).execute!({ entity_names: ['nonexistent'] }, toolOptions)
    console.log(r)
    expect(r).toHaveProperty('not_found')
    expect((r as any).not_found).toContain('nonexistent')
    expect(r).toHaveProperty('available_entity_names')
  })

  it('execute_query', async () => {
    const r = await execute_query(ctx).execute!({
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
