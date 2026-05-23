import { z } from 'zod'

// ── VectorQuery DSL ──
// Handles semantic similarity search

export const VectorFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'in']),
  value: z.union([z.unknown(), z.array(z.unknown())]),
})
export type VectorFilter = z.infer<typeof VectorFilterSchema>

export const VectorQuerySchema = z.object({
  query: z.string().describe('Semantic query text'),
  filters: z.array(VectorFilterSchema).optional(),
  topK: z.number().default(10).optional(),
  minScore: z.number().default(0.5).optional(),
})
export type VectorQuery = z.infer<typeof VectorQuerySchema>

// ── VectorEntity ──

export type VectorEntity = {
  id: string
  type: string
  content: string // Text for embedding
  metadata?: Record<string, unknown>
}

// ── VectorQueryResult ──

export type VectorHit = {
  entityId: string
  entityType: string
  score: number
  content?: string
  metadata?: Record<string, unknown>
}

export type VectorQueryResult = {
  hits: VectorHit[]
  total: number
}
