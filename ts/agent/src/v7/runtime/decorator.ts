import { z } from 'zod'
import type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig } from './registry'
import { AgentMethodRegistry, AgentPropertyRegistry, AgentTypeRegistry } from './registry'

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

export type { MethodSchema, MethodSchemaConfig, PropertySchema, PropertySchemaConfig, TypeSchemaEntry } from './registry'
export { AgentMethodRegistry, AgentPropertyRegistry, AgentTypeRegistry, AgentRegistry } from './registry'
