import { z } from 'zod'

// ── ComputeQuery DSL ──
// Handles OLAP-style aggregation: sum/avg/count/min/max

export const ComputeFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between']),
  value: z.union([z.unknown(), z.array(z.unknown())]),
})
export type ComputeFilter = z.infer<typeof ComputeFilterSchema>

export const AggregateMetricSchema = z.object({
  field: z.string(), // "*" means count
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max']),
  as: z.string().optional(),
})
export type AggregateMetric = z.infer<typeof AggregateMetricSchema>

export const OrderSpecSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
})
export type OrderSpec = z.infer<typeof OrderSpecSchema>

export const ComputeQuerySchema = z.object({
  source: z.string().describe('Data source name (e.g., OrderDaily)'),
  filters: z.array(ComputeFilterSchema).optional(),
  metrics: z.array(AggregateMetricSchema).describe('Aggregation metrics'),
  groupBy: z.array(z.string()).optional(),
  orderBy: z.array(OrderSpecSchema).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
})
export type ComputeQuery = z.infer<typeof ComputeQuerySchema>

// ── ComputeQueryResult ──

export type ComputeRow = {
  group?: Record<string, unknown> // groupBy values
  [metricAlias: string]: unknown // aggregation results
}

export type ComputeQueryResult = {
  rows: ComputeRow[]
  total: number
  truncated: boolean
  executionTimeMs: number
}