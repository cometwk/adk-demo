import type { PropertyFilter } from '../query/graph-query'
import type { Paginated, NodeData, NeighborData, EdgeSummary } from '../runtime/types'
import type { GraphTraversalQuery, GraphQueryResult } from '../query/graph-query'
import type { ToolResult } from '../runtime/types'
import type { PolicyContext } from '../../policy/context'

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

export interface GraphStore {
  // Single node access
  getNode(id: string): Promise<NodeData | undefined>

  // Node search
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>

  // Neighbor access
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>

  // Edge summary
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // Traversal query (V8: traversal-only, no aggregate)
  // policy is optional - defaults to OPEN_POLICY if not provided
  query(query: GraphTraversalQuery, policy?: PolicyContext): Promise<ToolResult<GraphQueryResult>>
}