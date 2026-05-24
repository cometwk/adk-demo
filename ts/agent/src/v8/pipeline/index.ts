// ── V8 Pipeline Module ──
// Top-level orchestrator coordinating Engine + Ontology + Rule
// Exports all public APIs for pipeline usage

// ── Core Types ──

export type {
  TaskType,
  PipelineTask,
  PipelineResult,
  ClarificationQuestion,
  ClarificationRequest,
  TaskPlugin,
  PromptParams,
  ToolParams,
  ExecuteParams,
  CritiqueParams,
  TaskExecuteResult,
  CritiqueResult,
  PipelineDeps,
  Frontend,
  FrontendResult,
  EntityLinkResult,
  IntentRule,
  IntentClassifyResult,
  Reconciliation,
  FactBinding,
  RuleMetadata,
} from './core/types'

export { TaskTypeNotFoundError, PromptBuildError, ExecuteError } from './core/types'

// ── Registry ──

export { TaskRegistry, InMemoryTaskRegistry, createTaskRegistry } from './core/registry'

// ── Context ──

export { PipelineContext, newPipelineContext } from './core/context'

// ── Frontend ──

export { DefaultFrontend } from './core/frontend/index'
export { classifyIntent, V8_INTENT_RULES } from './core/frontend/intent'
export { extractMentionsByRules } from './core/frontend/entity-linker'

// ── Task Plugins ──

// Reasoning
export {
  reasoningPlugin,
  buildReasoningPrompt,
  createReasoningTools,
  executeReasoning,
  executeReasoningWithWorkspace,
} from './tasks/reasoning/index'
export { type ReasoningTask, type SemanticVerdict, parseVerdict } from './tasks/reasoning/types'

// Predictive
export {
  predictivePlugin,
  buildPredictivePrompt,
  createPredictiveTools,
  executePredictive,
  executePredictiveWithWorkspace,
  critiquePredictive,
  getCounterfactualOffers,
  resetCounterfactuals,
} from './tasks/predictive/index'
export {
  type CandidateAnswer,
  type ScoredCandidate,
  type ModelVerdict_Predictive,
  type SystemVerdict_Predictive,
  type Evidence,
  type Uncertainty,
  type PredictionConfig,
  type CounterfactualOffer,
  parsePredictiveVerdict,
} from './tasks/predictive/types'

// Diagnostic
export {
  diagnosticPlugin,
  buildDiagnosticPrompt,
  createDiagnosticTools,
  executeDiagnostic,
  executeDiagnosticWithWorkspace,
  critiqueDiagnostic,
} from './tasks/diagnostic/index'
export {
  type DiagnosticVerdict,
  type CandidateCause,
  type AttributionResult,
  type OutcomeEvent,
  type CausalPathRef,
  type DiagnosticTaskContext,
  parseDiagnosticVerdict,
} from './tasks/diagnostic/types'

// ── Convenience Re-exports ──

// All built-in plugins
import { reasoningPlugin } from './tasks/reasoning/index'
import { predictivePlugin } from './tasks/predictive/index'
import { diagnosticPlugin } from './tasks/diagnostic/index'

export const builtinPlugins = {
  reasoning: reasoningPlugin,
  predictive: predictivePlugin,
  diagnostic: diagnosticPlugin,
}
