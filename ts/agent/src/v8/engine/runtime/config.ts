// ── Runtime 配置 ──
//
// 控制 SemanticRuntimeOrchestrator 的执行行为、安全限制和重试策略。
//
// 所有配置都有合理的默认值，但可根据具体场景覆盖
// （例如：复杂推理需要更深的遍历，生产环境需要更短的超时）。

/**
 * Runtime 执行配置。
 *
 * @property maxTraversalDepth - 图遍历查询的最大深度
 * @property maxWorkingSet - 单次查询处理的最大节点/行数
 * @property queryTimeoutMs - 单次查询执行的超时时间
 * @property maxRetries - 瞬态失败的重试次数
 * @property retryDelayMs - 重试间隔时间
 */
export type RuntimeConfig = {
  /**
   * 图遍历查询的最大深度。
   *
   * 控制 graph_query 中允许的 TRAVERSE 步数上限。
   * 防止失控的遍历消耗过多资源。
   *
   * 示例：depth=5 允许 5 跳遍历：
   *   Agent → Merch → Order → Channel → Region → Partner
   *
   * 安全理由：深度遍历会指数级扩展工作集，
   * 导致内存压力和响应缓慢。
   *
   * 默认值：5（覆盖大多数业务关系链）
   * 推荐范围：3-7
   */
  maxTraversalDepth: number

  /**
   * 单次查询处理的最大节点/行数。
   *
   * 限制工作集大小，防止内存耗尽。
   * 适用于：
   * - GraphQueryEngine：限制 workingSets 中的节点数
   * - ComputeStore：限制聚合前的行数
   *
   * 超过时结果会被截断，标记 truncated: true。
   * Agent 应通过细化查询过滤条件来处理截断。
   *
   * 默认值：500（平衡完整性与性能）
   * 推荐范围：100-1000
   */
  maxWorkingSet: number

  /**
   * 单次查询执行的超时时间（毫秒）。
   *
   * 防止长时间查询阻塞推理周期。
   * 超时后查询返回 INTERNAL_ERROR，retryable=true。
   *
   * 注意：这是单次查询超时，不是 Agent 总超时。
   * Agent 总超时由 executor 中的 stepCountIs() 控制。
   *
   * 默认值：30000ms（30 秒）
   * 推荐范围：5000-60000
   */
  queryTimeoutMs: number

  /**
   * 瞬态失败的重试次数。
   *
   * 可重试的错误类型：
   * - 超时错误
   * - 连接失败
   * - 速率限制（429）
   *
   * 不可重试的错误：
   * - 策略违规（POLICY_DENIED）
   * - 无效查询（INVALID_ARGS）
   * - 未找到（NOT_FOUND）
   *
   * 默认值：2
   * 推荐范围：0-3
   */
  maxRetries: number

  /**
   * 重试间隔时间（毫秒）。
   *
   * 实现指数退避：delay * 2^attempt
   * - 第 1 次：delayMs
   * - 第 2 次：delayMs * 2
   * - 第 3 次：delayMs * 4
   *
   * 默认值：100ms
   * 推荐范围：50-500
   */
  retryDelayMs: number
}

/**
 * 默认 Runtime 配置。
 *
 * 适用于典型推理场景的合理默认值：
 * - 5 跳遍历（覆盖大多数关系链）
 * - 500 节点工作集（平衡完整性与内存）
 * - 30 秒超时（复杂查询的合理等待时间）
 * - 2 次重试，100ms 基础间隔
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxTraversalDepth: 5,
  maxWorkingSet: 500,
  queryTimeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 100,
}

/**
 * 创建自定义 Runtime 配置。
 *
 * @param overrides - 要覆盖默认值的配置项
 * @returns 完整的 RuntimeConfig
 *
 * @example
 * ```typescript
 * const config = createRuntimeConfig({
 *   maxTraversalDepth: 7,   // 允许更深的遍历
 *   queryTimeoutMs: 60000,  // 更长的超时时间
 * })
 * ```
 */
export function createRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return { ...DEFAULT_RUNTIME_CONFIG, ...overrides }
}