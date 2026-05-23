import type { RelationSchema, Ontology } from './schema'
import type { RelationBindingMap } from './relation-binding'

/** Validate RelationSchema and RelationBindingMap consistency */
export function validateRelationBindings(
  relations: RelationSchema[],
  bindings: RelationBindingMap,
): void {
  // Check each RelationSchema.type has a corresponding binding
  const missing: string[] = []
  for (const rel of relations) {
    if (!bindings[rel.type]) {
      missing.push(rel.type)
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `RelationBindingMap missing bindings for: [${missing.join(', ')}]. ` +
        `Declared types: [${relations.map((r) => r.type).join(', ')}]`,
    )
  }

  // Check for orphan bindings (bindings without RelationSchema)
  const declared = new Set(relations.map((r) => r.type))
  const orphan = Object.keys(bindings).filter((k) => !declared.has(k))
  if (orphan.length > 0) {
    throw new Error(
      `RelationBindingMap has bindings without RelationSchema: [${orphan.join(', ')}]`,
    )
  }
}

/** Validate Ontology internal consistency (cross-reference check) */
export function validateOntology(ontology: Ontology): void {
  const registeredTypes = new Set(ontology.types.map((t) => t.name))

  const invalidFromTypes: string[] = []
  const invalidToTypes: string[] = []

  for (const rel of ontology.relations) {
    if (!registeredTypes.has(rel.fromType)) {
      invalidFromTypes.push(`${rel.type}: fromType='${rel.fromType}'`)
    }
    if (!registeredTypes.has(rel.toType)) {
      invalidToTypes.push(`${rel.type}: toType='${rel.toType}'`)
    }
  }

  if (invalidFromTypes.length > 0 || invalidToTypes.length > 0) {
    const messages: string[] = []
    if (invalidFromTypes.length > 0) {
      messages.push(`Invalid fromType in relations: [${invalidFromTypes.join(', ')}]`)
    }
    if (invalidToTypes.length > 0) {
      messages.push(`Invalid toType in relations: [${invalidToTypes.join(', ')}]`)
    }
    throw new Error(
      `Ontology validation failed: ${messages.join('; ')}. ` +
        `Registered types: [${Array.from(registeredTypes).join(', ')}]`,
    )
  }
}