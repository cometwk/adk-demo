import type { GetNeighborsOpts, NeighborData, NodeData } from '../../runtime/graph-store'
import type { Paginated } from '../../runtime/types'

// ── Types ──

export type RestEntityType = string

export type CustomHandler = (
  source: NodeData,
  opts: GetNeighborsOpts,
  ctx: AccessContext,
) => Promise<Paginated<NeighborData>>

export type RestAccessBinding =
  | {
      kind: 'search'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      searchOn: RestEntityType
      params: (source: NodeData, ctx: AccessContext) => import('./axios').SearchParams
      optional?: boolean
    }
  | {
      kind: 'custom'
      relation: string
      fromType: RestEntityType
      toType: RestEntityType
      direction: 'out' | 'in'
      handler: CustomHandler
    }

export type RestAccessBindingMap = Record<string, RestAccessBinding>

export type AccessContext = {
  rawId: (node: NodeData) => string
  toGlobalId: (type: RestEntityType, rawId: string | number) => string
  apiSearch: <T extends Record<string, unknown>>(prefix: string, query?: import('./axios').SearchParams) => Promise<Paginated<T>>
  apiSearchSafe: <T extends Record<string, unknown>>(prefix: string, query?: import('./axios').SearchParams) => Promise<Paginated<T>>
  fetchOne: (type: RestEntityType, rawId: string) => Promise<NodeData | undefined>
  neighborsFromNodes: (
    nodes: NodeData[],
    relation: string,
    direction: 'out' | 'in',
    opts: GetNeighborsOpts,
    pageInfo?: Paginated<NodeData>['page'],
  ) => Paginated<NeighborData>
  emptyNeighbors: (limit: number, offset: number) => Paginated<NeighborData>
}