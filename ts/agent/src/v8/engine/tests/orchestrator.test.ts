import { describe, it, expect, beforeAll } from 'vitest'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { InMemoryGraphStore } from '../../provider/in-memory/in-memory-graph'
import { InMemoryComputeStore } from '../../provider/in-memory/in-memory-compute'
import { InMemoryVectorStore } from '../../provider/in-memory/in-memory-vector'
import { seedComputeStore } from '../../provider/in-memory/tests/fixtures/seed-ddl'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import type { GraphTraversalQuery } from '../query/graph-query'
import type { ComputeQuery } from '../query/compute-query'
import type { VectorEntity } from '../query/vector-query'

describe('V8 SemanticRuntimeOrchestrator', () => {
  let orchestrator: SemanticRuntimeOrchestrator
  let workspace: Workspace
  let graphStore: InMemoryGraphStore
  let computeStore: InMemoryComputeStore
  let vectorStore: InMemoryVectorStore

  beforeAll(async () => {
    // Setup stores
    graphStore = new InMemoryGraphStore()
    computeStore = new InMemoryComputeStore()
    seedComputeStore(computeStore)
    vectorStore = new InMemoryVectorStore()

    // Seed graph store with nodes and edges
    graphStore.addNode({ id: 'Merch:M001', type: 'Merch', properties: { merch_no: 'M001', merch_name: 'Merchant 1', status: 'active' } })
    graphStore.addNode({ id: 'Merch:M002', type: 'Merch', properties: { merch_no: 'M002', merch_name: 'Merchant 2', status: 'inactive' } })
    graphStore.addNode({ id: 'Merch:M003', type: 'Merch', properties: { merch_no: 'M003', merch_name: 'Merchant 3', status: 'pending' } })
    graphStore.addNode({ id: 'Agent:A001', type: 'Agent', properties: { agent_no: 'A001', agent_name: 'Agent 1', agent_type: 'MERCH' } })
    graphStore.addEdge({ from: 'Merch:M001', to: 'Agent:A001', type: 'for_agent' })
    graphStore.addEdge({ from: 'Merch:M002', to: 'Agent:A001', type: 'for_agent' })
    graphStore.addEdge({ from: 'Merch:M003', to: 'Agent:A001', type: 'for_agent' })

    // Index vector entities
    const entities: VectorEntity[] = [
      { id: 'Merch:M001', type: 'Merch', content: 'Merchant 1 active transactions' },
      { id: 'Merch:M002', type: 'Merch', content: 'Merchant 2 inactive' },
    ]
    for (const e of entities) {
      await vectorStore.indexEntity(e)
    }

    // Setup workspace
    workspace = new Workspace()

    // Create orchestrator
    orchestrator = new SemanticRuntimeOrchestrator(
      graphStore,
      computeStore,
      vectorStore,
      workspace,
      DEFAULT_RUNTIME_CONFIG,
    )
  })

  describe('executeGraphQuery', () => {
    it('returns success for valid query', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.mode).toBe('nodes')
        expect(result.data.rows.length).toBeGreaterThan(0)
      }
    })

    it('injects candidates into workspace', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch', where: [{ property: 'merch_no', op: 'eq', value: 'M001' }] },
        return: {},
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      expect(workspace.candidates).toContain('Merch:M001')
    })

    it('injects facts into workspace.bindings', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch', where: [{ property: 'merch_no', op: 'eq', value: 'M001' }] },
        return: {},
      }
      await orchestrator.executeGraphQuery(query)
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'type')).toBe(true)
      expect(facts.getValue('Merch:M001', 'type')).toBe('Merch')
    })

    it('returns POLICY_DENIED for deep traversal', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        traverse: [
          { relation: 'for_agent' },
          { relation: 'managed_by' },
          { relation: 'owned_by' },
          { relation: 'partner_with' },
          { relation: 'connected_to' },
          { relation: 'related_to' }, // 6 steps, exceeds default maxDepth 5
        ],
        return: {},
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('POLICY_DENIED')
        expect(result.message).toContain('exceeds limit')
      }
    })
  })

  describe('executeComputeQuery', () => {
    it('returns success for valid query', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await orchestrator.executeComputeQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(1)
        expect(result.data.rows[0].cnt).toBe(6)
      }
    })

    it('injects facts for compute results', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'total_amt' }],
      }
      await orchestrator.executeComputeQuery(query)
      const facts = workspace.getFacts()
      expect(facts.has('compute:result', 'total_amt')).toBe(true)
    })

    it('resolves $workspace.candidates dynamic reference', async () => {
      // First set candidates via graph query
      const graphQuery: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      await orchestrator.executeGraphQuery(graphQuery)

      // Now use $workspace.candidates in compute query
      const computeQuery: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: '$workspace.candidates' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await orchestrator.executeComputeQuery(computeQuery)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Should have filtered by M001, M002, M003
        expect(result.data.rows[0].cnt).toBe(6)
      }
    })

    it('resolves global IDs to raw IDs in dynamic reference', async () => {
      // Set candidates with global IDs (Merch:M001, Merch:M002, etc.)
      workspace.setCandidates(['Merch:M001', 'Merch:M002'])

      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: '$workspace.candidates' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await orchestrator.executeComputeQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Raw IDs M001, M002 should match OrderDaily data
        expect(result.data.rows[0].cnt).toBe(6)
      }
    })
  })

  describe('executeVectorQuery', () => {
    it('returns success for matching query', async () => {
      const result = await orchestrator.executeVectorQuery({ query: 'merchant' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.hits.length).toBeGreaterThan(0)
      }
    })

    it('injects facts for vector hits', async () => {
      await orchestrator.executeVectorQuery({ query: 'merchant' })
      const facts = workspace.getFacts()
      // Should have semantic_score facts
      const scoreBindings = facts.forProperty('semantic_score')
      expect(scoreBindings.length).toBeGreaterThan(0)
    })
  })

  describe('inspectNode', () => {
    it('returns node data for existing node', async () => {
      const result = await orchestrator.inspectNode('Merch:M001')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.id).toBe('Merch:M001')
        expect(result.data.type).toBe('Merch')
      }
    })

    it('returns NOT_FOUND for missing node', async () => {
      const result = await orchestrator.inspectNode('NonExistent:XYZ')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND')
      }
    })

    it('injects node facts into workspace', async () => {
      await orchestrator.inspectNode('Merch:M001')
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'merch_name')).toBe(true)
    })
  })

  describe('searchNodes', () => {
    it('returns paginated nodes', async () => {
      const result = await orchestrator.searchNodes({ type: 'Merch', limit: 10 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
        expect(result.data.page.limit).toBe(10)
      }
    })

    it('injects facts for all found nodes', async () => {
      await orchestrator.searchNodes({ type: 'Merch' })
      const facts = workspace.getFacts()
      expect(facts.forEntity('Merch:M001').length).toBeGreaterThan(0)
    })
  })

  describe('queryNeighbors', () => {
    it('returns neighbors for node', async () => {
      const result = await orchestrator.queryNeighbors('Merch:M001')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
      }
    })

    it('supports relation filter', async () => {
      const result = await orchestrator.queryNeighbors('Merch:M001', {
        relation: 'for_agent',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.every((n) => n.relation === 'for_agent')).toBe(true)
      }
    })
  })
})