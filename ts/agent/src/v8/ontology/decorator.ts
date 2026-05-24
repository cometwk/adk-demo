import { z } from 'zod'
import type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig, RelationRegistryEntry } from './registry'
import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, AgentTypeRegistry } from './registry'

// ── Type Schema Config ──

export type TypeSchemaConfig = {
  name?: string // explicit entity type name (optional, prevents minification issues)
  description: string
}

// ── @agentType ──

export function agentType(config: TypeSchemaConfig) {
  return (target: { name: string; prototype: object }): void => {
    const typeName = config.name ?? target.name
    // Write agentTypeName to prototype for stable runtime reflection
    ;(target.prototype as { agentTypeName?: string }).agentTypeName = typeName
    AgentTypeRegistry.register(typeName, { description: config.description })
  }
}

// ── @agentMethod ──

export function agentMethod(config: MethodSchemaConfig) {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor => {
    const className = (target as { constructor: { name: string } }).constructor.name
    const schema: MethodSchema = {
      methodName: propertyKey,
      params: config.params ?? z.object({}),
      returns: config.returns,
      description: config.description,
      requiredFacts: config.requiredFacts,
      relatedRuleIds: config.relatedRuleIds,
      preconditions: config.preconditions,
    }
    AgentMethodRegistry.register(className, propertyKey, schema)
    return descriptor
  }
}

// ── @agentProperty ──

export function agentProperty(config: PropertySchemaConfig) {
  return (target: object, propertyKey: string): void => {
    const className = (target as { constructor: { name: string } }).constructor.name
    const schema: PropertySchema = {
      propertyName: propertyKey,
      type: config.type,
      description: config.description,
      agentVisible: config.agentVisible ?? true, // V8: default true
      sensitive: config.sensitive ?? false,
    }
    AgentPropertyRegistry.register(className, propertyKey, schema)
  }
}

// ── @agentRelations ──

export type RelationSchemaConfig = {
  type: string
  toType: string
  description: string
}

/** Class-level relation Schema declaration (DDL) */
export function agentRelations(relations: RelationSchemaConfig[]) {
  return (target: { name: string }): void => {
    const className = target.name
    for (const config of relations) {
      const entry: RelationRegistryEntry = {
        type: config.type,
        fromType: className,
        toType: config.toType,
        description: config.description,
      }
      AgentRelationRegistry.register(className, entry)
    }
  }
}

// Re-export types and registries
export type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig, RelationRegistryEntry, TypeSchemaEntry } from './registry'
export { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, AgentTypeRegistry, AgentRegistry } from './registry'