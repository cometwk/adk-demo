// ── V8 Rule Module ──
// 规则模块：提供规则注册、评估、评分、判决生成

// ── Types ──

export type {
  Rule,
  RuleKind,
  RuleDirection,
  RuleFilter,
  RuleMetadata,
  RuleEvaluationInput,
  RuleEvaluationOutput,
  VerdictInput,
  VetoConfig,
  RequiredFact,
} from './types/rule'

export { INTENT_KEYWORDS } from './types/rule'

export type {
  RuleContext,
  RuleResult,
  MissingFact,
} from './types/context'

export type {
  Candidate,
  ScoredCandidate,
  SystemVerdict,
} from './types/verdict'

export type {
  EvaluatedRule,
  CandidateScoringInput,
  DirectionMapping,
} from './types/scoring'

export { DEFAULT_DIRECTION_MAPPING } from './types/scoring'

export type {
  ReconcileInput,
  ReconcileResult,
} from './types/reconcile'

// ── Registry ──

export type { RuleRegistry } from './registry/registry'
export { InMemoryRuleRegistry, toMetadata } from './registry/registry'

// ── Runtime ──

export type { RuleRuntimeConfig } from './runtime/config'
export { DEFAULT_RULE_RUNTIME_CONFIG, createRuleRuntimeConfig } from './runtime/config'

export type { MCDAScorer } from './runtime/scoring'
export { DefaultMCDAScorer } from './runtime/scoring'

export type { Reconciler } from './runtime/reconciler'
export { DefaultReconciler } from './runtime/reconciler'

export type { RuleRuntime } from './runtime/rule-runtime'
export { InMemoryRuleRuntime } from './runtime/rule-runtime'

// ── Tools ──

export { createRuleTools } from './tools/rule-tools'

// ── Factory ──

import { InMemoryRuleRegistry } from './registry/registry'
import { InMemoryRuleRuntime } from './runtime/rule-runtime'
import { DefaultMCDAScorer } from './runtime/scoring'
import { DefaultReconciler } from './runtime/reconciler'
import { DEFAULT_RULE_RUNTIME_CONFIG, type RuleRuntimeConfig } from './runtime/config'

/**
 * 创建预配置的 InMemoryRuleRuntime
 */
export function createRuleRuntime(
  registry: InMemoryRuleRegistry,
  config?: RuleRuntimeConfig,
): InMemoryRuleRuntime {
  const effectiveConfig = config ?? DEFAULT_RULE_RUNTIME_CONFIG
  const scorer = new DefaultMCDAScorer(effectiveConfig)
  const reconciler = new DefaultReconciler()
  return new InMemoryRuleRuntime(registry, scorer, reconciler, effectiveConfig)
}