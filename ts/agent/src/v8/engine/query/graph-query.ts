import { z } from 'zod'

// ── 属性过滤操作符 ──

export const CompareOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'])
export type CompareOp = z.infer<typeof CompareOpSchema>

// ── 属性过滤条件 ──

export const PropertyFilterSchema = z.object({
  property: z.string().describe('属性名称'),
  op: CompareOpSchema.describe('比较操作符：eq(等于)/ne(不等于)/gt(大于)/gte(大于等于)/lt(小于)/lte(小于等于)/contains(包含)/in(在列表中)'),
  value: z.unknown().describe('比较值；"in" 操作符时传数组'),
})
export type PropertyFilter = z.infer<typeof PropertyFilterSchema>

// ── MATCH: 起点选择 ──

export const MatchClauseSchema = z.object({
  type: z.string().describe('起点实体类型名（如 "Reader", "Book"）'),
  where: z.array(PropertyFilterSchema).optional().describe('属性过滤条件（多个条件为 AND 逻辑）'),
  alias: z.string().optional().describe('此阶段节点集的别名，默认 "_start"，供后续 traverse 步骤引用'),
})
export type MatchClause = z.infer<typeof MatchClauseSchema>

// ── TRAVERSE: 边遍历步骤 ──

export const TraverseStepSchema = z.object({
  from: z.string().optional().describe('从哪个 alias 出发；省略则沿用前一步的结果集'),
  relation: z.string().describe('边类型（如 "borrows", "written_by", "available_at"）'),
  direction: z.enum(['out', 'in', 'both']).optional().describe('边方向：out(正向)/in(反向)/both(双向)，默认 out'),
  targetType: z.string().optional().describe('目标节点类型过滤（如只查 "Book" 类型邻居）'),
  where: z.array(PropertyFilterSchema).optional().describe('目标节点属性过滤条件（多个条件为 AND 逻辑）'),
  alias: z.string().optional().describe('此步结果集的别名，供后续步骤或 return 引用'),
  require: z.enum(['exists', 'none']).optional().describe(
    '存在性断言："exists" 表示源节点必须至少有一个满足条件的目标（否则从源集合剔除）；' +
    '"none" 表示源节点必须没有满足条件的目标（反向过滤，用于找"没有X的Y")'
  ),
})
export type TraverseStep = z.infer<typeof TraverseStepSchema>

// ── RETURN: 输出控制 ──
// V8: traversal-only, NO aggregate

export const ReturnClauseSchema = z.object({
  alias: z.string().optional().describe('返回哪个 alias 的节点集；省略则返回最后一步的结果'),
  fields: z.array(z.string()).optional().describe('投影属性列表；省略则返回全部属性'),
  limit: z.number().optional().describe('分页大小，默认 50，最大 200'),
  offset: z.number().optional().describe('分页偏移量，用于翻页'),
}).strict()
export type ReturnClause = z.infer<typeof ReturnClauseSchema>

// ── 顶层图遍历查询 ──
// V8: traversal-only, NO aggregate mode

export const GraphTraversalQuerySchema = z.object({
  match: MatchClauseSchema.describe('起点选择：定义查询入口实体集合（类型 + 可选过滤 + 可选别名）'),
  traverse: z.array(TraverseStepSchema).optional().describe('多步边遍历：每步可指定关系、方向、目标过滤、存在性断言'),
  return: ReturnClauseSchema.describe('输出控制：指定返回哪个 alias、投影哪些属性、分页参数'),
}).strict()
export type GraphTraversalQuery = z.infer<typeof GraphTraversalQuerySchema>

// ── GraphQueryResult ──
// V8: Only 'nodes' mode, NO 'aggregate' mode

export type QueryRow = {
  nodeId: string
  type: string
  properties: Record<string, unknown>
}

export type GraphQueryResult = {
  mode: 'nodes'
  rows: QueryRow[]
  total: number
  truncated: boolean  // 工作集超过 maxWorkingSet(500) 时为 true
}