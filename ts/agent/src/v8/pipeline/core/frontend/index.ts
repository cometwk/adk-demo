// ── Frontend (V8) ──
// Intent classification + Entity linking + Clarification

import type { GraphStore } from '../../../engine/stores/graph-store'
import type { Ontology } from '../../../ontology/schema'
import type { Frontend, FrontendResult, ClarificationQuestion, PipelineTask } from '../types'
import { classifyIntent } from './intent'
import { linkEntities } from './entity-linker'

// ── DefaultFrontend ──

/**
 * Default Frontend implementation.
 * Receives GraphStore + Ontology via constructor.
 */
export class DefaultFrontend implements Frontend {
  constructor(
    private graphStore: GraphStore,
    private ontology: Ontology,
  ) {}

  /**
   * Process user query: intent classification → entity linking → clarification check.
   */
  async process(query: string): Promise<FrontendResult> {
    // 1. Intent classification
    const intentResult = await classifyIntent(query)

    // 2. Entity linking
    const linkResult = await linkEntities(query, this.graphStore, this.ontology)

    // 3. Ambiguity check
    if (linkResult.ambiguityScore > 0.5) {
      // Generate clarification questions
      const questions = this.generateClarificationQuestions(linkResult)
      return {
        status: 'clarify',
        questions,
      }
    }

    // 4. Ready to execute
    const task: PipelineTask = {
      type: intentResult.type,
      goal: query,
      entryEntities: linkResult.entities,
    }

    return {
      status: 'ready',
      task,
    }
  }

  /**
   * Generate clarification questions from entity link result.
   */
  private generateClarificationQuestions(
    linkResult: import('./entity-linker').LinkEntitiesResult,
  ): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = []

    for (const detail of linkResult.details) {
      if (detail.matchKind === 'fuzzy' && detail.entityId) {
        // Ask user to confirm the entity
        questions.push({
          id: `entity-${detail.mention.text}`,
          question: `您指的是 "${detail.entityId}" 吗？`,
          options: ['是', '否，是其他实体'],
        })
      }

      if (detail.matchKind === 'none') {
        // Ask user to specify the entity
        questions.push({
          id: `entity-${detail.mention.text}`,
          question: `请明确指定 "${detail.mention.text}" 指向的具体实体ID`,
        })
      }
    }

    return questions
  }
}

// ── Factory function ──

export function createFrontend(graphStore: GraphStore, ontology: Ontology): Frontend {
  return new DefaultFrontend(graphStore, ontology)
}