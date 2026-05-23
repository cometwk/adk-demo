import { describe, it, expect, beforeAll } from 'vitest'
import { InMemoryGraphStore } from '../impl/in-memory-graph'
import { OPEN_POLICY } from '../../policy/context'
import type { NodeData, Edge } from '../runtime/types'
import type { GraphTraversalQuery } from '../query/graph-query'

describe('V8 InMemoryGraphStore', () => {
  let store: InMemoryGraphStore

  beforeAll(() => {
    store = new InMemoryGraphStore()

    // Add nodes
    const agent1: NodeData = { id: 'Agent:A001', type: 'Agent', properties: { name: 'Agent 1', status: 'active' } }
    const merch1: NodeData = { id: 'Merch:M001', type: 'Merch', properties: { name: 'Merchant 1', status: 'active' } }
    const merch2: NodeData = { id: 'Merch:M002', type: 'Merch', properties: { name: 'Merchant 2', status: 'inactive' } }
    const merch3: NodeData = { id: 'Merch:M003', type: 'Merch', properties: { name: 'Merchant 3', status: 'active' } }

    store.addNode(agent1)
    store.addNode(merch1)
    store.addNode(merch2)
    store.addNode(merch3)

    // Add edges
    const edge1: Edge = { from: 'Agent:A001', to: 'Merch:M001', type: 'manages' }
    const edge2: Edge = { from: 'Agent:A001', to: 'Merch:M002', type: 'manages' }
    store.addEdge(edge1)
    store.addEdge(edge2)
  })

  describe('Node operations', () => {
    it('getNode returns node by id', async () => {
      const node = await store.getNode('Agent:A001')
      expect(node).toBeDefined()
      expect(node?.type).toBe('Agent')
      expect(node?.properties.name).toBe('Agent 1')
    })

    it('getNode returns undefined for unknown id', async () => {
      const node = await store.getNode('Unknown:001')
      expect(node).toBeUndefined()
    })

    it('findNodes returns nodes by type', async () => {
      const result = await store.findNodes({ type: 'Merch' })
      expect(result.items.length).toBe(3)
      expect(result.page.hasMore).toBe(false)
    })

    it('findNodes with where filter', async () => {
      const result = await store.findNodes({
        type: 'Merch',
        where: [{ property: 'status', op: 'eq', value: 'active' }],
      })
      expect(result.items.length).toBe(2)
    })

    it('findNodes with pagination', async () => {
      const result = await store.findNodes({ type: 'Merch', limit: 2, offset: 0 })
      expect(result.items.length).toBe(2)
      expect(result.page.hasMore).toBe(true)
    })
  })

  describe('Edge operations', () => {
    it('getNeighbors returns outgoing neighbors', async () => {
      const result = await store.getNeighbors('Agent:A001', { relation: 'manages', direction: 'out' })
      expect(result.items.length).toBe(2)
      expect(result.items[0].relation).toBe('manages')
      expect(result.items[0].direction).toBe('out')
    })

    it('getNeighbors returns incoming neighbors', async () => {
      const result = await store.getNeighbors('Merch:M001', { relation: 'manages', direction: 'in' })
      expect(result.items.length).toBe(1)
      expect(result.items[0].nodeId).toBe('Agent:A001')
    })

    it('getNeighbors with targetType filter', async () => {
      const result = await store.getNeighbors('Agent:A001', {
        relation: 'manages',
        direction: 'out',
        targetType: 'Merch',
      })
      expect(result.items.length).toBe(2)
    })

    it('getEdgeSummary returns edge counts', async () => {
      const summary = await store.getEdgeSummary('Agent:A001')
      expect(summary.length).toBe(1)
      expect(summary[0].relation).toBe('manages')
      expect(summary[0].direction).toBe('out')
      expect(summary[0].count).toBe(2)
    })
  })

  describe('GraphTraversalQuery', () => {
    it('MATCH single type', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: { limit: 10 },
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.mode).toBe('nodes')
        expect(result.data.rows.length).toBe(3)
      }
    })

    it('MATCH + TRAVERSE out', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Agent' },
        traverse: [{ relation: 'manages', direction: 'out' }],
        return: { alias: '_start' },
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Returns the Agent nodes that have manages edges
        expect(result.data.rows.length).toBe(1)
        expect(result.data.rows[0].nodeId).toBe('Agent:A001')
      }
    })

    it('MATCH + TRAVERSE with alias', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Agent', alias: 'a' },
        traverse: [{ from: 'a', relation: 'manages', direction: 'out', alias: 'm' }],
        return: { alias: 'm' },
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Returns the Merch nodes that are targets
        expect(result.data.rows.length).toBe(2)
      }
    })

    it('MATCH + where filter', async () => {
      const query: GraphTraversalQuery = {
        match: {
          type: 'Merch',
          where: [{ property: 'status', op: 'eq', value: 'active' }],
        },
        return: {},
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(2)
      }
    })

    it('TRAVERSE require="exists"', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Agent' },
        traverse: [{ relation: 'manages', direction: 'out', require: 'exists' }],
        return: {},
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(1)
      }
    })

    it('RETURN with fields projection', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: { fields: ['name'], limit: 2 },
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows[0].properties.name).toBeDefined()
        expect(result.data.rows[0].properties.status).toBeUndefined()
      }
    })

    it('Pagination limit/offset', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: { limit: 1, offset: 1 },
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(1)
        expect(result.data.total).toBe(3)
      }
    })

    it('Error on unknown alias', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Agent' },
        traverse: [{ from: 'unknown_alias', relation: 'manages', direction: 'out' }],
        return: {},
      }
      const result = await store.query(query, OPEN_POLICY)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_ARGS')
      }
    })

    it('Policy denies type', async () => {
      const denyPolicy = {
        ...OPEN_POLICY,
        scope: { deniedTypes: ['Merch'] },
      }
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      const result = await store.query(query, denyPolicy)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('POLICY_DENIED')
      }
    })

    it('Policy denies entity', async () => {
      const denyPolicy = {
        ...OPEN_POLICY,
        scope: { deniedEntityIds: ['Merch:M001'] },
      }
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      const result = await store.query(query, denyPolicy)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Should return 2 Merch nodes (M001 denied)
        expect(result.data.rows.length).toBe(2)
        expect(result.data.rows.find((r) => r.nodeId === 'Merch:M001')).toBeUndefined()
      }
    })
  })
})