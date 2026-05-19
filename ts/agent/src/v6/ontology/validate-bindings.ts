import type { RelationSchema } from './schema'
import type { RelationBindingMap } from './relation-binding'

/** Sql 模式启动时校验：每个 RelationSchema.type 均有 binding */
export function validateRelationBindings(
  relations: RelationSchema[],
  bindings: RelationBindingMap,
): void {
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

  const declared = new Set(relations.map((r) => r.type))
  const orphan = Object.keys(bindings).filter((k) => !declared.has(k))
  if (orphan.length > 0) {
    throw new Error(
      `RelationBindingMap has bindings without RelationSchema: [${orphan.join(', ')}]`,
    )
  }
}
