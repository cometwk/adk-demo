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

// ── GraphStore ──
// 单一异步接口，包含数据方法 + 实例方法

export interface GraphStore {
  // 数据方法（返回 DTO）
  getNode(id: string): Promise<NodeData | undefined>
  findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>>
  getNeighbors(nodeId: string, opts: GetNeighborsOpts): Promise<Paginated<NeighborData>>
  getEdgeSummary(nodeId: string): Promise<EdgeSummary[]>

  // 实例方法（返回 BaseNode）
  getBaseNode(id: string): Promise<BaseNode | undefined>
}

// ── NodeInstanceContainer ──
// 向后兼容别名（已合并入 GraphStore）
export type NodeInstanceContainer = GraphStore

