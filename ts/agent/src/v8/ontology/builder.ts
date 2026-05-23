import { AgentRegistry } from './registry'
import type { Ontology, RelationSchema } from './schema'
import { validateOntology } from './validate-bindings'

export type OntologyBuildOpts = {
  version: string
  /** Manual relation declarations (backward compatible; usually not needed, @agentRelations auto-collects) */
  relations?: RelationSchema[]
}

export function buildOntology(opts: OntologyBuildOpts): Ontology {
  // Auto-collect from @agentRelations decorators
  const autoRelations = AgentRegistry.getRelationSchemas()
  const manualRelations = opts.relations ?? []

  // Merge: auto-collected first, manual supplements second (dedup by fromType:type:toType key)
  const seen = new Set<string>()
  const merged: RelationSchema[] = []
  for (const r of [...autoRelations, ...manualRelations]) {
    const key = `${r.fromType}:${r.type}:${r.toType}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(r)
    }
  }

  const ontology: Ontology = {
    version: opts.version,
    types: AgentRegistry.getRegisteredClasses().map(
      (name) => AgentRegistry.getTypeSchema(name)!,
    ),
    relations: merged,
  }

  // Cross-reference validation: ensure all fromType/toType exist in types
  validateOntology(ontology)

  return ontology
}