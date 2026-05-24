// ── Reasoning Task Types (V8) ──

import type { PipelineTask, TaskExecuteResult } from '../../core/types'

// ── Semantic Verdict ──

export type SemanticVerdict = {
  answer: string
  entities: string[]
  rationale: string
  confidence: number
}

// ── Reasoning Task ──

export type ReasoningTask = PipelineTask & {
  entryEntities?: string[]
}

// ── Reasoning Result ──

export type ReasoningResult = TaskExecuteResult & {
  verdict: SemanticVerdict | null
}

// ── Re-export verdict utilities ──

export { parseVerdict, createFallbackVerdict } from './verdict'