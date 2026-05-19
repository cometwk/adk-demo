import { z } from 'zod'
import type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig, RelationRegistryEntry } from './registry'
import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, AgentTypeRegistry } from './registry'

export type TypeSchemaConfig = { description: string }

export function agentType(config: TypeSchemaConfig) {
  return (target: { name: string }): void => {
    AgentTypeRegistry.register(target.name, { description: config.description })
  }
}

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

export function agentProperty(config: PropertySchemaConfig) {
  return (target: object, propertyKey: string): void => {
    const className = (target as { constructor: { name: string } }).constructor.name
    const schema: PropertySchema = {
      propertyName: propertyKey,
      type: config.type,
      description: config.description,
      agentVisible: config.agentVisible ?? false,
      sensitive: config.sensitive ?? false,
    }
    AgentPropertyRegistry.register(className, propertyKey, schema)
  }
}

export type RelationSchemaConfig = {
  type: string
  toType: string
  description: string
}

/** 类级关系 Schema 声明（DDL），替代已移除的方法级 @agentRelation */
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

export type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig, RelationRegistryEntry, TypeSchemaEntry } from './registry'
export { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, AgentTypeRegistry, AgentRegistry } from './registry'
