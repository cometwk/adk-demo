import { z } from 'zod'

// ── ComputeQuery DSL ──
// Handles OLAP-style aggregation: sum/avg/count/min/max

export const ComputeFilterSchema = z.object({
  field: z.string().describe('过滤字段名'),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'between']).describe(
    '比较操作符：eq(等于)/ne(不等于)/gt(大于)/gte(大于等于)/lt(小于)/lte(小于等于)/in(在列表中)/between(区间内)'
  ),
  value: z.union([z.unknown(), z.array(z.unknown())]).describe('比较值；"in" 和 "between" 时传数组'),
})
export type ComputeFilter = z.infer<typeof ComputeFilterSchema>

export const AggregateMetricSchema = z.object({
  field: z.string().describe('聚合字段名，"*" 表示计数（count all）'),
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('聚合函数：count(计数)/sum(求和)/avg(平均值)/min(最小值)/max(最大值)'),
  as: z.string().optional().describe('输出字段别名，用于结果中引用该指标'),
})
export type AggregateMetric = z.infer<typeof AggregateMetricSchema>

export const OrderSpecSchema = z.object({
  field: z.string().describe('排序字段名'),
  direction: z.enum(['asc', 'desc']).describe('排序方向：asc(升序)/desc(降序)'),
})
export type OrderSpec = z.infer<typeof OrderSpecSchema>

export const ComputeQuerySchema = z.object({
  source: z.string().describe('数据源名称（如 "OrderDaily", "SalesMonthly"）'),
  filters: z.array(ComputeFilterSchema).optional().describe('行级过滤条件（多个条件为 AND 逻辑）'),
  metrics: z.array(AggregateMetricSchema).describe('聚合指标列表，至少指定一个'),
  groupBy: z.array(z.string()).optional().describe('分组维度字段列表，按这些字段分组聚合'),
  orderBy: z.array(OrderSpecSchema).optional().describe('结果排序规则'),
  limit: z.number().optional().describe('分页大小，控制返回行数'),
  offset: z.number().optional().describe('分页偏移量，用于翻页'),
})
export type ComputeQuery = z.infer<typeof ComputeQuerySchema>

// ── ComputeQueryResult ──

export type ComputeRow = {
  group?: Record<string, unknown>  // groupBy 各字段的值
  [metricAlias: string]: unknown   // 聚合结果，key 为 as 指定的别名或 field+fn
}

export type ComputeQueryResult = {
  rows: ComputeRow[]           // 聚合结果行
  total: number                // 符合条件的总行数（分组前）
  truncated: boolean           // 工作集超过 maxWorkingSet 时为 true
  executionTimeMs: number      // 查询执行耗时（毫秒）
}