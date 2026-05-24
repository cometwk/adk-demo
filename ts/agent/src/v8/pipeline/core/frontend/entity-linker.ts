// ── Entity Linker (V8) ──
// Extract and link entity mentions from user query

import type { GraphStore } from '../../../engine/stores/graph-store'
import type { Ontology } from '../../../ontology/schema'
import type { EntityLinkResult } from '../types'

// ── Entity Mention ──

export type EntityMention = {
  text: string
  source: 'rule' | 'llm'
  hintType?: string
}

// ── Link Result Detail ──

export type LinkDetail = {
  mention: EntityMention
  entityId: string | null
  typeName: string | null
  confidence: number
  matchKind: 'exact' | 'id_pattern' | 'fuzzy' | 'none'
}

// ── Full Pipeline Result ──

export type LinkEntitiesResult = {
  entities: string[]
  ambiguityScore: number // 0-1, >0.5 triggers clarification
  details: LinkDetail[]
}

// ── Rule-based extraction ──

/**
 * Extract entity mentions from query via rules.
 * Looks for:
 *   1. Global ID pattern (Type:Id) like "Merch:M001"
 *   2. Chinese book-title marks 《...》
 *   3. Quoted strings
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

  // 1. Global ID pattern (Type:Id)
  for (const m of query.matchAll(/\b([A-Z][a-zA-Z]+):([A-Z0-9]+)\b/g)) {
    add(m[0], 'rule', m[1]) // hintType is the type prefix
  }

  // 2. 书名号 《...》
  for (const m of query.matchAll(/《([^》]+)》/g)) {
    add(m[1], 'rule', 'Book')
  }

  // 3. Quoted strings
  for (const m of query.matchAll(/["""]([^"""]{1,40})["""]/g)) {
    add(m[1], 'rule')
  }

  // 4. Known IDs substring match
  for (const id of knownIds) {
    if (query.toLowerCase().includes(id.toLowerCase())) {
      add(id, 'rule')
    }
  }

  return mentions
}

// ── Link entities ──

/**
 * Link entity mentions to graph entity IDs.
 *
 * @param query - User query
 * @param graphStore - GraphStore for entity lookup
 * @param ontology - Ontology for type matching
 * @returns EntityLinkResult with entity IDs and ambiguity score
 */
export async function linkEntities(
  query: string,
  graphStore: GraphStore,
  ontology: Ontology,
): Promise<LinkEntitiesResult> {
  // Get all known node IDs for matching
  const allNodes = await graphStore.findNodes({ limit: 1000 })
  const knownIds = allNodes.items.map((n) => n.id)
  const typeNames = ontology.types.map((t) => t.name)

  // Phase 1: Extract mentions
  const mentions = extractMentionsByRules(query, knownIds)

  if (mentions.length === 0) {
    return {
      entities: [],
      ambiguityScore: 0,
      details: [],
    }
  }

  // Phase 2: Resolve each mention
  const details: LinkDetail[] = []

  for (const mention of mentions) {
    const result = await resolveMention(mention, graphStore, knownIds)
    details.push(result)
  }

  // Phase 3: Compute ambiguity score
  // multi-candidate → +1 point; unlinked → +2 points; normalize to [0,1]
  const multiCandidateCount = details.filter((d) => d.matchKind === 'fuzzy').length
  const unlinkedCount = details.filter((d) => d.entityId === null).length
  const ambiguityScore = Math.min(1, (multiCandidateCount * 0.5 + unlinkedCount * 2) / (mentions.length * 2))

  return {
    entities: details
      .filter((d) => d.entityId !== null)
      .map((d) => d.entityId as string),
    ambiguityScore,
    details,
  }
}

// ── Resolve single mention ──

async function resolveMention(
  mention: EntityMention,
  graphStore: GraphStore,
  knownIds: string[],
): Promise<LinkDetail> {
  const text = mention.text.trim()

  // 1. Exact ID match (Type:Id pattern)
  if (mention.hintType && text.includes(':')) {
    const node = await graphStore.getNode(text)
    if (node) {
      return {
        mention,
        entityId: text,
        typeName: node.type,
        confidence: 1.0,
        matchKind: 'exact',
      }
    }
  }

  // 2. Exact match by ID
  const exactNode = await graphStore.getNode(text)
  if (exactNode) {
    return {
      mention,
      entityId: text,
      typeName: exactNode.type,
      confidence: 1.0,
      matchKind: 'exact',
    }
  }

  // 3. Fuzzy match: search by name/type
  const searchResult = await graphStore.findNodes({
    type: mention.hintType,
    limit: 10,
  })

  // Match by substring similarity
  const candidates = searchResult.items.filter((n) => {
    const nodeName = (n.properties?.name as string | undefined) ?? ''
    const nodeText = n.id.toLowerCase() + ' ' + nodeName.toLowerCase()
    return nodeText.includes(text.toLowerCase()) || text.toLowerCase().includes(n.id.toLowerCase())
  })

  if (candidates.length === 1) {
    return {
      mention,
      entityId: candidates[0].id,
      typeName: candidates[0].type,
      confidence: 0.8,
      matchKind: 'fuzzy',
    }
  }

  if (candidates.length > 1) {
    // Multiple candidates → high ambiguity
    return {
      mention,
      entityId: candidates[0].id, // Pick first as default
      typeName: candidates[0].type,
      confidence: 0.5,
      matchKind: 'fuzzy',
    }
  }

  // No match
  return {
    mention,
    entityId: null,
    typeName: null,
    confidence: 0,
    matchKind: 'none',
  }
}