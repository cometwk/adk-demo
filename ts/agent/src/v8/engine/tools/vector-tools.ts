import { tool } from 'ai'
import type { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import type { ToolResult } from '../runtime/types'
import { VectorQuerySchema } from '../query/vector-query'

// ── Vector Tools (V8) ──
// Semantic search tool - routes through RuntimeOrchestrator
// Phase 1: stub with simple text matching

export function createVectorTools(runtime: SemanticRuntimeOrchestrator) {
  // vector_query - semantic search
  const vector_query = tool({
    description:
      '语义相似性搜索。基于文本含义而非精确匹配。' +
      '适用场景：①模糊知识检索；②相似实体发现。' +
      '返回匹配实体及其相似度分数。',
    inputSchema: VectorQuerySchema,
    execute: async (query): Promise<ToolResult> => {
      return runtime.executeVectorQuery(query)
    },
  })

  return { vector_query }
}