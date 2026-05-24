import type { VectorStore } from '../../engine/stores/vector-store'
import type { VectorQuery, VectorQueryResult, VectorHit, VectorEntity } from '../../engine/query/vector-query'

// ── InMemoryVectorStore (Stub) ──
// Phase 1: simple text matching (no embedding)
// Phase 2: will add embedding-based similarity search

export class InMemoryVectorStore implements VectorStore {
  private entities = new Map<string, VectorEntity>()

  async search(query: VectorQuery): Promise<VectorQueryResult> {
    const queryText = query.query.toLowerCase()
    const hits: VectorHit[] = []

    for (const [id, entity] of this.entities) {
      // Simple text matching
      const contentLower = entity.content.toLowerCase()
      if (contentLower.includes(queryText)) {
        // Compute a simple score based on match position
        const score = this.computeSimpleScore(queryText, contentLower)
        if (score >= (query.minScore ?? 0.5)) {
          hits.push({
            entityId: entity.id,
            entityType: entity.type,
            score,
            content: entity.content,
            metadata: entity.metadata,
          })
        }
      }
    }

    // Sort by score descending
    hits.sort((a, b) => b.score - a.score)

    // Apply topK limit
    const topK = query.topK ?? 10
    const limitedHits = hits.slice(0, topK)

    return {
      hits: limitedHits,
      total: hits.length,
    }
  }

  async indexEntity(entity: VectorEntity): Promise<void> {
    this.entities.set(entity.id, entity)
  }

  async removeEntity(entityId: string): Promise<void> {
    this.entities.delete(entityId)
  }

  // ── Helper ──

  private computeSimpleScore(queryText: string, contentLower: string): number {
    // Simple scoring: based on whether query is found and its relative length
    if (!contentLower.includes(queryText)) return 0

    // Higher score if query text is longer relative to content
    const ratio = queryText.length / contentLower.length
    // Base score of 0.7 for any match, bonus for longer queries
    return Math.min(1.0, 0.7 + ratio * 0.3)
  }
}