// ── Rule Runtime 配置 ──

/**
 * RuleRuntime 执行配置。
 */
export type RuleRuntimeConfig = {
  /** 单次评估的最大规则数量 */
  maxRulesPerEvaluation: number

  /** 是否启用 Reconciler */
  enableReconciler: boolean

  /** 是否启用 Direction Mapping */
  enableDirectionMapping: boolean

  /** 是否启用 Veto */
  enableVeto: boolean

  /** 缺失事实的置信度惩罚系数 */
  missingFactPenalty: number

  /** 是否包含规则追踪信息 */
  includeRuleTrace: boolean
}

/**
 * 默认 Rule Runtime 配置。
 */
export const DEFAULT_RULE_RUNTIME_CONFIG: RuleRuntimeConfig = {
  maxRulesPerEvaluation: 100,
  enableReconciler: true,
  enableDirectionMapping: true,
  enableVeto: true,
  missingFactPenalty: 0.8,
  includeRuleTrace: true,
}

/**
 * 创建自定义 Rule Runtime 配置。
 */
export function createRuleRuntimeConfig(
  overrides: Partial<RuleRuntimeConfig> = {},
): RuleRuntimeConfig {
  return { ...DEFAULT_RULE_RUNTIME_CONFIG, ...overrides }
}