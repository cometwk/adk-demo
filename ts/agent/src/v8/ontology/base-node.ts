import type { NodeId } from '../engine/runtime/types'
import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, type MethodSchema, type RelationRegistryEntry } from './registry'

// ── NodeInstanceContainer Interface ──
// Bridge between Layer 3 (Behavior) and Layer 2 (GraphStore)
// Async interface for future SQL/REST remote recovery scenarios

export interface NodeInstanceContainer {
  /** Get BaseNode instance by ID (async for remote recovery) */
  getBaseNode(id: string): Promise<BaseNode | undefined>
}

// ── BaseNode Abstract Class ──
// Layer 3 (Behavior) carrier - holds node ID, carries @agentMethod business methods
// Reflects property, capability, relation schemas via Registry
// V8: Removed WeakMap/GraphStore awareness - uses NodeInstanceContainer interface

export abstract class BaseNode {
  id: NodeId

  constructor(id: NodeId) {
    this.id = id
  }

  /** Get current instance's method capabilities (reflects from AgentMethodRegistry) */
  getCapabilities(): MethodSchema[] {
    const className = (this as unknown as { agentTypeName?: string }).agentTypeName ?? this.constructor.name
    return AgentMethodRegistry.getMethodsForClass(className)
  }

  /** Get current instance's property values (reflects from AgentPropertyRegistry + instance values) */
  getProperties(): Record<string, unknown> {
    const className = (this as unknown as { agentTypeName?: string }).agentTypeName ?? this.constructor.name
    const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className)
    const result: Record<string, unknown> = {}
    for (const schema of propSchemas) {
      result[schema.propertyName] = (this as Record<string, unknown>)[schema.propertyName]
    }
    return result
  }

  /** Get current instance's relation schemas (reflects from AgentRelationRegistry) */
  getRelationSchemas(): RelationRegistryEntry[] {
    const className = (this as unknown as { agentTypeName?: string }).agentTypeName ?? this.constructor.name
    return AgentRelationRegistry.getRelationsForClass(className)
  }
}