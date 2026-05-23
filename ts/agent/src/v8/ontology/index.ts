// ── Schema types & helpers ──
export type { TypeProperty, TypeMethod, TypeSchema, RelationSchema, Ontology } from './schema'
export { getTypeSchema, getRelationsFor, getRelationByType } from './schema'

// ── Relation binding types ──
export type { RelationBinding, JunctionBinding, ForeignKeyBinding, InverseForeignKeyBinding, RelationBindingMap } from './relation-binding'

// ── Validation ──
export { validateRelationBindings, validateOntology } from './validate-bindings'

// ── Registry ──
export type { TypeSchemaEntry, PropertySchema, PropertySchemaConfig, MethodSchema, MethodSchemaConfig, MethodPrecondition, RelationRegistryEntry } from './registry'
export { AgentTypeRegistry, AgentPropertyRegistry, AgentMethodRegistry, AgentRelationRegistry, AgentRegistry } from './registry'

// ── Decorators ──
export type { TypeSchemaConfig, RelationSchemaConfig } from './decorator'
export { agentType, agentProperty, agentMethod, agentRelations } from './decorator'

// ── Ontology builder ──
export type { OntologyBuildOpts } from './builder'
export { buildOntology } from './builder'

// ── BaseNode ──
export { BaseNode } from './base-node'
export type { NodeInstanceContainer } from './base-node'
export type { NodeId } from '../engine/runtime/types'

// ── Prompt builder ──
export { buildOntologyPrompt } from './prompt'

// ── Tools ──
export { createOntologyTools } from './tools'
export { createMethodTools } from './method-tools'