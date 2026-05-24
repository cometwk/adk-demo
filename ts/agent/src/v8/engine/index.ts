// ── V8 Engine Module Index ──
// Exports all V8 Semantic Reasoning Runtime components

// Runtime
export { SemanticRuntimeOrchestrator, type RuntimeOrchestrator } from './runtime/orchestrator'
export { Workspace } from './runtime/workspace'
export { FactStore } from './stores/fact-store'
export { DEFAULT_RUNTIME_CONFIG, createRuntimeConfig, type RuntimeConfig } from './runtime/config'
export {
  toolOk,
  toolErr,
  parseGlobalId,
  toGlobalId,
  type ToolResult,
  type FactBinding,
  type NodeData,
  type NeighborData,
  type EdgeSummary,
  type Paginated,
} from './runtime/types'

// Stores (interfaces)
export { type GraphStore, type FindNodesOpts, type GetNeighborsOpts } from './stores/graph-store'
export { type ComputeStore, type ComputeSource, type SourceSchema, type FieldSchema } from './stores/compute-store'
export { type VectorStore } from './stores/vector-store'

// Store implementations
export { InMemoryGraphStore } from '../provider/in-memory/in-memory-graph'
export { InMemoryComputeStore } from '../provider/in-memory/in-memory-compute'
export { InMemoryVectorStore } from '../provider/in-memory/in-memory-vector'

// Query DSLs
export {
  GraphTraversalQuerySchema,
  type GraphTraversalQuery,
  type MatchClause,
  type TraverseStep,
  type ReturnClause,
  type GraphQueryResult,
  type QueryRow,
} from './query/graph-query'
export {
  ComputeQuerySchema,
  type ComputeQuery,
  type ComputeFilter,
  type AggregateMetric,
  type ComputeQueryResult,
  type ComputeRow,
} from './query/compute-query'
export {
  VectorQuerySchema,
  type VectorQuery,
  type VectorEntity,
  type VectorQueryResult,
  type VectorHit,
} from './query/vector-query'
export { matchesFilters, projectFields } from './query/filters'
export type { PropertyFilter } from './query/graph-query'

// Tools
export { createGraphTools } from './tools/graph-tools'
export { createComputeTools } from './tools/compute-tools'
export { createVectorTools } from './tools/vector-tools'
export { createFactTools } from './tools/fact-tools'
export { createCandidateTools } from './tools/candidate-tools'

// // Agent 注意：本模块的 agent 只用于内部测试而已
// export { runSemanticReasoningAgent, type ReasoningTask, type AgentResult, type SemanticVerdict } from './agent/executor'
// export { buildSemanticReasoningPrompt, type AgentContext } from './agent/prompt'
// export { parseVerdict, createFallbackVerdict } from './agent/verdict'

// Policy
export { OPEN_POLICY, type PolicyContext, type Principal, type ScopePolicy, type RedactionPolicy, type AuditPolicy } from '../policy/context'
export { checkEntityAccess, checkTypeAccess, redactProperties } from '../policy/filters'