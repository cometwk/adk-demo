import { z } from 'zod'
import { model } from '../../lib/model'
import type { Graph } from '../runtime/graph'
import { generateStructureOutput } from '../../lib/structure_output'

// ── Entity linker (frontend) ──
//
// Two-phase pipeline:
//   Phase 1: NER — extract entity mentions from the raw userQuery
//             (rule-based patterns first; LLM fallback when rules yield nothing)
//   Phase 2: Resolution — map each mention to a canonical entity ID in the graph
//             Priority: exact match > alias table > substring match > contextual
//
// Public surface:
//   createEntityLinker()  — low-level resolution helpers (unchanged)
//   linkEntities()        — full pipeline: NER → resolution → ambiguity score

// ── Phase 1: NER — entity mention extraction ──

export type EntityMention = {
  text: string
  source: 'rule' | 'llm'
  hintType?: string // inferred entity type hint, e.g. "Book", "Reader"
}

/**
 * Rule-based extraction: looks for Chinese book-title marks 《...》,
 * quoted strings, and plain tokens that appear verbatim as graph node IDs.
 */
export function extractMentionsByRules(query: string, knownIds: string[] = []): EntityMention[] {
  const mentions: EntityMention[] = []
  const seen = new Set<string>()

  function add(text: string, source: EntityMention['source'], hintType?: string) {
    const key = text.toLowerCase()
    if (!seen.has(key) && text.trim().length > 0) {
      seen.add(key)
      mentions.push({ text: text.trim(), source, hintType })
    }
  }

  // 1. 书名号 《...》 → most likely Book-type entity
  for (const m of query.matchAll(/《([^》]+)》/g)) {
    add(m[1], 'rule', 'Book')
  }

  // 2. Full-width / ASCII quoted strings "..." '...'
  for (const m of query.matchAll(/["""]([^"""]{1,40})["""]/g)) {
    add(m[1], 'rule')
  }

  // 3. Exact match against known node IDs (fast path, avoids LLM)
  for (const id of knownIds) {
    if (query.toLowerCase().includes(id.toLowerCase())) {
      add(id, 'rule')
    }
  }

  return mentions
}

// LLM NER schema
const NerSchema = z.object({
  mentions: z.array(
    z.object({
      text: z.string().describe('实体在原文中出现的文字'),
      hintType: z.string().optional().describe('推测的实体类型（如 Book、Reader、Library）'),
    })
  ),
})

/**
 * LLM-based NER fallback — used only when rule extraction yields nothing.
 */
export async function extractMentionsByLLM(query: string, typeNames: string[]): Promise<EntityMention[]> {
  const object = await generateStructureOutput({
    // model,
    schema: NerSchema,
    prompt: `从用户问题中提取所有具体实体提及（命名实体识别）。

可能的实体类型: ${typeNames.join(', ')}

用户问题: "${query}"

只返回实体名称（人名、书名、机构名等具体对象），不要包含动词、形容词或描述性短语。`,
  })
  return object?.mentions.map((m) => ({ ...m, source: 'llm' as const })) ?? []
}

// ── Phase 2 types ──

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

// ── Full pipeline: NER → resolution → ambiguity ──

export type LinkEntitiesResult = {
  bestPick: string[] // resolved entity IDs, ordered by confidence
  ambiguity: number // 0..1; >0.5 triggers clarification
  details: Array<{
    mention: EntityMention
    candidates: EntityLinkResult[]
    picked: EntityLinkResult | null
  }>
}

function dedupByEntityId(results: EntityLinkResult[]): EntityLinkResult[] {
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.entityId)) return false
    seen.add(r.entityId)
    return true
  })
}

/**
 * Full entity-linking pipeline:
 *   1. Extract mentions from userQuery (rule-based → LLM fallback)
 *   2. Resolve each mention to candidate entity IDs in the graph
 *   3. Compute ambiguity score for optional clarification
 *
 * @param userQuery  Raw natural-language query from the user
 * @param graph      The runtime entity graph
 * @param config     Linker config + optional typeNames for LLM NER
 */
export async function linkEntities(
  userQuery: string,
  graph: Graph,
  config: EntityLinkerConfig & { typeNames?: string[] } = {}
): Promise<LinkEntitiesResult> {
  const knownIds = [...graph.nodes.keys()]

  // Phase 1: NER
  // let mentions = extractMentionsByRules(userQuery, knownIds)
  // if (mentions.length === 0 && config.typeNames?.length) {
  //   mentions = await extractMentionsByLLM(userQuery, config.typeNames)
  // }
  let mentions = await extractMentionsByLLM(userQuery, config.typeNames!)

  if (mentions.length === 0) {
    return { bestPick: [], ambiguity: 0, details: [] }
  }

  // Phase 2: Resolution
  const linker = createEntityLinker(graph, config)
  const details = mentions.map((mention) => {
    const directResult = linker.link(mention.text)

    // When we have a type hint, also search by type and filter by name similarity
    const byType: EntityLinkResult[] = mention.hintType
      ? linker.findByType(mention.hintType).filter((r) => {
          const idL = r.entityId.toLowerCase()
          const textL = mention.text.toLowerCase()
          return idL.includes(textL) || textL.includes(idL)
        })
      : []

    const combined = directResult ? [directResult, ...byType] : byType
    const candidates = dedupByEntityId(combined)

    return {
      mention,
      candidates,
      picked: candidates[0] ?? null,
    }
  })

  // Phase 3: Ambiguity score
  // multiCandidate → 1 point; unlinked → 2 points; normalise to [0,1]
  const multiCandidateCount = details.filter((d) => d.candidates.length > 1).length
  const unlinkedCount = details.filter((d) => d.picked === null).length
  const ambiguity = Math.min(1, (multiCandidateCount + unlinkedCount * 2) / (mentions.length * 2))

  return {
    bestPick: details.map((d) => d.picked?.entityId).filter((id): id is string => id !== undefined),
    ambiguity,
    details,
  }
}
