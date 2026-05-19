import { z } from 'zod'

// ── 属性过滤操作符 ──

export const CompareOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'])
export type CompareOp = z.infer<typeof CompareOpSchema>

// ── 属性过滤条件 ──

export const PropertyFilterSchema = z.object({
  property: z.string().describe('属性名称'),
  op: CompareOpSchema.describe('比较操作符：eq/ne/gt/gte/lt/lte/contains/in'),
  value: z.unknown().describe('比较值；"in" 操作符时传数组'),
})
export type PropertyFilter = z.infer<typeof PropertyFilterSchema>

// ── MATCH: 起点选择 ──

export const MatchClauseSchema = z.object({
  type: z.string().describe('起点实体类型名（如 "Reader", "Book"）'),
  where: z.array(PropertyFilterSchema).optional().describe('属性过滤条件（AND 逻辑）'),
  alias: z.string().optional().describe('此阶段节点集的别名，默认 "_start"'),
})
export type MatchClause = z.infer<typeof MatchClauseSchema>

// ── TRAVERSE: 边遍历步骤 ──

export const TraverseStepSchema = z.object({
  from: z.string().optional().describe('从哪个 alias 出发；省略则沿用前一步'),
  relation: z.string().describe('边类型（如 "borrows", "managed_by"）'),
  direction: z.enum(['out', 'in', 'both']).optional().describe('边方向，默认 out'),
  targetType: z.string().optional().describe('目标节点类型过滤'),
  where: z.array(PropertyFilterSchema).optional().describe('目标节点属性过滤条件（AND 逻辑）'),
  alias: z.string().optional().describe('此步结果集的别名，供后续步骤引用'),
  require: z
    .enum(['exists', 'none'])
    .optional()
    .describe(
      '"exists": 源节点必须至少有一个满足条件的目标（否则从源集合中剔除）；' +
        '"none": 源节点必须没有满足条件的目标（反向过滤）',
    ),
})
export type TraverseStep = z.infer<typeof TraverseStepSchema>

// ── RETURN: 聚合规格 ──

export const AggregateMetricSchema = z.object({
  field: z.string().describe('聚合字段名，"*" 表示计数'),
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max']).describe('聚合函数'),
  as: z.string().optional().describe('输出字段别名'),
})
export type AggregateMetric = z.infer<typeof AggregateMetricSchema>

export const AggregateSpecSchema = z.object({
  groupBy: z.string().optional().describe('按此属性分组；省略则全量聚合'),
  metrics: z.array(AggregateMetricSchema).describe('聚合指标列表'),
})
export type AggregateSpec = z.infer<typeof AggregateSpecSchema>

// ── RETURN: 输出控制 ──

export const ReturnClauseSchema = z.object({
  alias: z.string().optional().describe('返回哪个 alias 的节点集；省略则返回最后一步'),
  fields: z.array(z.string()).optional().describe('投影属性列表；省略则返回全部属性'),
  limit: z.number().optional().describe('分页大小，默认 50，最大 200'),
  offset: z.number().optional().describe('分页偏移量'),
  aggregate: AggregateSpecSchema.optional().describe('聚合模式；提供此字段时 fields 和分页仍可用于 groupBy'),
})
export type ReturnClause = z.infer<typeof ReturnClauseSchema>

// ── 顶层查询 ──

export const GraphQuerySchema = z.object({
  match: MatchClauseSchema.describe('起点选择，定义查询的入口实体集合'),
  traverse: z.array(TraverseStepSchema).optional().describe('多步边遍历，每步可加过滤和存在性断言'),
  return: ReturnClauseSchema.optional().describe('输出控制，含投影、分页、聚合'),
})
export type GraphQuery = z.infer<typeof GraphQuerySchema>

// ── 查询结果类型 ──

export type QueryRow = {
  nodeId: string
  type: string
  properties: Record<string, unknown>
}

export type QueryAggregateRow = {
  group?: unknown
  [metric: string]: unknown
}

export type GraphQueryResult =
  | { mode: 'nodes'; rows: QueryRow[]; total: number; truncated: boolean }
  | { mode: 'aggregate'; rows: QueryAggregateRow[] }
