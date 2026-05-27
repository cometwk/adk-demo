import type { BaseNode } from '../../ontology/base-node'
import type { GetNeighborsOpts, NeighborData, NodeData, Paginated } from '../../engine'
import type { RestEntityType, RestNodeClassRegistry } from './bindings'
import type { SearchParams } from './http-client'

// ── Custom Handler ──

export type CustomHandler = (
  source: NodeData,
  opts: GetNeighborsOpts,
  ctx: AccessContext,
) => Promise<Paginated<NeighborData>>

export type BatchHandler = (
  sources: NodeData[],
  opts: GetNeighborsOpts,
  ctx: AccessContext,
) => Promise<Map<string, Paginated<NeighborData>>>

// ── RestAccessBinding ──

export type RestAccessBinding =
  | {
      kind: 'search'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      searchOn: RestEntityType
      params: (source: NodeData, ctx: AccessContext) => SearchParams
      optional?: boolean
    }
  | {
      kind: 'custom'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      handler: CustomHandler
      batchHandler?: BatchHandler
    }

export type RestAccessBindingMap = Record<string, RestAccessBinding>

// Re-export RestNodeClassRegistry for external use
export type { RestNodeClassRegistry } from './bindings'

// ── AccessContext ──

export type AccessContext = {
  typeRegistry: RestNodeClassRegistry
  rawId: (node: NodeData) => string
  toGlobalId: (type: RestEntityType, rawId: string) => string
  apiSearch: <T extends Record<string, unknown>>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>
  apiSearchSafe: <T extends Record<string, unknown>>(prefix: string, query?: SearchParams) => Promise<Paginated<T>>
  fetchOne: (type: RestEntityType, rawId: string) => Promise<NodeData | undefined>
  fetchMany: (type: RestEntityType, rawIds: string[]) => Promise<NodeData[]>
  neighborsFromNodes: (
    nodes: NodeData[],
    relation: string,
    direction: 'out' | 'in',
    opts: GetNeighborsOpts,
    pageInfo?: Paginated<NodeData>['page'],
  ) => Paginated<NeighborData>
  emptyNeighbors: (limit: number, offset: number) => Paginated<NeighborData>
}