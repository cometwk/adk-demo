import { describe, expect, it } from 'vitest'
import { toGlobalId, parseGlobalId } from './search-helpers'
import { filtersToSearchParams } from '../../../provider/rest'

describe('search-helpers', () => {
  it('toGlobalId / parseGlobalId', () => {
    const id = toGlobalId('Agent', '2028360156416315392')
    expect(id).toBe('Agent:2028360156416315392')
    expect(parseGlobalId(id)).toEqual({ type: 'Agent', rawId: '2028360156416315392' })
  })

  it('filtersToSearchParams maps PropertyFilter to where.*', () => {
    const p = filtersToSearchParams(
      [
        { property: 'name', op: 'eq', value: '周洪波' },
        { property: 'disabled', op: 'eq', value: 0 },
      ],
      ['id', 'name'],
      20,
      10,
    )
    expect(p['where.name.eq']).toBe('周洪波')
    expect(p['where.disabled.eq']).toBe(0)
    expect(p.select).toBe('id,name')
    expect(p.page).toBe(2)
    expect(p.pagesize).toBe(10)
  })

  it('rowToNodeData for AgentClosure uses composite raw id', () => {
    // rowToNodeData 现在在 access-executor.ts 中定义，这里只测试 idGenerator 逻辑
    // AgentClosure 的复合键处理逻辑测试已移至业务集成测试
    const compositeRawId = '1_2'
    const id = toGlobalId('AgentClosure', compositeRawId)
    expect(id).toBe('AgentClosure:1_2')
  })
})