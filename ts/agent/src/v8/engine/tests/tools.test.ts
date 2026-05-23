import { describe, it, expect, beforeAll } from 'vitest'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { InMemoryGraphStore } from '../impl/in-memory-graph'
import { InMemoryComputeStore } from '../impl/in-memory-compute'
import { InMemoryVectorStore } from '../impl/in-memory-vector'
import { seedComputeStore } from './fixtures/seed-ddl'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import { OPEN_POLICY } from '../../policy/context'
import { createGraphTools } from '../tools/graph-tools'
import { createComputeTools } from '../tools/compute-tools'
import { createVectorTools } from '../tools/vector-tools'
import { createFactTools } from '../tools/fact-tools'
import { createCandidateTools } from '../tools/candidate-tools'
import type { VectorEntity } from '../query/vector-query'

describe('V8 Tools', () => {
  let runtime: SemanticRuntimeOrchestrator
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

    // Seed graph store
    graphStore.addNode({ id: 'Merch:M001', type: 'Merch', properties: { merch_no: 'M001', merch_name: 'Merchant 1' } })
    graphStore.addNode({ id: 'Merch:M002', type: 'Merch', properties: { merch_no: 'M002', merch_name: 'Merchant 2' } })
    graphStore.addNode({ id: 'Agent:A001', type: 'Agent', properties: { agent_no: 'A001' } })
    graphStore.addEdge({ from: 'Merch:M001', to: 'Agent:A001', type: 'for_agent' })

    // Index vector entities
    const entities: VectorEntity[] = [
      { id: 'Merch:M001', type: 'Merch', content: 'Merchant 1 active' },
    ]
    for (const e of entities) {
      await vectorStore.indexEntity(e)
    }

    // Setup workspace and runtime
    workspace = new Workspace()
    runtime = new SemanticRuntimeOrchestrator(
      graphStore,
      computeStore,
      vectorStore,
      workspace,
      DEFAULT_RUNTIME_CONFIG,
      OPEN_POLICY,
    )
  })

  describe('Graph Tools', () => {
    it('inspect_node tool routes to runtime', async () => {
      const tools = createGraphTools(runtime)
      // AI SDK v6: tool.execute is the handler
      const result = await tools.inspect_node.execute!({ nodeId: 'Merch:M001' },  { toolCallId: 'search_nodes', messages: [] })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.id).toBe('Merch:M001')
      }
    })

    it('search_nodes tool routes to runtime', async () => {
      const tools = createGraphTools(runtime)
      const result = await tools.search_nodes.execute({ type: 'Merch' })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
      }
    })

    it('query_neighbors tool routes to runtime', async () => {
      const tools = createGraphTools(runtime)
      const result = await tools.query_neighbors.execute({
        nodeId: 'Merch:M001',
        relation: 'for_agent',
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
      }
    })

    it('graph_query tool routes to runtime', async () => {
      const tools = createGraphTools(runtime)
      const result = await tools.graph_query.execute({
        match: { type: 'Merch' },
        return: {},
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.mode).toBe('nodes')
      }
    })
  })

  describe('Compute Tools', () => {
    it('compute_query tool routes to runtime', async () => {
      const tools = createComputeTools(runtime)
      const result = await tools.compute_query.execute({
        source: 'OrderDaily',
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows[0].cnt).toBe(6)
      }
    })
  })

  describe('Vector Tools', () => {
    it('vector_query tool routes to runtime', async () => {
      const tools = createVectorTools(runtime)
      const result = await tools.vector_query.execute({ query: 'merchant' })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.hits.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Fact Tools', () => {
    it('bind_fact writes to workspace.bindings', async () => {
      const tools = createFactTools(workspace, OPEN_POLICY)
      const result = await tools.bind_fact.execute({
        entityId: 'Merch:M001',
        property: 'decision',
        value: 'eligible',
        confidence: 0.9,
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.bound).toBe(true)
      }

      // Verify binding in workspace
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'decision')).toBe(true)
    })

    it('lookup_fact reads from workspace', async () => {
      // First bind a fact
      const tools = createFactTools(workspace, OPEN_POLICY)
      await tools.bind_fact.execute({
        entityId: 'Merch:M002',
        property: 'status',
        value: 'inactive',
        confidence: 0.85,
      })

      // Then lookup
      const result = await tools.lookup_fact.execute({
        entityId: 'Merch:M002',
        property: 'status',
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.found).toBe(true)
        expect(result.data.value).toBe('inactive')
      }
    })

    it('lookup_fact returns not found for unbound property', async () => {
      const tools = createFactTools(workspace, OPEN_POLICY)
      const result = await tools.lookup_fact.execute({
        entityId: 'Merch:M001',
        property: 'nonexistent',
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.found).toBe(false)
      }
    })
  })

  describe('Candidate Tools', () => {
    it('propose_candidates sets workspace.candidates', async () => {
      const tools = createCandidateTools(workspace, OPEN_POLICY)
      const result = await tools.propose_candidates.execute({
        candidates: [
          { label: 'Merch:M001', description: 'Merchant 1' },
          { label: 'Merch:M002', description: 'Merchant 2' },
        ],
      })
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.count).toBe(2)
      }

      // Verify candidates in workspace
      expect(workspace.candidates).toContain('Merch:M001')
      expect(workspace.candidates).toContain('Merch:M002')
    })

    it('list_workspace returns workspace state', async () => {
      const tools = createCandidateTools(workspace, OPEN_POLICY)
      const result = await tools.list_workspace.execute({})
      expect(result).toBeDefined()
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.candidates).toBeDefined()
        expect(result.data.factsCount).toBeGreaterThanOrEqual(0)
      }
    })
  })
})