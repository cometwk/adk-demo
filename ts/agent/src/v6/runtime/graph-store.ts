import type { PropertyFilter } from './query-types'
import type { Paginated } from './types'
import type { BaseNode } from './graph'

// ── DTOs ──

export type NodeData = {
  id: string
  type: string
  properties: Record<string, unknown>
}

export type NeighborData = {
  nodeId: string
  type: string
  relation: string
  direction: 'out' | 'in'
  properties?: Record<string, unknown>
}

export type EdgeSummary = {
  relation: string
  direction: 'out' | 'in'
  targetType: string
  count: number
}

export type FindNodesOpts = {
  type: string
  where?: PropertyFilter[]
  fields?: string[]
  limit?: number
  offset?: number
}

export type GetNeighborsOpts = {
  relation: string
  direction?: 'out' | 'in' | 'both'
  targetType?: string
  where?: PropertyFilter[]
  fields?: string[]
  limit?: number
  offset?: number
}

// ── GraphStore ──

export interface GraphStore {
  getNode(id: string): Promise<NodeData | undefined>
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>
}

// ── NodeInstanceContainer ──

export interface NodeInstanceContainer {
  getBaseNode(id: string): BaseNode | undefined
}

