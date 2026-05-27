import type { PropertyFilter } from '../query/graph-query'
import type { Paginated, NodeData, NeighborData, EdgeSummary } from '../runtime/types'
import type { GraphTraversalQuery, GraphQueryResult } from '../query/graph-query'
import type { ToolResult } from '../runtime/types'
import type { PolicyContext } from '../../policy/context'
import { NodeInstanceContainer } from '../../ontology'

// ── Session-scoped graph read context ──

export type GraphQueryContext = {
  /** Session 内 nodeData 缓存，仅 graph_query / query_neighbors 使用 */
  nodeDataCache?: Map<string, NodeData>
}

// ── Query options ──

export type FindNodesOpts = {
  type?: string
  where?: PropertyFilter[]
  fields?: string[]
  limit?: number
  offset?: number
}

export type GetNeighborsOpts = {
  relation?: string
  direction?: 'out' | 'in' | 'both'
  targetType?: string
  where?: PropertyFilter[]
  fields?: string[]
  limit?: number
  offset?: number
}

// ── GraphStore Interface (V8) ──
// Simplified: no BaseNode/getBaseNode, pure data DTO approach
// Added: query() for GraphTraversalQuery execution

export interface GraphStore extends NodeInstanceContainer {
  // Single node access
  getNode(id: string): Promise<NodeData | undefined>

  // Node search
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>

  // Neighbor access
  getNeighbors(nodeId: string, opts: GetNeighborsOpts, ctx?: GraphQueryContext): Promise<Paginated<NeighborData>>

  // Batch neighbor access (TRAVERSE 优化)
  getNeighborsBatch(
    nodeIds: string[],
    opts: GetNeighborsOpts,
    ctx?: GraphQueryContext
  ): Promise<Map<string, Paginated<NeighborData>>>

  // Edge summary
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // Traversal query (V8: traversal-only, no aggregate)
  // policy is optional - defaults to OPEN_POLICY if not provided
  query(
    query: GraphTraversalQuery,
    policy?: PolicyContext,
    ctx?: GraphQueryContext
  ): Promise<ToolResult<GraphQueryResult>>
}