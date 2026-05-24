import { describe, it, expect } from 'vitest'
import { filtersToSearchParams, rawIdOf, neighborsFromNodes } from '../helpers'
import type { NodeData, GetNeighborsOpts, NeighborData } from '../../../engine'

describe('helpers', () => {
  describe('filtersToSearchParams', () => {
    it('should return valid defaults when all params are undefined', () => {
      const result = filtersToSearchParams(undefined, undefined, undefined, undefined)
      expect(result.page).toBe(0)
      expect(result.pagesize).toBe(20)
    })

    it('should correctly calculate page from offset and limit', () => {
      const result = filtersToSearchParams(undefined, undefined, 100, 20)
      expect(result.page).toBe(5)
      expect(result.pagesize).toBe(20)
    })

    it('should not produce NaN when offset is undefined', () => {
      const result = filtersToSearchParams(undefined, undefined, undefined, 20)
      expect(result.page).toBe(0)
      expect(Number.isNaN(result.page)).toBe(false)
    })

    it('should not produce NaN when limit is undefined', () => {
      const result = filtersToSearchParams(undefined, undefined, 20, undefined)
      expect(result.page).toBe(1)
      expect(result.pagesize).toBe(20)
      expect(Number.isNaN(result.page)).toBe(false)
    })

    it('should map filter operators to API params', () => {
      const filters = [
        { property: 'name', op: 'eq', value: 'test' },
        { property: 'status', op: 'in', value: ['a', 'b'] },
      ]
      const result = filtersToSearchParams(filters, undefined, 0, 20)
      expect(result['where.name.eq']).toBe('test')
      expect(result['where.status.in']).toBe('a,b')
    })

    it('should wrap contains value with %', () => {
      const filters = [{ property: 'name', op: 'contains', value: 'test' }]
      const result = filtersToSearchParams(filters, undefined, 0, 20)
      expect(result['where.name.like']).toBe('%test%')
    })
  })

  describe('rawIdOf', () => {
    it('should extract raw ID from global ID', () => {
      const node: NodeData = { id: 'Merch:M001', type: 'Merch', properties: {} }
      expect(rawIdOf(node)).toBe('M001')
    })

    it('should return full ID if no colon', () => {
      const node: NodeData = { id: 'simple', type: 'Test', properties: {} }
      expect(rawIdOf(node)).toBe('simple')
    })
  })

  describe('neighborsFromNodes', () => {
    it('should convert nodes to neighbor data', () => {
      const nodes: NodeData[] = [
        { id: 'Agent:A001', type: 'Agent', properties: { name: 'Agent 1' } },
        { id: 'Agent:A002', type: 'Agent', properties: { name: 'Agent 2' } },
      ]
      const opts: GetNeighborsOpts = { relation: 'for_agent', limit: 10, offset: 0 }
      const result = neighborsFromNodes(nodes, 'for_agent', 'out', opts)

      expect(result.items.length).toBe(2)
      expect(result.items[0].nodeId).toBe('Agent:A001')
      expect(result.items[0].relation).toBe('for_agent')
      expect(result.items[0].direction).toBe('out')
    })

    it('should filter by targetType', () => {
      const nodes: NodeData[] = [
        { id: 'Agent:A001', type: 'Agent', properties: {} },
        { id: 'Merch:M001', type: 'Merch', properties: {} },
      ]
      const opts: GetNeighborsOpts = { relation: 'for_agent', targetType: 'Agent', limit: 10, offset: 0 }
      const result = neighborsFromNodes(nodes, 'for_agent', 'out', opts)

      expect(result.items.length).toBe(1)
      expect(result.items[0].type).toBe('Agent')
    })

    it('should apply pagination', () => {
      const nodes: NodeData[] = [
        { id: 'Agent:A001', type: 'Agent', properties: {} },
        { id: 'Agent:A002', type: 'Agent', properties: {} },
        { id: 'Agent:A003', type: 'Agent', properties: {} },
      ]
      const opts: GetNeighborsOpts = { relation: 'for_agent', limit: 2, offset: 1 }
      const result = neighborsFromNodes(nodes, 'for_agent', 'out', opts)

      expect(result.items.length).toBe(2)
      expect(result.items[0].nodeId).toBe('Agent:A002')
      // offset=1, limit=2, total=3 → 1+2=3, items after filtering=3 → hasMore = 3 < 3 = false
      expect(result.page.hasMore).toBe(false)
    })
  })
})