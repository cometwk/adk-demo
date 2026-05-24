import type { BaseNode } from '../../ontology/base-node'
import type { GetNeighborsOpts, NeighborData, NodeData, Paginated } from '../../engine'

// ── Types ──

export type RestEntityType = string

export type RestNodeClassRegistry = Record<RestEntityType, {
  class?: new (id: string) => BaseNode
  prefix: string
}>