/** Relation type → physical storage mapping (DML layer, separate from RelationSchema) */

export type RelationBinding = JunctionBinding | ForeignKeyBinding | InverseForeignKeyBinding

/** Junction table: many-to-many or one-to-many fact table */
export type JunctionBinding = {
  kind: 'junction'
  table: string
  fromColumn: string
  toColumn: string
  /** Optional: limit edge type; use 'where' to distinguish when same table has multiple relations */
  where?: string
}

/** Foreign key on source table → one row in target table */
export type ForeignKeyBinding = {
  kind: 'fk'
  onType: string
  column: string
  toType: string
}

/** Foreign key on target table pointing to source (for inbound edge lazy query) */
export type InverseForeignKeyBinding = {
  kind: 'inverse_fk'
  onType: string
  column: string
  fromType: string
}

export type RelationBindingMap = Record<string, RelationBinding>