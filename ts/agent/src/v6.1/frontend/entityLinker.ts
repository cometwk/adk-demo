import type { Graph } from '../runtime/graph'

// ── Entity linker (frontend) ──
//
// Maps user-supplied names / aliases to canonical entity IDs in the graph.
// Priority: exact match > alias table > substring match > recent context.

export type EntityLinkResult = {
  entityId: string
  typeName: string
  confidence: number
  matchKind: 'exact' | 'alias' | 'substring' | 'context'
}

export type EntityLinkerConfig = {
  aliases?: Record<string, string> // alias → entityId
  contextualEntityIds?: string[] // recently seen entities (highest priority for ambiguous)
}

export function createEntityLinker(graph: Graph, config: EntityLinkerConfig = {}) {
  const { aliases = {}, contextualEntityIds = [] } = config

  /**
   * Try to link a single name to an entity ID.
   * Returns null if no match found.
   */
  function link(name: string): EntityLinkResult | null {
    const lower = name.toLowerCase().trim()

    // 1. Exact match
    const exactNode = graph.getNode(name)
    if (exactNode) {
      return {
        entityId: name,
        typeName: exactNode.constructor.name,
        confidence: 1.0,
        matchKind: 'exact',
      }
    }

    // 2. Alias table
    const aliasMatch = aliases[lower] ?? aliases[name]
    if (aliasMatch) {
      const aliasNode = graph.getNode(aliasMatch)
      if (aliasNode) {
        return {
          entityId: aliasMatch,
          typeName: aliasNode.constructor.name,
          confidence: 0.95,
          matchKind: 'alias',
        }
      }
    }

    // 3. Substring match (prefer contextual entities first)
    const candidateIds = [
      ...contextualEntityIds,
      ...[...graph.nodes.keys()].filter((id) => !contextualEntityIds.includes(id)),
    ]
    for (const id of candidateIds) {
      if (id.toLowerCase().includes(lower) || lower.includes(id.toLowerCase())) {
        const node = graph.getNode(id)
        const isContextual = contextualEntityIds.includes(id)
        return {
          entityId: id,
          typeName: node?.constructor.name ?? 'Unknown',
          confidence: isContextual ? 0.85 : 0.7,
          matchKind: isContextual ? 'context' : 'substring',
        }
      }
    }

    return null
  }

  /**
   * Link multiple names; returns all results (including nulls for unlinked).
   */
  function linkAll(names: string[]): Array<EntityLinkResult | null> {
    return names.map(link)
  }

  /**
   * Find all entities of a given type (for broad queries like "all engineers").
   */
  function findByType(typeName: string): EntityLinkResult[] {
    const results: EntityLinkResult[] = []
    for (const [id, node] of graph.nodes) {
      if (node.constructor.name === typeName) {
        results.push({
          entityId: id,
          typeName,
          confidence: 1.0,
          matchKind: 'exact',
        })
      }
    }
    return results
  }

  return { link, linkAll, findByType }
}
