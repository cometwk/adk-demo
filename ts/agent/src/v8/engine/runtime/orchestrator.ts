import type { GraphStore, FindNodesOpts, GetNeighborsOpts } from '../stores/graph-store'
import type { ComputeStore } from '../stores/compute-store'
import type { VectorStore } from '../stores/vector-store'
import type { GraphTraversalQuery, GraphQueryResult } from '../query/graph-query'
import type { ComputeQuery, ComputeQueryResult, ComputeFilter } from '../query/compute-query'
import type { VectorQuery, VectorQueryResult } from '../query/vector-query'
import type { ToolResult, NodeData, NeighborData, Paginated, FactBinding } from './types'
import type { RuntimeConfig } from './config'
import type { PolicyContext } from '../../policy/context'
import { toolOk, toolErr, parseGlobalId } from './types'
import { DEFAULT_RUNTIME_CONFIG } from './config'
import { Workspace } from './workspace'
import { FactStore } from '../stores/fact-store'
import { OPEN_POLICY } from '../../policy/context'

// ── Runtime Orchestrator ──
// Routes all tool calls to appropriate stores
// Enforces policy (traversal depth limits)
// Resolves dynamic references like $workspace.candidates
// Auto-injects facts into workspace.bindings

export interface RuntimeOrchestrator {
  // Graph Query (Traversal Only)
  executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>>

  // Compute Query (OLAP Aggregation)
  executeComputeQuery(query: ComputeQuery): Promise<ToolResult<ComputeQueryResult>>

  // Vector Query (Semantic Search)
  executeVectorQuery(query: VectorQuery): Promise<ToolResult<VectorQueryResult>>

  // Single node access (V6 compatible)
  inspectNode(nodeId: string): Promise<ToolResult<NodeData>>

  // Node search (V6 compatible)
  searchNodes(opts: FindNodesOpts): Promise<ToolResult<Paginated<NodeData>>>

  // Neighbor query (V6 compatible)
  queryNeighbors(nodeId: string, opts?: GetNeighborsOpts): Promise<ToolResult<Paginated<NeighborData>>>
}

export class SemanticRuntimeOrchestrator implements RuntimeOrchestrator {
  private graphStore: GraphStore
  private computeStore: ComputeStore
  private vectorStore: VectorStore
  private workspace: Workspace
  private config: RuntimeConfig
  private policy: PolicyContext

  constructor(
    graphStore: GraphStore,
    computeStore: ComputeStore,
    vectorStore: VectorStore,
    workspace: Workspace,
    config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
    policy: PolicyContext = OPEN_POLICY,
  ) {
    this.graphStore = graphStore
    this.computeStore = computeStore
    this.vectorStore = vectorStore
    this.workspace = workspace
    this.config = config
    this.policy = policy
  }

  // ── Graph Query ──

