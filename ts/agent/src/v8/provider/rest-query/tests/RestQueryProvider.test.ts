import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RestQueryProvider } from '../RestQueryProvider'
import type { RestAccessBindingMap, AccessContext, RestNodeClassRegistry } from '../context'
import type { NodeData, Paginated } from '../../../engine'
import type { SearchParams } from '../http-client'

// Mock BaseNode class
class MockMerchNode {
  id: string
  constructor(id: string) {
    this.id = id
  }
}

describe('RestQueryProvider', () => {
  let provider: RestQueryProvider
  let mockCtx: Partial<AccessContext>
  let mockBindings: RestAccessBindingMap
  let mockTypeRegistry: RestNodeClassRegistry

  beforeEach(() => {
    mockTypeRegistry = {
      Merch: { class: MockMerchNode as unknown as new (id: string) => any, prefix: '/merch' },
      Agent: { prefix: '/agent' },
    }

    mockBindings = {
      'Merch:for_agent:out': {
        kind: 'search',
        relation: 'for_agent',
        fromType: 'Merch',
        toType: 'Agent',
        direction: 'out',
        searchOn: 'Agent',
        params: (source: NodeData) => ({
          'where.merch_no.eq': source.id.split(':')[1],
        }),
      },
    }

    const mockFetchOne = vi.fn(async (type: string, rawId: string): Promise<NodeData | undefined> => {
      if (type === 'Merch' && rawId === 'M001') {
        return { id: 'Merch:M001', type: 'Merch', properties: { merch_no: 'M001', name: 'Test Merch' } }
      }
      return undefined
    })

    const mockApiSearchSafe = vi.fn(async <T extends Record<string, unknown>>(
      prefix: string,
      query?: SearchParams
    ): Promise<Paginated<T>> => {
      if (prefix === '/merch') {
        return {
          items: [{ id: 'M001', merch_no: 'M001', name: 'Test Merch' } as T],
          page: { offset: 0, limit: 20, hasMore: false, total: 1 },
        }
      }
      return { items: [], page: { offset: 0, limit: 20, hasMore: false, total: 0 } }
    })

    mockCtx = {
      typeRegistry: mockTypeRegistry,
      fetchOne: mockFetchOne,
      apiSearchSafe: mockApiSearchSafe,
      rawId: (node: NodeData) => node.id.split(':')[1],
      toGlobalId: (type: string, rawId: string) => `${type}:${rawId}`,
    }
  })

  describe('getNode', () => {
    it('should return NodeData for valid ID', async () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      const result = await provider.getNode('Merch:M001')
      expect(result).toBeDefined()
      expect(result?.type).toBe('Merch')
      expect(result?.id).toBe('Merch:M001')
    })

    it('should return undefined for invalid ID format', async () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      const result = await provider.getNode('invalid')
      expect(result).toBeUndefined()
    })
  })

  describe('getBaseNode', () => {
    it('should return cached BaseNode instance', async () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      const result1 = await provider.getBaseNode('Merch:M001')
      expect(result1).toBeDefined()
      expect(result1?.id).toBe('Merch:M001')

      // 第二次调用应返回缓存
      const result2 = await provider.getBaseNode('Merch:M001')
      expect(result2).toBe(result1)
    })

    it('should return undefined for unknown type', async () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      const result = await provider.getBaseNode('Unknown:001')
      expect(result).toBeUndefined()
    })
  })

  describe('parseGlobalId', () => {
    it('should parse valid global ID', () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      const result = provider.parseGlobalId('Merch:M001')
      expect(result.type).toBe('Merch')
      expect(result.rawId).toBe('M001')
    })

    it('should throw for invalid ID format', () => {
      provider = new RestQueryProvider(mockBindings, mockCtx)
      expect(() => provider.parseGlobalId('invalid')).toThrow()
    })
  })
})