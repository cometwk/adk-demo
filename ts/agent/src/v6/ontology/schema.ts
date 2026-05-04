// ── Type schema (T) ──

export type TypeProperty = {
  name: string
  type: string
  description: string
  agentVisible: boolean
  sensitive?: boolean // marks PII / redactable fields
}

export type TypeMethod = {
  name: string
  description: string
}

export type TypeSchema = {
  name: string
  description: string
  properties: TypeProperty[]
  methods: TypeMethod[]
}

// ── Relation schema (R) ──
// Structural relationships between entity types (NOT causal).
// Causal relationships live in ontology/causal.ts.

export type RelationSchema = {
  type: string
  from: string
  to: string
  description: string
}

// ── Ontology ──

export type Ontology = {
  version: string // semver; included from V6 for calibration tracing
  types: TypeSchema[]
  relations: RelationSchema[]
}

export function getTypeSchema(ontology: Ontology, typeName: string): TypeSchema | undefined {
  return ontology.types.find((t) => t.name === typeName)
}

export function getRelationsFor(ontology: Ontology, typeName: string): RelationSchema[] {
  return ontology.relations.filter((r) => r.from === typeName || r.to === typeName)
}
