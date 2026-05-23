import { z } from 'zod'

// ── Property Filter (shared across all query types) ──

export const CompareOpSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'])
export type CompareOp = z.infer<typeof CompareOpSchema>

export const PropertyFilterSchema = z.object({
  property: z.string(),
  op: CompareOpSchema,
  value: z.unknown(),
})
export type PropertyFilter = z.infer<typeof PropertyFilterSchema>

// ── GraphTraversalQuery (V8: traversal-only, NO aggregate) ──

export const MatchClauseSchema = z.object({
  type: z.string(),
  where: z.array(PropertyFilterSchema).optional(),
  alias: z.string().optional(),
})
export type MatchClause = z.infer<typeof MatchClauseSchema>

export const TraverseStepSchema = z.object({
  from: z.string().optional(),
  relation: z.string(),
  direction: z.enum(['out', 'in', 'both']).optional(),
  targetType: z.string().optional(),
  where: z.array(PropertyFilterSchema).optional(),
  alias: z.string().optional(),
  require: z.enum(['exists', 'none']).optional(),
})
export type TraverseStep = z.infer<typeof TraverseStepSchema>

export const ReturnClauseSchema = z.object({
  alias: z.string().optional(),
  fields: z.array(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  // V8: NO aggregate field here - strict mode rejects unknown keys
}).strict()
export type ReturnClause = z.infer<typeof ReturnClauseSchema>

export const GraphTraversalQuerySchema = z.object({
  match: MatchClauseSchema,
  traverse: z.array(TraverseStepSchema).optional(),
  return: ReturnClauseSchema,
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
  truncated: boolean
}