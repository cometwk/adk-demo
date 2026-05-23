import type { VectorQuery, VectorQueryResult, VectorEntity } from '../query/vector-query'

// ── VectorStore Interface ──
// Handles semantic similarity search
// Phase 1: stub implementation with simple text matching

export interface VectorStore {
  // Semantic search
  search(query: VectorQuery): Promise<VectorQueryResult>

  // Index management
  indexEntity(entity: VectorEntity): Promise<void>
  removeEntity(entityId: string): Promise<void>
}