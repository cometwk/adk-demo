import { describe, it, expect, beforeAll } from 'vitest'
import { InMemoryVectorStore } from '../impl/in-memory-vector'
import type { VectorEntity } from '../query/vector-query'

describe('V8 InMemoryVectorStore', () => {
  let store: InMemoryVectorStore

  beforeAll(async () => {
    store = new InMemoryVectorStore()

    // Index some entities
    const entities: VectorEntity[] = [
      { id: 'Merch:M001', type: 'Merch', content: 'Merchant 1 is an active merchant in the system with regular transactions' },
      { id: 'Merch:M002', type: 'Merch', content: 'Merchant 2 is an inactive merchant with no recent transactions' },
      { id: 'Agent:A001', type: 'Agent', content: 'Agent 1 manages multiple merchants including M001 and M002' },
    ]

    for (const e of entities) {
      await store.indexEntity(e)
    }
  })

  describe('index/remove', () => {
    it('indexEntity adds entity', async () => {
      const newEntity: VectorEntity = { id: 'Merch:M003', type: 'Merch', content: 'New merchant' }
      await store.indexEntity(newEntity)
      const result = await store.search({ query: 'New merchant' })
      expect(result.hits.find((h) => h.entityId === 'Merch:M003')).toBeDefined()
    })

    it('removeEntity removes entity', async () => {
      await store.removeEntity('Merch:M003')
      const result = await store.search({ query: 'New merchant' })
      expect(result.hits.find((h) => h.entityId === 'Merch:M003')).toBeUndefined()
    })
  })

  describe('search', () => {
    it('returns matching entities', async () => {
      const result = await store.search({ query: 'merchant' })
      expect(result.hits.length).toBeGreaterThan(0)
    })

    it('returns empty when no match', async () => {
      const result = await store.search({ query: 'xyz123' })
      expect(result.hits.length).toBe(0)
    })

    it('applies topK limit', async () => {
      const result = await store.search({ query: 'merchant', topK: 1 })
      expect(result.hits.length).toBe(1)
      expect(result.total).toBeGreaterThan(1)
    })

    it('applies minScore filter', async () => {
      const result = await store.search({ query: 'merchant', minScore: 0.9 })
      // Higher threshold might filter out some matches
      expect(result.hits.every((h) => h.score >= 0.9)).toBe(true)
    })

    it('returns hits sorted by score', async () => {
      const result = await store.search({ query: 'merchant' })
      for (let i = 1; i < result.hits.length; i++) {
        expect(result.hits[i - 1].score).toBeGreaterThanOrEqual(result.hits[i].score)
      }
    })

    it('returns entity metadata', async () => {
      const result = await store.search({ query: 'active' })
      const hit = result.hits[0]
      expect(hit.entityId).toBeDefined()
      expect(hit.entityType).toBeDefined()
      expect(hit.content).toBeDefined()
    })
  })
})