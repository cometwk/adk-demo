// ── Clarification (V8) ──
// P2: Advanced clarification generation

import type { ClarificationQuestion } from '../types'

/**
 * Generate clarification questions from ambiguity context.
 * P2 stub - currently returns basic questions.
 */
export function generateClarificationQuestions(
  context: {
    ambiguousEntities?: string[]
    missingEntities?: string[]
  },
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = []

  for (const entity of context.ambiguousEntities ?? []) {
    questions.push({
      id: `clarify-${entity}`,
      question: `请确认 "${entity}" 的具体指向`,
    })
  }

  for (const entity of context.missingEntities ?? []) {
    questions.push({
      id: `specify-${entity}`,
      question: `请指定 "${entity}" 的实体ID`,
    })
  }

  return questions
}