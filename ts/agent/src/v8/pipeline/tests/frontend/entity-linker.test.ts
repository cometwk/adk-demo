import { describe, it, expect, vi } from 'vitest'
import { extractMentionsByRules, linkEntities } from '../../core/frontend/entity-linker'
import type { Ontology } from '../../../ontology/schema'

// Mock GraphStore
const createMockGraphStore = (nodes: Array<{ id: string; type: string; properties?: Record<string, unknown> }>) => ({
  getNode: vi.fn(async (id: string) => nodes.find((n) => n.id === id) || null),
  findNodes: vi.fn(async (opts: any) => ({
    items: opts.type
      ? nodes.filter((n) => n.type === opts.type)
      : nodes.slice(0, opts.limit ?? 20),
    page: { offset: 0, limit: opts.limit ?? 20, hasMore: false },
  })),
  getNeighbors: vi.fn(),
  getNeighborsBatch: vi.fn(),
  query: vi.fn(),
})

const mockOntology: Ontology = {
  version: '1.0.0',
  types: [
    { name: 'Merch', description: 'Merchant', properties: [], methods: [] },
    { name: 'Book', description: 'Book', properties: [], methods: [] },
    { name: 'Reader', description: 'Reader', properties: [], methods: [] },
  ],
  relations: [],
}

describe('Entity Linker', () => {
  describe('extractMentionsByRules', () => {
    it('should extract global ID pattern Merch:M001', () => {
      const mentions = extractMentionsByRules('分析 Merch:M001 的经营状况')
      expect(mentions.length).toBeGreaterThan(0)
      expect(mentions.find((m) => m.text === 'Merch:M001')).toBeDefined()
      expect(mentions.find((m) => m.text === 'Merch:M001')?.hintType).toBe('Merch')
    })

    it('should extract book-title marks 《三体》', () => {
      const mentions = extractMentionsByRules('借阅《三体》这本书')
      expect(mentions.find((m) => m.text === '三体')).toBeDefined()
      expect(mentions.find((m) => m.text === '三体')?.hintType).toBe('Book')
    })

    it('should extract quoted strings', () => {
      const mentions = extractMentionsByRules('查找"商户A"的信息')
      expect(mentions.find((m) => m.text === '商户A')).toBeDefined()
    })

    it('should match known IDs substring', () => {
      const mentions = extractMentionsByRules('查看 Merch:M001 的信息', ['Merch:M001'])
      expect(mentions.find((m) => m.text === 'Merch:M001')).toBeDefined()
    })

    it('should deduplicate mentions', () => {
      const mentions = extractMentionsByRules('Merch:M001 Merch:M001 Merch:M001')
      const merchMentions = mentions.filter((m) => m.text === 'Merch:M001')
      expect(merchMentions.length).toBe(1)
    })

    it('should return empty for no matches', () => {
      const mentions = extractMentionsByRules('随便说说')
      expect(mentions.length).toBe(0)
    })
  })

  describe('linkEntities', () => {
    it('should link exact ID Merch:M001', async () => {
      const mockStore = createMockGraphStore([
        { id: 'Merch:M001', type: 'Merch', properties: { name: '商户A' } },
      ])
      const result = await linkEntities('分析 Merch:M001', mockStore as any, mockOntology)
      expect(result.entities).toContain('Merch:M001')
      expect(result.ambiguityScore).toBe(0)
    })

    it('should return empty when no entities mentioned', async () => {
      const mockStore = createMockGraphStore([])
      const result = await linkEntities('随便说说', mockStore as any, mockOntology)
      expect(result.entities).toHaveLength(0)
      expect(result.ambiguityScore).toBe(0)
    })

    it('should have high ambiguity for multiple candidates', async () => {
      const mockStore = createMockGraphStore([
        { id: 'Book:B001', type: 'Book', properties: { name: '三体' } },
        { id: 'Book:B002', type: 'Book', properties: { name: '三体II' } },
      ])
      const result = await linkEntities('借阅《三体》', mockStore as any, mockOntology)
      expect(result.details.length).toBeGreaterThan(0)
      // Both match substring, so ambiguity should be higher
    })

    it('should have unlinked entity with matchKind none', async () => {
      const mockStore = createMockGraphStore([])
      const result = await linkEntities('分析 Merch:M999', mockStore as any, mockOntology)
      expect(result.details.find((d) => d.matchKind === 'none')).toBeDefined()
    })
  })
})