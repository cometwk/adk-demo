// ── Node / Edge ──

export type NodeId = string

export type Edge = {
  from: NodeId
  to: NodeId
  type: string
}

// ── Tool result envelope (same contract as V5) ──

export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_ARGS'
  | 'EMPTY_RESULT'
  | 'UNSUPPORTED_FIELD'
  | 'INTERNAL_ERROR'
  | 'METHOD_NOT_FOUND'
  | 'MISSING_FACT'
  | 'PRECONDITION_FAILED'
  | 'POLICY_DENIED'
  | 'WORKSPACE_MISSING'

export type ToolResultSuccess<T = unknown> = {
  ok: true
  data: T
  meta?: Record<string, unknown>
}

export type ToolResultError = {
  ok: false
  code: ErrorCode
  message: string
  retryable: boolean
  expected?: Record<string, unknown>
}

/**
统一可辨识联合（Discriminated Result）

- 模型可以稳定区分成功、空结果、权限拒绝、参数错误
- 测试可以断言契约
- 未来可加入缓存、多 Agent 和远程图
*/
export type ToolResult<T = unknown> = ToolResultSuccess<T> | ToolResultError

export function toolOk<T>(data: T, meta?: Record<string, unknown>): ToolResultSuccess<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data }
}

export function toolErr(
  code: ErrorCode,
  message: string,
  opts?: { retryable?: boolean; expected?: Record<string, unknown> }
): ToolResultError {
  return {
    ok: false,
    code,
    message,
    retryable: opts?.retryable ?? false,
    ...(opts?.expected ? { expected: opts.expected } : {}),
  }
}

// ── Pagination ──

export type PageInfo = {
  offset: number
  limit: number
  hasMore: boolean
  total?: number
}

export type Paginated<T> = {
  items: T[]
  page: PageInfo
}

// ── Fact binding (V6 core — time-aware from the start) ──
//
// Every piece of information the system knows about an entity property
// is wrapped in a FactBinding.  This replaces V5's flat Record<string, any>
// and fixes the "workload_alice" namespace collision.

export type FactSourceKind =
  | 'graph_property' // read from the graph node at query time
  | 'method_result' // returned by a call_method execution
  | 'aggregation' // derived from aggregate_facts
  | 'user_input' // supplied by the user / frontend
  | 'derived' // computed from other bindings via an inference_rule

export type FactSource = {
  kind: FactSourceKind
  ref?: string // evidenceId / nodeId / methodCallId that produced it
}

export type FactBinding = {
  entityId: string // 实体命名空间
  property: string // 属性名称
  value: unknown
  source: FactSource // 来源（关键！）
  confidence: number // 0..1 置信度

  // Time dimension (V6.5) — included from day one to avoid refactoring.
  // For pure predictive (snapshot) usage set both to Date.now() ISO string.
  validFrom: string // ISO 8601; when this value started being true
  validUntil?: string // ISO 8601; when it stopped (undefined = still valid)
  observedAt: string // ISO 8601; when the system recorded this binding
}
