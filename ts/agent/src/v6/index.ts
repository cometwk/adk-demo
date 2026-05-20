import { agentMethod, agentProperty, agentRelations, agentType } from '../v6/runtime/decorator'
import { BaseNode } from '../v6/runtime/graph'
import type { NodeId } from '../v6/runtime/types'
import { registerRule, clearRules } from './ontology/rules'
import type { RelationSchema, TypeSchema } from './ontology/schema'
import { InMemoryGraphStore, type Graph } from './provider/in-memory'
import type { DecisionTask } from './ontology/decision'
import { OPEN_POLICY } from './policy/context'

import { AgentRegistry } from './runtime/registry'

// graph 模块
export {
  // 注解
  agentMethod,
  agentProperty,
  agentRelations,
  agentType,
  // Graph
  BaseNode,
  Graph,
  InMemoryGraphStore,
  // Registry
  AgentRegistry,
}
export type {
  NodeId,
  // T:
  RelationSchema,
  TypeSchema,
}

// rule 模块
export {
  //
  registerRule,
  clearRules,
}

// pipeline 模块
export type {
  //
  DecisionTask,
}
export {
  OPEN_POLICY,
}
