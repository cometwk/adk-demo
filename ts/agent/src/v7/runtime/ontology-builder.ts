import { AgentRegistry } from './registry'
import type { Ontology, RelationSchema } from '../ontology/schema'

export type OntologyBuildOpts = {
  version: string
  /** 边类型声明（图结构层面，无法从单个实体类推导，保留手动声明） */
  relations: RelationSchema[]
}

export function buildOntology(opts: OntologyBuildOpts): Ontology {
  return {
    version: opts.version,
    types: AgentRegistry.getRegisteredClasses().map(
      (name) => AgentRegistry.getTypeSchema(name)!,
    ),
    relations: opts.relations,
  }
}
