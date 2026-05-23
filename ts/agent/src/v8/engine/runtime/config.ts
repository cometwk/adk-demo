// ── Runtime Configuration ──
//
// Controls execution behavior, safety limits, and retry strategies
// for SemanticRuntimeOrchestrator.
//
// All configs have sensible defaults but can be overridden for
// specific use cases (e.g., deeper traversals in complex reasoning,
// tighter timeouts in production environments).

/**
 * Runtime execution configuration.
 *
 * @property maxTraversalDepth - Maximum depth for graph traversal queries
 * @property maxWorkingSet - Maximum nodes/rows to process in a single query
 * @property queryTimeoutMs - Timeout for individual query execution
 * @property maxRetries - Retry attempts for transient failures
 * @property retryDelayMs - Delay between retry attempts
 */
export type RuntimeConfig = {
  /**
   * Maximum depth for graph traversal queries.
   *
   * Controls how many TRAVERSE steps are allowed in a single graph_query.
   * Prevents runaway traversals that could consume excessive resources.
   *
   * Example: depth=5 allows 5-hop traversals like:
   *   Agent → Merch → Order → Channel → Region → Partner
   *
   * Safety rationale: Deep traversals can exponentially expand working sets,
   * leading to memory pressure and slow response times.
   *
   * Default: 5 (covers most business relationship chains)
   * Recommended range: 3-7
   */
  maxTraversalDepth: number

  /**
   * Maximum nodes/rows to process in a single query.
   *
   * Caps the working set size to prevent memory exhaustion.
   * Applies to:
   * - GraphQueryEngine: limits nodes in workingSets
   * - ComputeStore: limits rows before aggregation
   *
   * When exceeded, results are truncated with `truncated: true` flag.
   * Agent should handle truncation by refining query filters.
   *
   * Default: 500 (balances completeness vs performance)
   * Recommended range: 100-1000
   */
  maxWorkingSet: number

  /**
   * Timeout for individual query execution (milliseconds).
   *
   * Prevents long-running queries from blocking the reasoning cycle.
   * When exceeded, query returns INTERNAL_ERROR with retryable=true.
   *
   * Note: This is per-query timeout, not total agent timeout.
   * Total timeout is controlled by stepCountIs() in executor.
   *
   * Default: 30000ms (30 seconds)
   * Recommended range: 5000-60000
   */
  queryTimeoutMs: number

  /**
   * Retry attempts for transient failures.
   *
   * Number of retries for retryable errors:
   * - Timeout errors
   * - Connection failures
   * - Rate limiting (429)
   *
   * Does NOT retry for:
   * - Policy violations (POLICY_DENIED)
   * - Invalid queries (INVALID_ARGS)
   * - Not found (NOT_FOUND)
   *
   * Default: 2
   * Recommended range: 0-3
   */
  maxRetries: number

  /**
   * Delay between retry attempts (milliseconds).
   *
   * Implements exponential backoff: delay * 2^attempt
   * - Attempt 1: delayMs
   * - Attempt 2: delayMs * 2
   * - Attempt 3: delayMs * 4
   *
   * Default: 100ms
   * Recommended range: 50-500
   */
  retryDelayMs: number
}

/**
 * Default runtime configuration.
 *
 * Sensible defaults for typical reasoning scenarios:
 * - 5-hop traversals (covers most relationship chains)
 * - 500-node working sets (balances completeness vs memory)
 * - 30-second timeout (reasonable for complex queries)
 * - 2 retries with 100ms base delay
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxTraversalDepth: 5,
  maxWorkingSet: 500,
  queryTimeoutMs: 30000,
  maxRetries: 2,
  retryDelayMs: 100,
}

/**
 * Create a custom runtime config with overrides.
 *
 * @param overrides - Partial config to override defaults
 * @returns Complete RuntimeConfig
 *
 * @example
 * ```typescript
 * const config = createRuntimeConfig({
 *   maxTraversalDepth: 7,  // Allow deeper traversals
 *   queryTimeoutMs: 60000, // Longer timeout for complex queries
 * })
 * ```
 */
export function createRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return { ...DEFAULT_RUNTIME_CONFIG, ...overrides }
}