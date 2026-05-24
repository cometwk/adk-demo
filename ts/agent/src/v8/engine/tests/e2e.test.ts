import { describe, it, expect, beforeAll } from 'vitest'
import { InMemoryGraphStore } from '../impl/in-memory-graph'
import { InMemoryComputeStore } from '../impl/in-memory-compute'
import { InMemoryVectorStore } from '../impl/in-memory-vector'
import { seedComputeStore } from './fixtures/seed-ddl'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import { OPEN_POLICY } from '../../policy/context'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { createGraphTools } from '../tools/graph-tools'
import { createComputeTools } from '../tools/compute-tools'
import { createFactTools } from '../tools/fact-tools'
import { createCandidateTools } from '../tools/candidate-tools'
import type { VectorEntity } from '../query/vector-query'
import type { ComputeQuery } from '../query/compute-query'
import type { GraphTraversalQuery } from '../query/graph-query'

// ── E2E Integration Test ──
// Tests the complete two-phase reasoning flow:
// graph_query → candidates → compute_query with $workspace.candidates

describe('V8 E2E Integration', () => {
  let graphStore: InMemoryGraphStore
  let computeStore: InMemoryComputeStore
  let vectorStore: InMemoryVectorStore
  let workspace: Workspace
  let runtime: SemanticRuntimeOrchestrator

  beforeAll(async () => {
    // Setup stores
    graphStore = new InMemoryGraphStore()
    computeStore = new InMemoryComputeStore()
    seedComputeStore(computeStore)
    vectorStore = new InMemoryVectorStore()

    // Seed graph store with Merch and Agent nodes
    graphStore.addNode({
      id: 'Merch:M001',
      type: 'Merch',
      properties: { merch_no: 'M001', merch_name: 'Merchant 1', status: 'active' },
    })
    graphStore.addNode({
      id: 'Merch:M002',
      type: 'Merch',
      properties: { merch_no: 'M002', merch_name: 'Merchant 2', status: 'active' },
    })
    graphStore.addNode({
      id: 'Merch:M003',
      type: 'Merch',
      properties: { merch_no: 'M003', merch_name: 'Merchant 3', status: 'pending' },
    })
    graphStore.addNode({
      id: 'Agent:A001',
      type: 'Agent',
      properties: { agent_no: 'A001', agent_name: 'Agent 1', agent_type: 'MERCH' },
    })

    // Add edges: Merch → Agent via for_agent
    graphStore.addEdge({ from: 'Merch:M001', to: 'Agent:A001', type: 'for_agent' })
    graphStore.addEdge({ from: 'Merch:M002', to: 'Agent:A001', type: 'for_agent' })
    graphStore.addEdge({ from: 'Merch:M003', to: 'Agent:A001', type: 'for_agent' })

    // Index vector entities
    const entities: VectorEntity[] = [
      { id: 'Merch:M001', type: 'Merch', content: 'Merchant 1 active transactions' },
      { id: 'Merch:M002', type: 'Merch', content: 'Merchant 2 active transactions' },
      { id: 'Merch:M003', type: 'Merch', content: 'Merchant 3 pending no transactions' },
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

  describe('Two-Phase Reasoning Flow', () => {
    it('Phase 1: graph_query collects candidates', async () => {
      // Step 1: Find merchants for Agent A001
      // MATCH Agent → TRAVERSE in via for_agent → RETURN Merch nodes
      const query: GraphTraversalQuery = {
        match: { type: 'Agent', where: [{ property: 'agent_no', op: 'eq', value: 'A001' }] },
        traverse: [{ relation: 'for_agent', direction: 'in', targetType: 'Merch', alias: 'merchants' }],
        return: { alias: 'merchants' }, // Return the traversed Merch nodes
      }

      const result = await runtime.executeGraphQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Should find M001, M002, M003
        expect(result.data.rows.length).toBe(3)
        expect(result.data.rows.map((r) => r.nodeId)).toContain('Merch:M001')
        expect(result.data.rows.map((r) => r.nodeId)).toContain('Merch:M002')
        expect(result.data.rows.map((r) => r.nodeId)).toContain('Merch:M003')
      }

      // Verify candidates injected
      expect(workspace.candidates.length).toBe(3)
    })

    it('Phase 2: compute_query with dynamic reference', async () => {
      // Pre-condition: candidates should be set from Phase 1
      workspace.setCandidates(['Merch:M001', 'Merch:M002', 'Merch:M003'])

      // Step 2: Check transaction counts for candidates
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'in', value: '$workspace.candidates' }],
        metrics: [{ field: '*', fn: 'count', as: 'txn_cnt' }],
        groupBy: ['merch_no'],
        orderBy: [{ field: 'txn_cnt', direction: 'asc' }],
      }

      const result = await runtime.executeComputeQuery(query)
      expect(result.ok).toBe(true)
      if (result.ok) {
        // Seed data: M001 has 3 transactions, M002 has 3, M003 has 0 (not in data)
        expect(result.data.rows.length).toBe(2) // M003 not in OrderDaily
        const m001Row = result.data.rows.find((r) => r.group?.merch_no === 'M001')
        expect(m001Row?.txn_cnt).toBe(3)
        const m002Row = result.data.rows.find((r) => r.group?.merch_no === 'M002')
        expect(m002Row?.txn_cnt).toBe(3)
      }
    })

    it('Full flow: bind_fact for semantic assertion', async () => {
      const tools = createFactTools(workspace, OPEN_POLICY)

      // Agent binds semantic assertion: M003 has no transactions
      const result = await tools.bind_fact.execute!({
        entityId: 'Merch:M003',
        property: 'no_transaction',
        value: true,
        confidence: 0.95,
        sourceKind: 'graph_property',
      },  { toolCallId: 'bind_fact', messages: [] }) as any

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.bound).toBe(true)
      }

      // Verify in workspace
      const facts = workspace.getFacts()
      expect(facts.has('Merch:M003', 'no_transaction')).toBe(true)
      expect(facts.getValue('Merch:M003', 'no_transaction')).toBe(true)
    })
  })

  describe('Runtime Auto-Injection', () => {
    it('injects node facts after inspect_node', async () => {
      const result = await runtime.inspectNode('Merch:M001')
      expect(result.ok).toBe(true)

      const facts = workspace.getFacts()
      // Runtime should inject type and properties
      expect(facts.has('Merch:M001', 'type')).toBe(true)
      expect(facts.getValue('Merch:M001', 'merch_name')).toBeDefined()
    })

    it('injects compute facts after compute_query', async () => {
      const query: ComputeQuery = {
        source: 'OrderDaily',
        filters: [{ field: 'merch_no', op: 'eq', value: 'M001' }],
        metrics: [{ field: 'total_amount', fn: 'sum', as: 'total_amt' }],
      }

      const result = await runtime.executeComputeQuery(query)
      expect(result.ok).toBe(true)

      const facts = workspace.getFacts()
      // Runtime should inject compute result
      expect(facts.has('compute:result', 'total_amt')).toBe(true)
    })
  })

  describe('Tools Integration', () => {
    it('graph_tools route correctly', async () => {
      const graphTools = createGraphTools(runtime)

      // Test search_nodes
      const searchResult = await graphTools.search_nodes.execute!({ type: 'Merch' },  { toolCallId: 'search_nodes', messages: [] }) as any
      expect(searchResult.ok).toBe(true)
      if (searchResult.ok) {
        expect(searchResult.data.items.length).toBe(3)
      }

      // Test query_neighbors
      const neighborResult = await graphTools.query_neighbors.execute!({
        nodeId: 'Merch:M001',
        relation: 'for_agent',
      },  { toolCallId: 'query_neighbors', messages: [] }) as any
      expect(neighborResult.ok).toBe(true)
      if (neighborResult.ok) {
        expect(neighborResult.data.items.length).toBe(1)
        expect(neighborResult.data.items[0].nodeId).toBe('Agent:A001')
      }
    })

    it('compute_tools route correctly', async () => {
      const computeTools = createComputeTools(runtime)

      const result = await computeTools.compute_query.execute!({
        source: 'ProfitDaily',
        filters: [{ field: 'agent_no', op: 'eq', value: 'A001' }],
        metrics: [{ field: 'net_profit', fn: 'sum', as: 'total_profit' }],
      },  { toolCallId: 'compute_query', messages: [] }) as any

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Seed data: A001 has 4800 total net_profit
        expect(result.data.rows[0].total_profit).toBe(4800)
      }
    })

    it('candidate_tools set workspace.candidates', async () => {
      const candidateTools = createCandidateTools(workspace, OPEN_POLICY)

      // Clear existing candidates
      workspace.setCandidates([])

      const result = await candidateTools.propose_candidates.execute!({
        candidates: [
          { label: 'Merch:M001' },
          { label: 'Merch:M002' },
          { label: 'Merch:M003' },
        ],
      },  { toolCallId: 'propose_candidates', messages: [] }) as any

      expect(result.ok).toBe(true)
      expect(workspace.candidates).toEqual(['Merch:M001', 'Merch:M002', 'Merch:M003'])
    })
  })
})