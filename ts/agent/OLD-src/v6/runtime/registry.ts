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
  type: string
  description: string
  agentVisible: boolean
  sensitive?: boolean
}

export type PropertySchemaConfig = {
  type: string
  description: string
  agentVisible?: boolean
  sensitive?: boolean
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

// ── Type Registry ──

export type TypeSchemaEntry = { description: string }

export class AgentTypeRegistry {
  private static types: Map<string, TypeSchemaEntry> = new Map()

  static register(className: string, entry: TypeSchemaEntry): void {
    AgentTypeRegistry.types.set(className, entry)
  }

  static get(className: string): TypeSchemaEntry | undefined {
    return AgentTypeRegistry.types.get(className)
  }

  static getRegisteredClasses(): string[] {
    return Array.from(AgentTypeRegistry.types.keys())
  }

  static clear(): void {
    AgentTypeRegistry.types.clear()
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

// ── AgentRegistry Facade ──
// 统一入口：组合 TypeRegistry + PropertyRegistry + MethodRegistry

import type { TypeSchema, TypeProperty, TypeMethod } from '../ontology/schema'

export const AgentRegistry = {
  /** 获取完整的 TypeSchema（type + properties + methods 三合一） */
  getTypeSchema(className: string): TypeSchema | undefined {
    const entry = AgentTypeRegistry.get(className)
    if (!entry) return undefined

    const properties: TypeProperty[] = AgentPropertyRegistry.getPropertiesForClass(className).map(
      (p) => ({
        name: p.propertyName,
        type: p.type,
        description: p.description,
        agentVisible: p.agentVisible,
        sensitive: p.sensitive,
      }),
    )

    const methods: TypeMethod[] = AgentMethodRegistry.getMethodsForClass(className).map((m) => ({
      name: m.methodName,
      description: m.description,
    }))

    return { name: className, description: entry.description, properties, methods }
  },

  /** 返回所有通过 @agentType 注册的类名 */
  getRegisteredClasses(): string[] {
    return AgentTypeRegistry.getRegisteredClasses()
  },

  /** 一次性清空所有三个 Registry（测试用） */
  clear(): void {
    AgentTypeRegistry.clear()
    AgentPropertyRegistry.clear()
    AgentMethodRegistry.clear()
  },
}
