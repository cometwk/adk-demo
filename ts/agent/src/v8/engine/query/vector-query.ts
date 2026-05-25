import { z } from 'zod'

// ── VectorQuery DSL ──
// Handles semantic similarity search

export const VectorFilterSchema = z.object({
  field: z.string().describe('过滤字段名'),
  op: z.enum(['eq', 'in']).describe('比较操作符：eq(等于)/in(在列表中)'),
  value: z.union([z.unknown(), z.array(z.unknown())]).describe('比较值；"in" 时传数组'),
})
export type VectorFilter = z.infer<typeof VectorFilterSchema>

export const VectorQuerySchema = z.object({
  query: z.string().describe('语义查询文本，用于向量相似度匹配'),
  filters: z.array(VectorFilterSchema).optional().describe('元数据过滤条件（多个条件为 AND 逻辑）'),
  topK: z.number().default(10).optional().describe('返回最相似的 K 个结果，默认 10'),
  minScore: z.number().default(0.5).optional().describe('最小相似度阈值（0-1），低于此值的结果不返回，默认 0.5'),
})
export type VectorQuery = z.infer<typeof VectorQuerySchema>

// ── VectorEntity ──
// 用于索引的实体结构

export type VectorEntity = {
  id: string                    // 实体唯一标识
  type: string                  // 实体类型名
  content: string               // 用于生成 embedding 的文本内容
  metadata?: Record<string, unknown>  // 可选元数据，用于过滤
}

// ── VectorQueryResult ──

export type VectorHit = {
  entityId: string              // 匹配到的实体 ID
  entityType: string            // 实体类型
  score: number                 // 相似度分数（0-1，越高越相似）
  content?: string              // 实体内容（可选返回）
  metadata?: Record<string, unknown>  // 实体元数据
}

export type VectorQueryResult = {
  hits: VectorHit[]             // 相似度匹配结果列表
  total: number                 // 符合 minScore 阈值的总匹配数
}