  async executeGraphQuery(query: GraphTraversalQuery): Promise<ToolResult<GraphQueryResult>> {
    // 1. Policy validation (traversal depth)
    const validation = this.validateTraversalPolicy(query)
    if (!validation.ok) {
      return toolErr('POLICY_DENIED', validation.error!)
    }

    // 2. Execute via GraphStore (with policy)
    try {
      const result = await this.graphStore.query(query, this.policy)

      if (!result.ok) {
        return result
      }

      // 3. Inject candidate IDs into workspace
      if (result.data.rows.length > 0) {
        const candidateIds = result.data.rows.map((r) => r.nodeId)
        this.workspace.setCandidates(candidateIds)
      }

      // 4. Inject facts into workspace.bindings
      this.injectGraphQueryFacts(result.data)

      return result
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Compute Query ──

  async executeComputeQuery(query: ComputeQuery): Promise<ToolResult<ComputeQueryResult>> {
    // 1. Resolve dynamic references
    const resolvedQuery = this.resolveDynamicReferences(query)

    // 2. Execute via ComputeStore
    try {
      const result = await this.computeStore.aggregate(resolvedQuery)

      // 3. Inject facts into workspace.bindings
      this.injectComputeQueryFacts(result)

      return toolOk(result)
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Vector Query ──

  async executeVectorQuery(query: VectorQuery): Promise<ToolResult<VectorQueryResult>> {
    try {
      const result = await this.vectorStore.search(query)

      // Inject facts
      this.injectVectorQueryFacts(result)

      return toolOk(result)
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Single Node Access ──

  async inspectNode(nodeId: string): Promise<ToolResult<NodeData>> {
    try {
      const node = await this.graphStore.getNode(nodeId)
      if (!node) {
        return toolErr('NOT_FOUND', `Node ${nodeId} not found`)
      }

      // Inject fact for this node
      this.injectNodeFacts(node)

      return toolOk(node)
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Node Search ──

  async searchNodes(opts: FindNodesOpts): Promise<ToolResult<Paginated<NodeData>>> {
    try {
      const result = await this.graphStore.findNodes(opts)

      // Inject facts for found nodes
      for (const node of result.items) {
        this.injectNodeFacts(node)
      }

      return toolOk(result)
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Neighbor Query ──

  async queryNeighbors(
    nodeId: string,
    opts?: GetNeighborsOpts,
  ): Promise<ToolResult<Paginated<NeighborData>>> {
    try {
      const result = await this.graphStore.getNeighbors(nodeId, opts ?? {})
      return toolOk(result)
    } catch (error) {
      return toolErr('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', {
        retryable: true,
      })
    }
  }

  // ── Policy Validation ──

  private validateTraversalPolicy(query: GraphTraversalQuery): { ok: boolean; error?: string } {
    const depth = query.traverse?.length ?? 0
    const maxDepth = this.config.maxTraversalDepth ?? 5
    if (depth > maxDepth) {
      return { ok: false, error: `Traversal depth ${depth} exceeds limit ${maxDepth}` }
    }
    return { ok: true }
  }

  // ── Dynamic Reference Resolution ──
  // Resolves references like $workspace.candidates

  private resolveDynamicReferences(query: ComputeQuery): ComputeQuery {
    if (!query.filters) return query

    const resolvedFilters = query.filters.map((filter) => {
      if (typeof filter.value === 'string' && filter.value.startsWith('$workspace.')) {
        const path = filter.value.substring('$workspace.'.length)
        return this.resolveWorkspaceReference(filter, path)
      }
      return filter
    })

    return { ...query, filters: resolvedFilters }
  }

  private resolveWorkspaceReference(filter: ComputeFilter, path: string): ComputeFilter {
    // Handle $workspace.candidates - convert global IDs to raw IDs
    if (path === 'candidates') {
      const candidates = this.workspace.candidates
      if (candidates.length === 0) {
        return filter // No candidates to resolve
      }

      // Parse global IDs to extract raw IDs (e.g., "Merch:M001" -> "M001")
      const rawIds = candidates.map((id) => {
        const parsed = parseGlobalId(id)
        return parsed ? parsed.rawId : id
      })

      return { ...filter, value: rawIds }
    }

    // Handle other workspace references via fact store
    const factStore = this.workspace.getFacts()
    if (path.includes('.')) {
      const [entityId, property] = path.split('.')
      const factValue = factStore.getValue(entityId, property)
      if (factValue !== undefined) {
        return { ...filter, value: factValue }
      }
    }

    return filter
  }

  // ── Fact Injection ──
  // Auto-injects low-order snapshot facts into workspace.bindings
  // High-order semantic assertions are done by Agent via bind_fact tool

  private injectGraphQueryFacts(result: GraphQueryResult): void {
    const bindings: FactBinding[] = []
    const now = new Date().toISOString()

    for (const row of result.rows) {
      // Inject type as a fact
      bindings.push({
        entityId: row.nodeId,
        property: 'type',
        value: row.type,
        source: { kind: 'graph_property', ref: 'graph_query' },
        confidence: 1.0,
        validFrom: now,
        observedAt: now,
      })

      // Inject each property
      for (const [key, value] of Object.entries(row.properties)) {
        bindings.push({
          entityId: row.nodeId,
          property: key,
          value,
          source: { kind: 'graph_property', ref: 'graph_query' },
          confidence: 1.0,
          validFrom: now,
          observedAt: now,
        })
      }
    }

    this.workspace.addBindings(bindings)
  }

  private injectComputeQueryFacts(result: ComputeQueryResult): void {
    const bindings: FactBinding[] = []
    const now = new Date().toISOString()

    for (const row of result.rows) {
      // If grouped, inject group values
      if (row.group) {
        for (const [key, value] of Object.entries(row.group)) {
          bindings.push({
            entityId: `compute:${key}:${value}`,
            property: key,
            value,
            source: { kind: 'compute_result', ref: 'compute_query' },
            confidence: 1.0,
            validFrom: now,
            observedAt: now,
          })
        }
      }

      // Inject metric results
      for (const [key, value] of Object.entries(row)) {
        if (key !== 'group') {
          bindings.push({
            entityId: 'compute:result',
            property: key,
            value,
            source: { kind: 'compute_result', ref: 'compute_query' },
            confidence: 1.0,
            validFrom: now,
            observedAt: now,
          })
        }
      }
    }

    this.workspace.addBindings(bindings)
  }

  private injectVectorQueryFacts(result: VectorQueryResult): void {
    const bindings: FactBinding[] = []
    const now = new Date().toISOString()

    for (const hit of result.hits) {
      bindings.push({
        entityId: hit.entityId,
        property: 'semantic_score',
        value: hit.score,
        source: { kind: 'derived', ref: 'vector_query' },
        confidence: hit.score,
        validFrom: now,
        observedAt: now,
      })
    }

    this.workspace.addBindings(bindings)
  }

  private injectNodeFacts(node: NodeData): void {
    const bindings: FactBinding[] = []
    const now = new Date().toISOString()

    bindings.push({
      entityId: node.id,
      property: 'type',
      value: node.type,
      source: { kind: 'graph_property', ref: 'inspect_node' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    })

    for (const [key, value] of Object.entries(node.properties)) {
      bindings.push({
        entityId: node.id,
        property: key,
        value,
        source: { kind: 'graph_property', ref: 'inspect_node' },
        confidence: 1.0,
        validFrom: now,
        observedAt: now,
      })
    }

    this.workspace.addBindings(bindings)
  }
}