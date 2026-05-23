import { describe, it, expect, beforeAll } from 'vitest'
import { InMemoryComputeStore } from '../impl/in-memory-compute'
import { seedComputeStore } from './fixtures/seed-ddl'
import type { ComputeQuery } from '../query/compute-query'

describe('V8 InMemoryComputeStore', () => {
  let store: InMemoryComputeStore

  beforeAll(() => {
    store = new InMemoryComputeStore()
    seedComputeStore(store)
  })

  describe('Source metadata', () => {
    it('getSources returns seeded sources', async () => {
      const sources = await store.getSources()
      expect(sources.length).toBe(2)
      expect(sources.find((s) => s.name === 'OrderDaily')).toBeDefined()
      expect(sources.find((s) => s.name === 'ProfitDaily')).toBeDefined()
    })

    it('getSourceSchema returns correct schema', async () => {
      const schema = await store.getSourceSchema('OrderDaily')
      expect(schema.fields.length).toBe(6)
      expect(schema.fields.find((f) => f.name === 'total_amount')).toBeDefined()
      expect(schema.fields.find((f) => f.name === 'total_amount')?.aggregatable).toBe(true)
    })
  })

  describe('Aggregation: count', () => {
    it('count all rows', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: '*', fn: 'count', as: 'total' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].total).toBe(6)
    })

    it('count with filter', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].cnt).toBe(3)
    })

    it('count with in filter', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: ['M001', 'M002'] }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].cnt).toBe(6)
    })
  })

  describe('Aggregation: sum/avg/min/max', () => {
    it('sum total_amount', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'amount_sum' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].amount_sum).toBe(450000)
    })

    it('avg total_count', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: 'total_count', fn: 'avg', as: 'avg_count' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].avg_count).toBe(7.5) // (10+5+12+3+8+7) / 6 = 45/6 = 7.5
    })

    it('min/max total_amount', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [
          { field: 'total_amount', fn: 'min', as: 'min_amt' },
          { field: 'total_amount', fn: 'max', as: 'max_amt' },
        ],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].min_amt).toBe(30000)
      expect(result.rows[0].max_amt).toBe(120000)
    })
  })

  describe('groupBy', () => {
    it('groupBy merch_no with count', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: '*', fn: 'count', as: 'txn_cnt' }],
        groupBy: ['merch_no'],
      }
      const result = await store.aggregate(query)
      // Only M001 and M002 have data (seed data doesn't include M003)
      expect(result.rows.length).toBe(2)
      const m001Row = result.rows.find((r) => r.group?.merch_no === 'M001')
      expect(m001Row?.txn_cnt).toBe(3)
      const m002Row = result.rows.find((r) => r.group?.merch_no === 'M002')
      expect(m002Row?.txn_cnt).toBe(3)
    })

    it('groupBy with sum', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: ['M001', 'M002', 'M003'] }],
        metrics: [
          { field: '*', fn: 'count', as: 'txn_cnt' },
          { field: 'total_amount', fn: 'sum', as: 'total_amt' },
        ],
        groupBy: ['merch_no'],
        orderBy: [{ field: 'txn_cnt', direction: 'asc' }],
      }
      const result = await store.aggregate(query)
      // M003 should be first with 0 transactions (if included in filter)
      // But since M003 has no rows, it won't appear in result
      expect(result.rows.length).toBe(2) // Only M001 and M002 have data
    })
  })

  describe('orderBy', () => {
    it('orderBy metric asc', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'sum_amt' }],
        groupBy: ['merch_no'],
        orderBy: [{ field: 'sum_amt', direction: 'asc' }],
      }
      const result = await store.aggregate(query)
      // M001 sum: 300000, M002 sum: 150000
      expect(result.rows[0].group?.merch_no).toBe('M002')
      expect(result.rows[1].group?.merch_no).toBe('M001')
    })

    it('orderBy metric desc', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'sum_amt' }],
        groupBy: ['merch_no'],
        orderBy: [{ field: 'sum_amt', direction: 'desc' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].group?.merch_no).toBe('M001')
      expect(result.rows[1].group?.merch_no).toBe('M002')
    })
  })

  describe('Pagination', () => {
    it('limit', async () => {
      const query: ComputeQuery = {
        source: 'ProfitDaily',
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
        groupBy: ['stat_date'],
        limit: 2,
      }
      const result = await store.aggregate(query)
      expect(result.rows.length).toBe(2)
      expect(result.total).toBe(4)
      expect(result.truncated).toBe(true)
    })

    it('offset', async () => {
      const query: ComputeQuery = {
        source: 'ProfitDaily',
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
        groupBy: ['stat_date'],
        limit: 2,
        offset: 2,
      }
      const result = await store.aggregate(query)
      expect(result.rows.length).toBe(2)
      expect(result.total).toBe(4)
    })
  })

  describe('between filter', () => {
    it('between on date range', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'report_date', op: 'between', value: ['2026-05-01', '2026-05-02'] }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].cnt).toBe(4)
    })
  })

  describe('Integration: ProfitDaily', () => {
    it('sum net_profit for agent A001', async () => {
      const query: ComputeQuery = {
        source: 'ProfitDaily',
        filters: [{ field: 'agent_no', op: 'eq', value: 'A001' }],
        metrics: [{ field: 'net_profit', fn: 'sum', as: 'total_profit' }],
      }
      const result = await store.aggregate(query)
      expect(result.rows[0].total_profit).toBe(4800) // 1500+1500+800+1000
    })
  })
})