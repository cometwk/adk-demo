import type { z } from 'zod'
import type { TypeSchema, TypeProperty, TypeMethod, RelationSchema } from './schema'

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
  sensitive: boolean
}

export type PropertySchemaConfig = {
  type: string
  description: string
  agentVisible?: boolean // V8: default true
  sensitive?: boolean
}

// ── Type Registry Entry ──

export type TypeSchemaEntry = { description: string }

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
    Array.from(AgentMethodRegistry.methods.entries()).forEach(([key, schema]) => {
      if (key.startsWith(`${className}:`)) methods.push(schema)
    })
    return methods
  }

  static has(className: string, methodName: string): boolean {
    return AgentMethodRegistry.methods.has(`${className}:${methodName}`)
  }

  static clear(): void {
    AgentMethodRegistry.methods.clear()
  }

  static all(): MethodSchema[] {
    return Array.from(AgentMethodRegistry.methods.values())
  }
}

// ── Type Registry ──

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

  static all(): TypeSchemaEntry[] {
    return Array.from(AgentTypeRegistry.types.values())
  }
}

// ── BaseNode Properties (inherited by all entity types) ──

const BASE_NODE_PROPERTIES: PropertySchema[] = [
  {
    propertyName: 'id',
    type: 'string',
    description: 'Node ID',
    agentVisible: true,
    sensitive: false,
  },
]

// ── Property Registry ──

export class AgentPropertyRegistry {
  private static properties: Map<string, PropertySchema> = new Map()

  static register(className: string, propertyName: string, schema: PropertySchema): void {
    AgentPropertyRegistry.properties.set(`${className}:${propertyName}`, schema)
  }

  static get(className: string, propertyName: string): PropertySchema | undefined {
    return AgentPropertyRegistry.properties.get(`${className}:${propertyName}`)
  }

  /** Get properties for a class, including BaseNode's id property */
  static getPropertiesForClass(className: string): PropertySchema[] {
    const props: PropertySchema[] = [...BASE_NODE_PROPERTIES]
    Array.from(AgentPropertyRegistry.properties.entries()).forEach(([key, schema]) => {
      if (key.startsWith(`${className}:`)) props.push(schema)
    })
    return props
  }

  static has(className: string, propertyName: string): boolean {
    return AgentPropertyRegistry.properties.has(`${className}:${propertyName}`)
  }

  static clear(): void {
    AgentPropertyRegistry.properties.clear()
  }

  static all(): PropertySchema[] {
    return Array.from(AgentPropertyRegistry.properties.values())
  }
}

// ── Relation Registry ──

export type RelationRegistryEntry = {
  type: string
  fromType: string
  toType: string
  description: string
}

export class AgentRelationRegistry {
  private static relations: Map<string, RelationRegistryEntry[]> = new Map()

  static register(className: string, entry: RelationRegistryEntry): void {
    const list = AgentRelationRegistry.relations.get(className) ?? []
    list.push(entry)
    AgentRelationRegistry.relations.set(className, list)
  }

  static getRelationsForClass(className: string): RelationRegistryEntry[] {
    return AgentRelationRegistry.relations.get(className) ?? []
  }

  /** Reverse lookup: find all relation entries whose toType matches */
  static getRelationsForToType(toType: string): RelationRegistryEntry[] {
    const result: RelationRegistryEntry[] = []
    Array.from(AgentRelationRegistry.relations.values()).forEach((entries) => {
      entries.forEach((entry) => {
        if (entry.toType === toType) result.push(entry)
      })
    })
    return result
  }

  /** Get all registered RelationSchemas */
  static getRelationSchemas(): RelationSchema[] {
    const result: RelationSchema[] = []
    Array.from(AgentRelationRegistry.relations.values()).forEach((entries) => {
      entries.forEach((entry) => {
        result.push({
          type: entry.type,
          fromType: entry.fromType,
          toType: entry.toType,
          description: entry.description,
        })
      })
    })
    return result
  }

  static clear(): void {
    AgentRelationRegistry.relations.clear()
  }

  static all(): RelationRegistryEntry[][] {
    return Array.from(AgentRelationRegistry.relations.values())
  }
}

// ── AgentRegistry Facade ──
// Unified entry point combining TypeRegistry + PropertyRegistry + MethodRegistry + RelationRegistry

export const AgentRegistry = {
  /** Get complete TypeSchema (type + properties + methods) */
  getTypeSchema(className: string): TypeSchema | undefined {
    const entry = AgentTypeRegistry.get(className)
    if (!entry) return undefined

    const properties: TypeProperty[] = AgentPropertyRegistry.getPropertiesForClass(className).map((p) => ({
      name: p.propertyName,
      type: p.type,
      description: p.description,
      agentVisible: p.agentVisible,
      sensitive: p.sensitive,
    }))

    const methods: TypeMethod[] = AgentMethodRegistry.getMethodsForClass(className).map((m) => ({
      name: m.methodName,
      description: m.description,
    }))

    return { name: className, description: entry.description, properties, methods }
  },

  /** Get all registered class names via @agentType */
  getRegisteredClasses(): string[] {
    return AgentTypeRegistry.getRegisteredClasses()
  },

  /** Get all RelationSchemas registered via @agentRelations */
  getRelationSchemas(): RelationSchema[] {
    return AgentRelationRegistry.getRelationSchemas()
  },

  /** Clear all registries (for testing) */
  clear(): void {
    AgentTypeRegistry.clear()
    AgentPropertyRegistry.clear()
    AgentMethodRegistry.clear()
    AgentRelationRegistry.clear()
  },

  all(): {
    types: TypeSchemaEntry[]
    properties: PropertySchema[]
    methods: MethodSchema[]
    relations: RelationRegistryEntry[][]
  } {
    return {
      types: AgentTypeRegistry.all(),
      properties: AgentPropertyRegistry.all(),
      methods: AgentMethodRegistry.all(),
      relations: AgentRelationRegistry.all(),
    }
  },
}