import { describe, it, expect } from 'vitest'
import { toolOk, toolErr, parseGlobalId, toGlobalId } from '../runtime/types'
import { FactStore } from '../stores/fact-store'
import type { FactBinding } from '../runtime/types'

describe('V8 Core Types', () => {
  describe('ToolResult', () => {
    it('toolOk constructs success result', () => {
      const result = toolOk({ id: 'test' })
      expect(result.ok).toBe(true)
      expect(result.data.id).toBe('test')
    })

    it('toolOk with meta', () => {
      const result = toolOk({ count: 5 }, { source: 'test' })
      expect(result.ok).toBe(true)
      expect(result.meta?.source).toBe('test')
    })

    it('toolErr constructs error result', () => {
      const result = toolErr('NOT_FOUND', 'Entity not found')
      expect(result.ok).toBe(false)
      expect(result.code).toBe('NOT_FOUND')
      expect(result.message).toBe('Entity not found')
      expect(result.retryable).toBe(false)
    })

    it('toolErr with retryable option', () => {
      const result = toolErr('INTERNAL_ERROR', 'Temporary failure', { retryable: true })
      expect(result.retryable).toBe(true)
    })
  })

  describe('GlobalId', () => {
    it('parseGlobalId parses composite ID', () => {
      const result = parseGlobalId('Merch:M001')
      expect(result).toEqual({ type: 'Merch', rawId: 'M001' })
    })

    it('parseGlobalId returns null for non-composite ID', () => {
      const result = parseGlobalId('simple-id')
      expect(result).toBeNull()
    })

    it('toGlobalId creates composite ID', () => {
      const id = toGlobalId('Agent', 'A001')
      expect(id).toBe('Agent:A001')
    })

    it('round-trip: toGlobalId then parseGlobalId', () => {
      const id = toGlobalId('Merch', 'M123')
      const parsed = parseGlobalId(id)
      expect(parsed).toEqual({ type: 'Merch', rawId: 'M123' })
    })
  })

  describe('FactStore', () => {
    it('constructs from bindings', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'status',
          value: 'active',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      expect(store.has('Merch:M001', 'status')).toBe(true)
    })

    it('get returns binding', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'name',
          value: 'Test Merchant',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      const binding = store.get('Merch:M001', 'name')
      expect(binding?.value).toBe('Test Merchant')
    })

    it('getValue returns value directly', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'count',
          value: 10,
          source: { kind: 'compute_result' },
          confidence: 0.95,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      expect(store.getValue('Merch:M001', 'count')).toBe(10)
    })

    it('forEntity returns all bindings for entity', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'name',
          value: 'M1',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
        {
          entityId: 'Merch:M001',
          property: 'status',
          value: 'active',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
        {
          entityId: 'Merch:M002',
          property: 'name',
          value: 'M2',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      const m001Bindings = store.forEntity('Merch:M001')
      expect(m001Bindings.length).toBe(2)
    })

    it('higher confidence wins on collision', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'status',
          value: 'inactive',
          source: { kind: 'graph_property' },
          confidence: 0.7,
          validFrom: '2026-05-22T00:00:00Z',
          observedAt: '2026-05-22T00:00:00Z',
        },
        {
          entityId: 'Merch:M001',
          property: 'status',
          value: 'active',
          source: { kind: 'derived' },
          confidence: 0.95,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      expect(store.getValue('Merch:M001', 'status')).toBe('active')
    })

    it('snapshot returns all bindings', () => {
      const bindings: FactBinding[] = [
        {
          entityId: 'Merch:M001',
          property: 'name',
          value: 'Test',
          source: { kind: 'graph_property' },
          confidence: 0.9,
          validFrom: '2026-05-23T00:00:00Z',
          observedAt: '2026-05-23T00:00:00Z',
        },
      ]
      const store = new FactStore(bindings)
      const all = store.all()
      expect(all.length).toBe(1)
      expect(all[0].entityId).toBe('Merch:M001')
    })
  })
})