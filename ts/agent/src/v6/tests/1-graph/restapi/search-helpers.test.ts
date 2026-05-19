import { describe, expect, it } from 'vitest'
import { filtersToSearchParams, parseGlobalId, rowToNodeData, toGlobalId } from './search-helpers'

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
    const node = rowToNodeData('AgentClosure', {
      ancestor_id: '1',
      descendant_id: '2',
      depth: 1,
    })
    expect(node.id).toBe('AgentClosure:1_2')
    expect(node.properties.depth).toBe(1)
  })
})
