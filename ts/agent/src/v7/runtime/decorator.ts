import { z } from 'zod'
import {
  MethodSchema,
  MethodSchemaConfig,
  PropertySchema,
  PropertySchemaConfig,
  RelationRegistryEntry,
  AgentMethodRegistry,
  AgentPropertyRegistry,
  AgentRelationRegistry,
  AgentTypeRegistry,
} from './registry'

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

export function agentRelation(config: RelationSchemaConfig) {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor => {
    const className = (target as { constructor: { name: string } }).constructor.name
    const entry: RelationRegistryEntry = {
      type: config.type,
      fromType: className,
      toType: config.toType,
      description: config.description,
      methodName: propertyKey,
    }
    AgentRelationRegistry.register(className, entry)
    return descriptor
  }
}

export type {
  MethodSchema,
  MethodSchemaConfig,
  PropertySchema,
  PropertySchemaConfig,
  RelationRegistryEntry,
  TypeSchemaEntry,
} from './registry'
export {
  AgentMethodRegistry,
  AgentPropertyRegistry,
  AgentRelationRegistry,
  AgentTypeRegistry,
  AgentRegistry,
} from './registry'
