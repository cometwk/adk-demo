import { describe, it, expect } from 'vitest'
import { GraphTraversalQuerySchema, PropertyFilterSchema } from '../query/graph-query'
import { ComputeQuerySchema, ComputeFilterSchema, AggregateMetricSchema } from '../query/compute-query'
import { VectorQuerySchema } from '../query/vector-query'
import { evalFilter, matchesFilters, projectFields } from '../query/filters'

describe('V8 Query DSL', () => {
  describe('GraphTraversalQuery Schema', () => {
    it('validates match + traverse + return query', () => {
      const query = {
        match: { type: 'Merch', where: [{ property: 'status', op: 'eq', value: 'active' }] },
        traverse: [{ relation: 'managed_by', direction: 'out' }],
        return: { fields: ['name', 'status'], limit: 10 },
      }
      const result = GraphTraversalQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })

    it('rejects query with aggregate field', () => {
      const query = {
        match: { type: 'Merch' },
        return: { aggregate: { metrics: [{ field: '*', fn: 'count' }] } },
      }
      const result = GraphTraversalQuerySchema.safeParse(query)
      expect(result.success).toBe(false)
    })

    it('validates match clause with alias', () => {
      const query = {
        match: { type: 'Agent', alias: 'a' },
        traverse: [{ from: 'a', relation: 'manages', direction: 'out', alias: 'm' }],
        return: { alias: 'm' },
      }
      const result = GraphTraversalQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })

    it('validates traverse require options', () => {
      const query = {
        match: { type: 'Merch' },
        traverse: [{ relation: 'has_order', direction: 'out', require: 'exists' }],
        return: {},
      }
      const result = GraphTraversalQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })
  })

  describe('PropertyFilter Schema', () => {
    it('validates eq filter', () => {
      const filter = { property: 'status', op: 'eq', value: 'active' }
      const result = PropertyFilterSchema.safeParse(filter)
      expect(result.success).toBe(true)
    })

    it('validates in filter', () => {
      const filter = { property: 'merch_no', op: 'in', value: ['M001', 'M002'] }
      const result = PropertyFilterSchema.safeParse(filter)
      expect(result.success).toBe(true)
    })
  })

  describe('ComputeQuery Schema', () => {
    it('validates source + metrics + groupBy query', () => {
      const query = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: ['M001'] }],
        metrics: [{ field: '*', fn: 'count', as: 'txn_cnt' }],
        groupBy: ['merch_no'],
      }
      const result = ComputeQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })

    it('validates between filter', () => {
      const query = {
        source: 'OrderDaily',
        filters: [{ field: 'report_date', op: 'between', value: ['2026-05-01', '2026-05-31'] }],
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'total_amt' }],
      }
      const result = ComputeQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })

    it('validates orderBy', () => {
      const query = {
        source: 'ProfitDaily',
        metrics: [{ field: 'net_profit', fn: 'sum', as: 'profit' }],
        orderBy: [{ field: 'profit', direction: 'desc' }],
        limit: 100,
      }
      const result = ComputeQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })
  })

  describe('AggregateMetric Schema', () => {
    it('validates count metric', () => {
      const metric = { field: '*', fn: 'count', as: 'total' }
      const result = AggregateMetricSchema.safeParse(metric)
      expect(result.success).toBe(true)
    })

    it('validates sum metric', () => {
      const metric = { field: 'total_amount', fn: 'sum', as: 'amount_sum' }
      const result = AggregateMetricSchema.safeParse(metric)
      expect(result.success).toBe(true)
    })
  })

  describe('VectorQuery Schema', () => {
    it('validates basic query', () => {
      const query = { query: '无交易商户', topK: 5 }
      const result = VectorQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
    })

    it('applies defaults for topK and minScore', () => {
      const query = { query: 'test query' }
      const result = VectorQuerySchema.safeParse(query)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.topK).toBe(10)
        expect(result.data.minScore).toBe(0.5)
      }
    })
  })

  describe('Filter Evaluation', () => {
    const props = { status: 'active', count: 10, name: 'Test Merchant' }

    it('evalFilter eq', () => {
      expect(evalFilter(props.status, { property: 'status', op: 'eq', value: 'active' })).toBe(true)
      expect(evalFilter(props.status, { property: 'status', op: 'eq', value: 'inactive' })).toBe(false)
    })

    it('evalFilter ne', () => {
      expect(evalFilter(props.status, { property: 'status', op: 'ne', value: 'inactive' })).toBe(true)
    })

    it('evalFilter gt/gte/lt/lte', () => {
      expect(evalFilter(props.count, { property: 'count', op: 'gt', value: 5 })).toBe(true)
      expect(evalFilter(props.count, { property: 'count', op: 'gte', value: 10 })).toBe(true)
      expect(evalFilter(props.count, { property: 'count', op: 'lt', value: 20 })).toBe(true)
      expect(evalFilter(props.count, { property: 'count', op: 'lte', value: 10 })).toBe(true)
    })

    it('evalFilter contains', () => {
      expect(evalFilter(props.name, { property: 'name', op: 'contains', value: 'Test' })).toBe(true)
      expect(evalFilter(props.name, { property: 'name', op: 'contains', value: 'Unknown' })).toBe(false)
    })

    it('evalFilter in', () => {
      expect(evalFilter(props.status, { property: 'status', op: 'in', value: ['active', 'pending'] })).toBe(true)
      expect(evalFilter(props.status, { property: 'status', op: 'in', value: ['inactive'] })).toBe(false)
    })
  })

  describe('matchesFilters', () => {
    it('returns true for empty filters', () => {
      expect(matchesFilters({ a: 1 }, [])).toBe(true)
    })

    it('returns true when all filters match (AND logic)', () => {
      const props = { status: 'active', count: 10 }
      const filters = [
        { property: 'status', op: 'eq', value: 'active' },
        { property: 'count', op: 'gt', value: 5 },
      ]
      expect(matchesFilters(props, filters)).toBe(true)
    })

    it('returns false when any filter fails', () => {
      const props = { status: 'active', count: 10 }
      const filters = [
        { property: 'status', op: 'eq', value: 'active' },
        { property: 'count', op: 'gt', value: 15 },
      ]
      expect(matchesFilters(props, filters)).toBe(false)
    })
  })

  describe('projectFields', () => {
    it('returns all properties when fields undefined', () => {
      const props = { a: 1, b: 2, c: 3 }
      expect(projectFields(props)).toEqual(props)
    })

    it('projects specified fields', () => {
      const props = { a: 1, b: 2, c: 3 }
      expect(projectFields(props, ['a', 'b'])).toEqual({ a: 1, b: 2 })
    })

    it('includes undefined for missing fields', () => {
      const props = { a: 1 }
      expect(projectFields(props, ['a', 'missing'])).toEqual({ a: 1, missing: undefined })
    })
  })
})