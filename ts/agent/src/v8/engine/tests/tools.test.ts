import { describe, it, expect, beforeAll } from 'vitest'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { InMemoryGraphStore } from '../../provider/in-memory/in-memory-graph'
import { InMemoryComputeStore } from '../../provider/in-memory/in-memory-compute'
import { InMemoryVectorStore } from '../../provider/in-memory/in-memory-vector'
import { seedComputeStore } from '../../provider/in-memory/tests/fixtures/seed-ddl'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import { OPEN_POLICY } from '../../policy/context'
import { createGraphTools } from '../tools/graph-tools'
import { createComputeTools } from '../tools/compute-tools'
import { createVectorTools } from '../tools/vector-tools'
import { createFactTools } from '../tools/fact-tools'
import { createCandidateTools } from '../tools/candidate-tools'
import { BaseNode, agentType, agentProperty } from '../../ontology'
import type { VectorEntity } from '../query/vector-query'

// ── Test Node classes with decorators ──
@agentType({ name: 'Merch', description: 'Test merchant node' })
class MerchNode extends BaseNode {
  @agentProperty({ type: 'string', description: 'Merchant number' })
  merch_no: string

  @agentProperty({ type: 'string', description: 'Merchant name' })
  merch_name: string

  constructor(id: string, merch_no: string, merch_name: string) {
    super(id)
    this.merch_no = merch_no
    this.merch_name = merch_name
  }
}

@agentType({ name: 'Agent', description: 'Test agent node' })
class AgentNode extends BaseNode {
  @agentProperty({ type: 'string', description: 'Agent number' })
  agent_no: string

  constructor(id: string, agent_no: string) {
    super(id)
    this.agent_no = agent_no
  }
}

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
    graphStore.addNode(new MerchNode('Merch:M001', 'M001', 'Merchant 1'))
    graphStore.addNode(new MerchNode('Merch:M002', 'M002', 'Merchant 2'))
    graphStore.addNode(new AgentNode('Agent:A001', 'A001'))
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
    it('search_nodes tool routes to runtime', async () => {
      const graphTools = createGraphTools(runtime)

      const result = await graphTools.search_nodes.execute!({ type: 'Merch' },  { toolCallId: 'search_nodes', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBeGreaterThan(0)
      }
    })

    it('query_neighbors tool routes to runtime', async () => {
      const graphTools = createGraphTools(runtime)

      const result = await graphTools.query_neighbors.execute!({
        nodeId: 'Merch:M001',
        relation: 'for_agent',
      },  { toolCallId: 'query_neighbors', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.items.length).toBe(1)
      }
    })

    it('inspect_node tool routes to runtime', async () => {
      const graphTools = createGraphTools(runtime)

      const result = await graphTools.inspect_node.execute!({ nodeId: 'Merch:M001' },  { toolCallId: 'inspect_node', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.id).toBe('Merch:M001')
      }
    })
  })

  describe('Compute Tools', () => {
    it('compute_query tool routes to runtime', async () => {
      const computeTools = createComputeTools(runtime)

      const result = await computeTools.compute_query.execute!({
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
      },  { toolCallId: 'compute_query', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.rows.length).toBe(1)
      }
    })
  })

  describe('Vector Tools', () => {
    it('vector_search tool routes to runtime', async () => {
      const vectorTools = createVectorTools(runtime)

      const result = await vectorTools.vector_search.execute!({ query: 'active' },  { toolCallId: 'vector_search', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.hits.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Fact Tools', () => {
    it('bind_fact tool updates workspace', async () => {
      const factTools = createFactTools(workspace, OPEN_POLICY)

      const result = await factTools.bind_fact.execute!({
        entityId: 'Merch:M001',
        property: 'test_fact',
        value: true,
        confidence: 0.9,
        sourceKind: 'test',
      },  { toolCallId: 'bind_fact', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.bound).toBe(true)
      }

      const facts = workspace.getFacts()
      expect(facts.has('Merch:M001', 'test_fact')).toBe(true)
    })

    it('get_fact tool retrieves from workspace', async () => {
      const factTools = createFactTools(workspace, OPEN_POLICY)

      // First bind a fact
      await factTools.bind_fact.execute!({
        entityId: 'Merch:M002',
        property: 'status',
        value: 'active',
        confidence: 0.95,
        sourceKind: 'test',
      },  { toolCallId: 'bind_fact', messages: [] })

      // Then retrieve it
      const result = await factTools.get_fact.execute!({
        entityId: 'Merch:M002',
        property: 'status',
      },  { toolCallId: 'get_fact', messages: [] }) as any
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.value).toBe('active')
      }
    })
  })

  describe('Candidate Tools', () => {
    it('propose_candidates tool sets workspace.candidates', async () => {
      const candidateTools = createCandidateTools(workspace, OPEN_POLICY)

      const result = await candidateTools.propose_candidates.execute!({
        candidates: [{ label: 'Merch:M001' }],
      },  { toolCallId: 'propose_candidates', messages: [] }) as any
      expect(result.ok).toBe(true)
      expect(workspace.candidates).toContain('Merch:M001')
    })

    it('clear_candidates tool clears workspace.candidates', async () => {
      const candidateTools = createCandidateTools(workspace, OPEN_POLICY)

      workspace.setCandidates(['Merch:M001', 'Merch:M002'])
      const result = await candidateTools.clear_candidates.execute!({},  { toolCallId: 'clear_candidates', messages: [] }) as any
      expect(result.ok).toBe(true)
      expect(workspace.candidates.length).toBe(0)
    })
  })
})