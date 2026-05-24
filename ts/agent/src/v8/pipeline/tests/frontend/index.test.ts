import { describe, it, expect, vi } from 'vitest'
import { DefaultFrontend, createFrontend } from '../../core/frontend/index'
import type { Ontology } from '../../ontology/schema'

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
  query: vi.fn(),
})

const mockOntology: Ontology = {
  version: '1.0.0',
  types: [
    { name: 'Merch', description: 'Merchant', properties: [], methods: [] },
    { name: 'Book', description: 'Book', properties: [], methods: [] },
  ],
  relations: [],
}

describe('Frontend', () => {
  describe('DefaultFrontend', () => {
    it('should return ready status with task for clear query', async () => {
      const mockStore = createMockGraphStore([
        { id: 'Merch:M001', type: 'Merch', properties: { name: '商户A' } },
      ])
      const frontend = new DefaultFrontend(mockStore as any, mockOntology)
      const result = await frontend.process('分析 Merch:M001 的经营状况')
      expect(result.status).toBe('ready')
      expect(result.task.type).toBe('reasoning')
      expect(result.task.entryEntities).toContain('Merch:M001')
    })

    it.skip('should return clarify status for ambiguous query', async () => {
      const mockStore = createMockGraphStore([
        { id: 'Book:B001', type: 'Book', properties: { name: '三体' } },
        { id: 'Book:B002', type: 'Book', properties: { name: '三体II' } },
      ])
      const frontend = new DefaultFrontend(mockStore as any, mockOntology)
      // Query with book-title that matches multiple books
      const result = await frontend.process('借阅《三体》')
      // Should trigger clarify due to ambiguity
      expect(result.status).toBe('clarify')
    })

    it('should classify predictive intent correctly', async () => {
      const mockStore = createMockGraphStore([])
      const frontend = new DefaultFrontend(mockStore as any, mockOntology)
      const result = await frontend.process('预测商户风险')
      expect(result.status).toBe('ready')
      expect(result.task.type).toBe('predictive')
    })

    it('should classify diagnostic intent correctly', async () => {
      const mockStore = createMockGraphStore([])
      const frontend = new DefaultFrontend(mockStore as any, mockOntology)
      const result = await frontend.process('为什么交易量下降')
      expect(result.status).toBe('ready')
      expect(result.task.type).toBe('diagnostic')
    })
  })

  describe('createFrontend factory', () => {
    it('should create DefaultFrontend instance', () => {
      const mockStore = createMockGraphStore([])
      const frontend = createFrontend(mockStore as any, mockOntology)
      expect(frontend).toBeInstanceOf(DefaultFrontend)
    })
  })
})