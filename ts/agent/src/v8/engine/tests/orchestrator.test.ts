import { describe, it, expect, beforeAll } from 'vitest'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { InMemoryGraphStore } from '../../provider/in-memory/in-memory-graph'
import { InMemoryComputeStore } from '../../provider/in-memory/in-memory-compute'
import { InMemoryVectorStore } from '../../provider/in-memory/in-memory-vector'
import { seedComputeStore } from '../../provider/in-memory/tests/fixtures/seed-ddl'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import { BaseNode, agentType, agentProperty } from '../../ontology'
import type { GraphTraversalQuery } from '../query/graph-query'
import type { ComputeQuery } from '../query/compute-query'
import type { VectorEntity } from '../query/vector-query'

// ── Test Node classes with decorators ──
@agentType({ name: 'Merch', description: 'Test merchant node' })
class MerchNode extends BaseNode {
  @agentProperty({ type: 'string', description: 'Merchant number' })
  merch_no: string

  @agentProperty({ type: 'string', description: 'Merchant name' })
  merch_name: string

  @agentProperty({ type: 'string', description: 'Merchant status' })
  status: string

  constructor(id: string, merch_no: string, merch_name: string, status: string) {
    super(id)
    this.merch_no = merch_no
    this.merch_name = merch_name
    this.status = status
  }
}

@agentType({ name: 'Agent', description: 'Test agent node' })
class AgentNode extends BaseNode {
  @agentProperty({ type: 'string', description: 'Agent number' })
  agent_no: string

  @agentProperty({ type: 'string', description: 'Agent name' })
  agent_name: string

  @agentProperty({ type: 'string', description: 'Agent type' })
  agent_type: string

  constructor(id: string, agent_no: string, agent_name: string, agent_type: string) {
    super(id)
    this.agent_no = agent_no
    this.agent_name = agent_name
    this.agent_type = agent_type
  }
}

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
    graphStore.addNode(new MerchNode('Merch:M001', 'M001', 'Merchant 1', 'active'))
    graphStore.addNode(new MerchNode('Merch:M002', 'M002', 'Merchant 2', 'inactive'))
    graphStore.addNode(new MerchNode('Merch:M003', 'M003', 'Merchant 3', 'pending'))
    graphStore.addNode(new AgentNode('Agent:A001', 'A001', 'Agent 1', 'MERCH'))
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
        return: { limit: 10 },
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.mode).toBe('nodes')
        expect(result.data.rows.length).toBeGreaterThan(0)
      }
    })

    it('injects candidates into workspace', async () => {
      workspace.setCandidates([])
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      expect(workspace.candidates).toContain('Merch:M001')
    })

    it('injects facts into workspace.bindings', async () => {
      workspace.clearFacts()
      const query: GraphTraversalQuery = {
        match: { type: 'Merch' },
        return: {},
      }
      await orchestrator.executeGraphQuery(query)
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'type')).toBe(true)
      expect(facts.getValue('Merch:M001', 'type')).toBe('Merch')
    })

    it('handles errors gracefully', async () => {
      const query: GraphTraversalQuery = {
        match: { type: 'UnknownType' },
        return: {},
      }
      const result = await orchestrator.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(0)
      }
    })
  })

  describe('executeComputeQuery', () => {
    it('returns success for valid query', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await orchestrator.executeComputeQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(1)
      }
    })

    it('resolves $workspace.candidates dynamic reference', async () => {
      workspace.setCandidates(['M001', 'M002', 'M003'])
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: '$workspace.candidates' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      }
      const result = await orchestrator.executeComputeQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Should have filtered by M001, M002, M003
        expect(result.data.rows[0].cnt).toBe(6)
      }
    })

    it('injects compute facts into workspace', async () => {
      workspace.clearFacts()
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'total' }],
      }
      await orchestrator.executeComputeQuery(query)
      const facts = workspace.getFacts()
      expect(facts.has('compute:result', 'total')).toBe(true)
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

    it('returns error for non-existent node', async () => {
      const result = await orchestrator.inspectNode('Unknown:001')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('NOT_FOUND')
      }
    })

    it('injects node facts into workspace', async () => {
      workspace.clearFacts()
      await orchestrator.inspectNode('Merch:M001')
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'merch_name')).toBe(true)
    })
  })

  describe('searchNodes', () => {
    it('returns paginated nodes', async () => {
      const result = await orchestrator.searchNodes({ type: 'Merch' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
        expect(result.data.page.limit).toBe(10)
      }
    })

    it('applies filters', async () => {
      const result = await orchestrator.searchNodes({
        type: 'Merch',
        where: [{ property: 'status', op: 'eq', value: 'active' }],
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBe(1)
        expect(result.data.items[0].nodeId).toBe('Merch:M001')
      }
    })
  })

  describe('searchVectors', () => {
    it('returns matching entities', async () => {
      const result = await orchestrator.searchVectors({ query: 'active' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.hits.length).toBeGreaterThan(0)
      }
    })
  })
})