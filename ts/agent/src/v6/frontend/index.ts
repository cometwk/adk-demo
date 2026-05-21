import { randomUUID } from 'crypto'
import { classifyIntent } from './intent'
import { linkEntities } from './entityLinker'
import {
  buildIntentClarification,
  buildEntityClarification,
  type ClarifyQuestion,
} from './clarify'
import type { DecisionTask } from '../ontology/decision'
import type { GraphStore } from '../runtime/graph-store'
import type { Ontology } from '../ontology/schema'
import type { PolicyContext } from '../policy/context'
import { OPEN_POLICY } from '../policy/context'

// ── frontEnd context ──

export type FrontEndContext = {
  /** Entity IDs seen recently (highest priority for ambiguous resolution). */
  contextualEntityIds?: string[]
  /** Caller-supplied alias table: Chinese name → entity ID. */
  aliases?: Record<string, string>
  policyCtx?: PolicyContext
}

// ── Return type ──

export type FrontEndResult =
  | { kind: 'task'; task: DecisionTask }
  | { kind: 'clarify'; questions: ClarifyQuestion[] }

/**
 * Front-end pipeline (§7.1 of think_v6.md):
 *   classifyIntent → linkEntities → clarify (if needed) → DecisionTask
 *
 * Returns either a ready-to-run DecisionTask or a structured clarification
 * request when intent confidence or entity ambiguity is too high.
 *
 * @param userQuery  Raw natural-language input from the user
 * @param graph      Runtime entity graph
 * @param ontology   Domain ontology (used for type hints during NER)
 * @param ctx        Optional context: recent entities, alias table, policy
 */
export async function frontEnd(
  userQuery: string,
  graph: GraphStore,
  ontology: Ontology,
  ctx: FrontEndContext = {},
): Promise<FrontEndResult> {
  const typeNames = ontology.types.map((t) => t.name)

  // ── Step 1: Intent classification ──
  const intent = await classifyIntent(userQuery)
  console.log('step1: 意图判断结果=', intent)


  // ── Step 2: Entity linking ──
  const entities = await linkEntities(userQuery, graph, {
    aliases: ctx.aliases,
    contextualEntityIds: ctx.contextualEntityIds,
    typeNames,
  })
  console.log('step2: 实体链接结果=', JSON.stringify(entities))

  // ── Step 3: Clarify when confidence is low or ambiguity is high ──
  if (intent.confidence < 0.6 || entities.ambiguity > 0.5) {
    const questions: ClarifyQuestion[] = []

    if (intent.confidence < 0.6) {
      questions.push(buildIntentClarification(intent.intent))
    }

    for (const d of entities.details) {
      if (d.candidates.length > 1) {
        questions.push(buildEntityClarification(d.mention.text, d.candidates))
      }
    }

    // Fallback: at least ask about intent if we have nothing else to ask
    if (questions.length === 0) {
      questions.push(buildIntentClarification(intent.intent))
    }

    return { kind: 'clarify', questions }
  }

  // ── Step 4: Build DecisionTask ──
  return {
    kind: 'task',
    task: {
      taskId: randomUUID(),
      mode: intent.mode,
      intent: intent.intent,
      goal: userQuery,
      entryEntities: entities.bestPick,
      scope: { typesOfInterest: typeNames },
      policyCtx: ctx.policyCtx ?? OPEN_POLICY,
    },
  }
}
