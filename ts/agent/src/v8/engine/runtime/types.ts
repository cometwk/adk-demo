// ── Node / Edge ──

export type NodeId = string

export type Edge = {
  from: NodeId
  to: NodeId
  type: string
}

// ── Global ID utilities ──
// V8 uses composite IDs like "Merch:M001" where type and rawId are encoded together

export type GlobalId = {
  type: string
  rawId: string
}

export function parseGlobalId(id: string): GlobalId | null {
  const colonIndex = id.indexOf(':')
  if (colonIndex === -1) {
    return null // Not a global ID format
  }
  return {
    type: id.slice(0, colonIndex),
    rawId: id.slice(colonIndex + 1),
  }
}

export function toGlobalId(type: string, rawId: string): string {
  return `${type}:${rawId}`
}

// ── Tool result envelope ──

export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_ARGS'
  | 'EMPTY_RESULT'
  | 'UNSUPPORTED_FIELD'
  | 'INTERNAL_ERROR'
  | 'POLICY_DENIED'
  | 'TRUNCATED'
  | 'METHOD_NOT_FOUND'
  | 'PRECONDITION_FAILED'

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

// ── Fact binding (immutable snapshot) ──

export type FactSourceKind =
  | 'graph_property'
  | 'compute_result'
  | 'runtime_injection'
  | 'user_input'
  | 'derived'

export type FactSource = {
  kind: FactSourceKind
  ref?: string
}

export type FactBinding = {
  entityId: string
  property: string
  value: unknown
  source: FactSource
  confidence: number
  validFrom: string
  validUntil?: string
  observedAt: string
}

// ── Node data DTOs ──

export type NodeData = {
  id: string
  type: string
  properties: Record<string, unknown>
}

export type NeighborData = {
  nodeId: string
  type: string
  relation: string
  direction: 'out' | 'in'
  properties?: Record<string, unknown>
}

export type EdgeSummary = {
  relation: string
  direction: 'out' | 'in'
  targetType: string
  count: number
}