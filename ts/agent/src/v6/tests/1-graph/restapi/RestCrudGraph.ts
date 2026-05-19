// import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, type MethodSchema, type RelationRegistryEntry } from './registry'
// import { matchesFilters, projectFields } from '../../../runtime/graph-filters'
// import type {
//   EdgeSummary,
//   FindNodesOpts,
//   GetNeighborsOpts,
//   GraphStore,
//   NeighborData,
//   NodeData,
// } from '../../../runtime/graph-store'
// import type { Edge, NodeId, PageInfo, Paginated } from '../../../runtime/types'
// import type { RelationSchema } from '../../../ontology/schema'
// import { BaseNode } from '../../../runtime/graph'

// const DEFAULT_PAGE_LIMIT = 20

// // ── InMemoryGraphStore ──

// export class RestCrudGraphStore implements GraphStore {
//   // nodes = new Map<string, BaseNode>()
//   // edges: Edge[] = []

//   private readonly relationIndex: Map<string, RelationSchema>

//   constructor(opts: { relations?: RelationSchema[] } = {}) {
//     this.relationIndex = new Map((opts.relations ?? []).map((r) => [r.type, r]))
//   }

//   // ── GraphStore ──

//   async getNode(id: string): Promise<NodeData | undefined> {
//     const res = await axios.get(`/admin/graph/node/${id}`)
//     return res.data
//   }

//   async findNodes(opts: FindNodesOpts): Promise<Paginated<NodeData>> {
//     const { type, where, fields, limit = DEFAULT_PAGE_LIMIT, offset = 0 } = opts
//     const all: NodeData[] = []

//     for (const [, node] of this.nodes) {
//       if (node.constructor.name !== type) continue
//       const props = node.getProperties()
//       if (where && where.length > 0 && !matchesFilters(props, where)) continue
//       all.push(nodeToData(node, fields))
//     }

//     return paginate(all, offset, limit)
//   }

//   async getNeighbors(nodeId: string, opts: GetNeighborsOpts = {}): Promise<Paginated<NeighborData>> {
//     const {
//       relation,
//       direction = 'both',
//       targetType,
//       where,
//       fields,
//       limit = DEFAULT_PAGE_LIMIT,
//       offset = 0,
//     } = opts

//     const all: NeighborData[] = []
//     const seen = new Set<string>()

//     const pushNeighbor = (
//       targetId: string,
//       typeName: string,
//       rel: string,
//       dir: 'out' | 'in',
//     ) => {
//       if (targetType && typeName !== targetType) return
//       const key = `${dir}:${rel}:${targetId}`
//       if (seen.has(key)) return

//       const target = this.getBaseNode(targetId)
//       if (!target) return

//       const props = target.getProperties()
//       if (where && where.length > 0 && !matchesFilters(props, where)) return

//       seen.add(key)
//       const entry: NeighborData = {
//         nodeId: targetId,
//         type: typeName,
//         relation: rel,
//         direction: dir,
//       }
//       if (fields && fields.length > 0) {
//         entry.properties = projectFields(props, fields)
//       }
//       all.push(entry)
//     }

//     if (direction === 'out' || direction === 'both') {
//       for (const e of this.edges) {
//         if (e.from === nodeId && (!relation || e.type === relation)) {
//           const target = this.nodes.get(e.to)
//           pushNeighbor(e.to, target?.constructor.name ?? 'Unknown', e.type, 'out')
//         }
//       }
//     }

//     if (direction === 'in' || direction === 'both') {
//       for (const e of this.edges) {
//         if (e.to === nodeId && (!relation || e.type === relation)) {
//           const source = this.nodes.get(e.from)
//           pushNeighbor(e.from, source?.constructor.name ?? 'Unknown', e.type, 'in')
//         }
//       }
//     }

//     return paginate(all, offset, limit)
//   }

//   async getEdgeSummary(nodeId: string): Promise<EdgeSummary[]> {
//     const counts = new Map<string, EdgeSummary>()

//     const bump = (rel: string, dir: 'out' | 'in', targetType: string) => {
//       const key = `${dir}:${rel}:${targetType}`
//       const existing = counts.get(key)
//       if (existing) {
//         existing.count += 1
//       } else {
//         counts.set(key, { relation: rel, direction: dir, targetType, count: 1 })
//       }
//     }

//     for (const e of this.edges) {
//       if (e.from === nodeId) {
//         const targetType = this.nodes.get(e.to)?.constructor.name ?? 'Unknown'
//         bump(e.type, 'out', targetType)
//       }
//       if (e.to === nodeId) {
//         const sourceType = this.nodes.get(e.from)?.constructor.name ?? 'Unknown'
//         bump(e.type, 'in', sourceType)
//       }
//     }

//     return Array.from(counts.values())
//   }
// }

// /** 向后兼容别名 */
// export type Graph = InMemoryGraphStore

// // 保留旧类型导出
// export type NeighborEntry = NeighborData

// export type QueryNeighborsOpts = GetNeighborsOpts
// export type SearchNodesOpts = FindNodesOpts
