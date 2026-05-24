// ── Pipeline Core Types ──
// V8 Pipeline 模块的核心类型定义

import type { Tool, LanguageModel } from 'ai'
import type { Ontology, RelationSchema, TypeSchema } from '../../ontology/schema'
import type { Workspace } from '../../engine/runtime/workspace'
import type { PolicyContext } from '../../policy/context'
import type { RuntimeOrchestrator, SemanticRuntimeOrchestrator } from '../../engine/runtime/orchestrator'
import type { RuleRegistry } from '../../rule/registry/registry'
import type { RuleMetadata } from '../../rule/types/rule'
import type { FactBinding } from '../../engine/runtime/types'
import type { SystemVerdict, ScoredCandidate } from '../../rule/types/verdict'

// ── Task Type ──

export type TaskType = string // 'diagnostic' | 'predictive' | 'reasoning' | custom

// ── Clarification ──

export type ClarificationQuestion = {
  id: string
  question: string
  options?: string[]
}

export type ClarificationRequest = {
  questions: ClarificationQuestion[]
  originalQuery: string
}

// ── Pipeline Task ──

export type PipelineTask = {
  type: TaskType
  goal: string
  entryEntities?: string[]
  intent?: string
  context?: Record<string, unknown>
}

// ── Pipeline Result ──

export type Reconciliation = {
  agreed: boolean
  modelRecommendation: string
  systemRecommendation: string
  discrepancies: string[]
  rationale: string
}

export type PipelineResult = {
  taskType: TaskType
  facts: FactBinding[]
  modelVerdict: unknown
  systemVerdict?: unknown
  reconciliation?: Reconciliation
  rawText: string
}

// ── TaskPlugin Interface ──

export interface TaskPlugin {
  /** Task type identifier */
  type: TaskType

  /** Build system prompt for this task */
  buildPrompt(params: PromptParams): string

  /** Build tool set for this task */
  buildTools(params: ToolParams): Record<string, Tool>

  /** Execute agent reasoning */
  execute(params: ExecuteParams): Promise<TaskExecuteResult>

  /** Deterministic critique (optional) */
  critique?(params: CritiqueParams): Promise<CritiqueResult>
}

// ── Plugin Parameter Types ──

export type PromptParams = {
  task: PipelineTask
  ontology: Ontology
  rules?: RuleMetadata[]
  customContext?: string
}

export type ToolParams = {
  runtime: SemanticRuntimeOrchestrator
  workspace: Workspace
  policy: PolicyContext
}

export type ExecuteParams = {
  task: PipelineTask
  systemPrompt: string
  tools: Record<string, Tool>
  model: LanguageModel
}

export type CritiqueParams = {
  task: PipelineTask
  facts: FactBinding[]
  modelVerdict: unknown
  runtime: RuntimeOrchestrator
  ruleRegistry: RuleRegistry
  ontology: Ontology
}

// ── Execute / Critique Results ──

export type TaskExecuteResult = {
  facts: FactBinding[]
  modelVerdict: unknown
  rawText: string
}

export type CritiqueResult = {
  systemVerdict: unknown
  reconciliation?: Reconciliation
}

// ── Pipeline Dependencies ──

export type PipelineDeps = {
  // Engine layer
  graphStore: import('../../engine/stores/graph-store').GraphStore
  computeStore: import('../../engine/stores/compute-store').ComputeStore
  vectorStore: import('../../engine/stores/vector-store').VectorStore
  config?: import('../../engine/runtime/config').RuntimeConfig

  // Ontology layer
  ontology: Ontology

  // Rule layer
  ruleRegistry: RuleRegistry

  // LLM model (optional, defaults to lib/model)
  model?: LanguageModel

  // Frontend (optional, defaults to DefaultFrontend)
  frontend?: Frontend

  // Task plugins (optional, register at construction)
  plugins?: TaskPlugin[]
}

// ── Frontend Interface ──

export type FrontendResult =
  | { status: 'ready'; task: PipelineTask }
  | { status: 'clarify'; questions: ClarificationQuestion[] }

export interface Frontend {
  /** Process user query: intent classification + entity linking + clarification */
  process(query: string): Promise<FrontendResult>
}

// ── Entity Linking ──

export type EntityLinkResult = {
  entities: string[]
  ambiguityScore: number // 0-1, >0.5 triggers clarification
}

// ── Intent Classification ──

export type IntentRule = {
  type: TaskType
  keywords: string[]
  confidence: number
}

export type IntentClassifyResult = {
  type: TaskType
  confidence: number
  source: 'rule' | 'llm'
}

// ── Error Types ──

export class TaskTypeNotFoundError extends Error {
  readonly type = 'task_type_not_found'
  readonly taskType: string

  constructor(taskType: string) {
    super(`Task type '${taskType}' not found in registry`)
    this.name = 'TaskTypeNotFoundError'
    this.taskType = taskType
  }
}

export class PromptBuildError extends Error {
  readonly type = 'prompt_build_error'
  readonly taskType: string
  readonly cause: Error

  constructor(taskType: string, cause: Error) {
    super(`Failed to build prompt for task '${taskType}': ${cause.message}`)
    this.name = 'PromptBuildError'
    this.taskType = taskType
    this.cause = cause
  }
}

export class ExecuteError extends Error {
  readonly type = 'execute_error'
  readonly taskType: string
  readonly cause: Error

  constructor(taskType: string, cause: Error) {
    super(`Failed to execute task '${taskType}': ${cause.message}`)
    this.name = 'ExecuteError'
    this.taskType = taskType
    this.cause = cause
  }
}

// ── Re-export existing types for convenience ──

export type { FactBinding, Ontology, Workspace, PolicyContext, RuntimeOrchestrator, RuleRegistry, RuleMetadata }