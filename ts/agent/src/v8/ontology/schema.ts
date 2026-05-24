// ── Type schema (T) ──

export type TypeProperty = {
  name: string
  type: string
  description: string
  agentVisible?: boolean
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

export type RelationSchema = {
  type: string
  fromType: string // source entity TYPE name (e.g. 'Reader')
  toType: string // target entity TYPE name (e.g. 'Book')
  description: string
}

// ── Ontology ──

export type Ontology = {
  version: string // semver for calibration tracing
  types: TypeSchema[]
  relations: RelationSchema[]
}

/** Find TypeSchema by name */
export function getTypeSchema(ontology: Ontology, typeName: string): TypeSchema | undefined {
  return ontology.types.find((t) => t.name === typeName)
}

/** Find all RelationSchema related to a type (as fromType or toType) */
export function getRelationsFor(ontology: Ontology, typeName: string): RelationSchema[] {
  return ontology.relations.filter((r) => r.fromType === typeName || r.toType === typeName)
}

/** Find RelationSchema by relation type name */
export function getRelationByType(ontology: Ontology, relationType: string): RelationSchema | undefined {
  return ontology.relations.find((r) => r.type === relationType)
}