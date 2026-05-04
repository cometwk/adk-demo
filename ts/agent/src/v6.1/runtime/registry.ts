import type { z } from 'zod'

// ── Method Schema ──

export type MethodPrecondition = {
  param: string
  check: 'must_be_positive' | 'must_be_in_facts' | 'must_be_non_empty_string'
  description?: string
}

export type MethodSchema = {
  methodName: string
  params: z.ZodType<unknown>
  returns: string
  description: string
  requiredFacts?: string[]
  relatedRuleIds?: string[]
  preconditions?: MethodPrecondition[]
}

export type MethodSchemaConfig = {
  params?: z.ZodType<unknown>
  returns: string
  description: string
  requiredFacts?: string[]
  relatedRuleIds?: string[]
  preconditions?: MethodPrecondition[]
}

// ── Property Schema ──

export type PropertySchema = {
  propertyName: string
  returns: string
  description: string
}

export type PropertySchemaConfig = {
  returns: string
  description: string
}

// ── Method Registry ──

export class AgentMethodRegistry {
  private static methods: Map<string, MethodSchema> = new Map()

  static register(className: string, methodName: string, schema: MethodSchema): void {
    AgentMethodRegistry.methods.set(`${className}:${methodName}`, schema)
  }

  static get(className: string, methodName: string): MethodSchema | undefined {
    return AgentMethodRegistry.methods.get(`${className}:${methodName}`)
  }

  static getMethodsForClass(className: string): MethodSchema[] {
    const methods: MethodSchema[] = []
    for (const [key, schema] of AgentMethodRegistry.methods) {
      if (key.startsWith(`${className}:`)) methods.push(schema)
    }
    return methods
  }

  static has(className: string, methodName: string): boolean {
    return AgentMethodRegistry.methods.has(`${className}:${methodName}`)
  }

  static clear(): void {
    AgentMethodRegistry.methods.clear()
  }
}

// ── Property Registry ──

export class AgentPropertyRegistry {
  private static properties: Map<string, PropertySchema> = new Map()

  static register(className: string, propertyName: string, schema: PropertySchema): void {
    AgentPropertyRegistry.properties.set(`${className}:${propertyName}`, schema)
  }

  static get(className: string, propertyName: string): PropertySchema | undefined {
    return AgentPropertyRegistry.properties.get(`${className}:${propertyName}`)
  }

  static getPropertiesForClass(className: string): PropertySchema[] {
    const props: PropertySchema[] = []
    for (const [key, schema] of AgentPropertyRegistry.properties) {
      if (key.startsWith(`${className}:`)) props.push(schema)
    }
    return props
  }

  static has(className: string, propertyName: string): boolean {
    return AgentPropertyRegistry.properties.has(`${className}:${propertyName}`)
  }

  static clear(): void {
    AgentPropertyRegistry.properties.clear()
  }
}
