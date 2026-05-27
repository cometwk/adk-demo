import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RestQueryComputeStore } from '../react-query-compute'
import type { ComputeQuery } from '../../../engine/query/compute-query'
import type { Ontology } from '../../../ontology/schema'
import type { RestNodeClassRegistry } from '../bindings'

vi.mock('../api-search', () => ({
  apiAggregateSafe: vi.fn(),
}))

import { apiAggregateSafe } from '../api-search'
const mockedAggregate = vi.mocked(apiAggregateSafe)

const ontology: Ontology = {
  version: '1.0.0',
  types: [
    {
      name: 'OrderDaily',
      description: 'Daily orders',
      properties: [
        { name: 'total_amount', type: 'number', description: 'Total amount' },
        { name: 'total_count', type: 'integer', description: 'Total count' },
        { name: 'merch_no', type: 'string', description: 'Merchant number' },
        { name: 'report_date', type: 'date', description: 'Report date' },
      ],
      methods: [],
    },
    {
      name: 'ProfitDaily',
      description: 'Daily profit',
      properties: [
        { name: 'net_profit', type: 'number', description: 'Net profit' },
        { name: 'agent_no', type: 'string', description: 'Agent number' },
      ],
      methods: [],
    },
    {
      name: 'NoNumbers',
      description: 'No numeric fields',
      properties: [
        { name: 'name', type: 'string', description: 'Name' },
      ],
      methods: [],
    },
    {
      name: 'NoPrefix',
      description: 'Not in typeRegistry',
      properties: [
        { name: 'value', type: 'number', description: 'Value' },
      ],
      methods: [],
    },
  ],
  relations: [],
}

const typeRegistry: RestNodeClassRegistry = {
  OrderDaily: { prefix: '/order-daily' },
  ProfitDaily: { prefix: '/profit-daily' },
  NoNumbers: { prefix: '/no-numbers' },
  // NoPrefix intentionally omitted
}

describe('RestQueryComputeStore', () => {
  let store: RestQueryComputeStore

  beforeEach(() => {
    store = new RestQueryComputeStore(typeRegistry, ontology)
    vi.clearAllMocks()
  })

  describe('aggregate', () => {
    it('should return normalized rows with group wrapping', async () => {
      mockedAggregate.mockResolvedValueOnce({
        items: [
          { merch_no: 'M001', total: 3, sum_amount: 300000 },
          { merch_no: 'M002', total: 3, sum_amount: 150000 },
        ],
        page: { offset: 0, limit: 20, hasMore: false, total: 2 },
      })

      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [
          { field: '*', fn: 'count', as: 'total' },
          { field: 'total_amount', fn: 'sum', as: 'sum_amount' },
        ],
        groupBy: ['merch_no'],
      }

      const result = await store.aggregate(query)
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toEqual({ group: { merch_no: 'M001' }, total: 3, sum_amount: 300000 })
      expect(result.rows[1]).toEqual({ group: { merch_no: 'M002' }, total: 3, sum_amount: 150000 })
      expect(result.total).toBe(2)
      expect(result.truncated).toBe(false)
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should return empty result for unknown source', async () => {
      const query: ComputeQuery = {
        source: 'Unknown',
        metrics: [{ field: '*', fn: 'count', as: 'total' }],
      }

      const result = await store.aggregate(query)
      expect(result.rows).toEqual([])
      expect(result.total).toBe(0)
      expect(result.truncated).toBe(false)
      expect(mockedAggregate).not.toHaveBeenCalled()
    })

    it('should return empty result for source without prefix', async () => {
      const query: ComputeQuery = {
        source: 'NoPrefix',
        metrics: [{ field: '*', fn: 'count', as: 'total' }],
      }

      const result = await store.aggregate(query)
      expect(result.rows).toEqual([])
      expect(result.total).toBe(0)
      expect(mockedAggregate).not.toHaveBeenCalled()
    })

    it('should pass correct params to apiAggregateSafe', async () => {
      mockedAggregate.mockResolvedValueOnce({
        items: [{ total: 6 }],
        page: { offset: 0, limit: 20, hasMore: false, total: 1 },
      })

      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: '*', fn: 'count', as: 'total' }],
        groupBy: ['merch_no'],
        orderBy: [{ field: 'total', direction: 'desc' }],
        limit: 10,
        offset: 0,
      }

      await store.aggregate(query)
      expect(mockedAggregate).toHaveBeenCalledWith('/order-daily', expect.objectContaining({
        metrics: 'count(*).total',
        group_by: 'merch_no',
        order: 'total.desc',
        pagesize: 10,
      }))
    })

    it('should handle no groupBy (global aggregation)', async () => {
      mockedAggregate.mockResolvedValueOnce({
        items: [{ total: 6, sum_amount: 450000 }],
        page: { offset: 0, limit: 20, hasMore: false, total: 1 },
      })

      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [
          { field: '*', fn: 'count', as: 'total' },
          { field: 'total_amount', fn: 'sum', as: 'sum_amount' },
        ],
      }

      const result = await store.aggregate(query)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual({ total: 6, sum_amount: 450000 })
      expect(result.rows[0].group).toBeUndefined()
    })
  })

  describe('getSources', () => {
    it('should return only types with aggregatable fields and registry prefix', async () => {
      const sources = await store.getSources()
      const names = sources.map((s) => s.name)
      expect(names).toContain('OrderDaily')
      expect(names).toContain('ProfitDaily')
      expect(names).not.toContain('NoNumbers')
      expect(names).not.toContain('NoPrefix')
    })
  })

  describe('getSourceSchema', () => {
    it('should return schema with aggregatable flags for OrderDaily', async () => {
      const schema = await store.getSourceSchema('OrderDaily')
      expect(schema.fields.length).toBe(4)
      const amountField = schema.fields.find((f) => f.name === 'total_amount')
      expect(amountField?.aggregatable).toBe(true)
      expect(amountField?.type).toBe('number')
      const merchField = schema.fields.find((f) => f.name === 'merch_no')
      expect(merchField?.aggregatable).toBe(false)
    })

    it('should return empty fields for unknown source', async () => {
      const schema = await store.getSourceSchema('Unknown')
      expect(schema).toEqual({ fields: [] })
    })
  })
})
