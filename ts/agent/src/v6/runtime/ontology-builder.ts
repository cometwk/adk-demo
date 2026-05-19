import { AgentRegistry } from './registry'
import type { Ontology, RelationSchema } from '../ontology/schema'

export type OntologyBuildOpts = {
  version: string
  /** 手动补充的边类型声明（向后兼容；通常不再需要，@agentRelations 会自动收集） */
  relations?: RelationSchema[]
}

export function buildOntology(opts: OntologyBuildOpts): Ontology {
  const autoRelations = AgentRegistry.getRelationSchemas()
  const manualRelations = opts.relations ?? []

  // Merge: auto-collected first, manual supplements second (dedup by type key)
  const seen = new Set<string>()
  const merged: RelationSchema[] = []
  for (const r of [...autoRelations, ...manualRelations]) {
    const key = `${r.fromType}:${r.type}:${r.toType}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(r)
    }
  }

  return {
    version: opts.version,
    types: AgentRegistry.getRegisteredClasses().map(
      (name) => AgentRegistry.getTypeSchema(name)!,
    ),
    relations: merged,
  }
}
