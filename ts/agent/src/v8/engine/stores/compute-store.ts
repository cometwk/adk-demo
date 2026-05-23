import type { ComputeQuery, ComputeQueryResult } from '../query/compute-query'

// ── ComputeStore Interface ──
// Handles OLAP-style column aggregation: sum/avg/count/min/max
// Does NOT handle graph traversal (that's GraphStore)

export interface ComputeStore {
  // Aggregate query
  aggregate(query: ComputeQuery): Promise<ComputeQueryResult>

  // Data source metadata
  getSources(): Promise<ComputeSource[]>
  getSourceSchema(source: string): Promise<SourceSchema>
}

// ── Data source metadata ──

export type ComputeSource = {
  name: string
  description?: string
  rowCount?: number
}

export type SourceSchema = {
  fields: FieldSchema[]
}

export type FieldSchema = {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean'
  aggregatable: boolean
}