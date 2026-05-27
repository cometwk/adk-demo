import type { ComputeStore, ComputeSource, SourceSchema } from '../../engine/stores/compute-store'
import type { ComputeQuery, ComputeQueryResult, ComputeRow, AggregateMetric } from '../../engine/query/compute-query'
import type { Ontology } from '../../ontology/schema'
import type { RestNodeClassRegistry } from './bindings'
import { apiAggregateSafe } from './api-search'
import {
  computeQueryToAggregateParams,
  normalizeAggregateRows,
  ontologyToSourceSchema,
} from './helpers'

export class RestQueryComputeStore implements ComputeStore {
  constructor(
    private readonly typeRegistry: RestNodeClassRegistry,
    private readonly ontology: Ontology,
  ) {}

  async aggregate(query: ComputeQuery): Promise<ComputeQueryResult> {
    const start = Date.now()
    const prefix = this.typeRegistry[query.source]?.prefix
    if (!prefix) {
      return { rows: [], total: 0, truncated: false, executionTimeMs: Date.now() - start }
    }

    const params = computeQueryToAggregateParams(query)
    const paginated = await apiAggregateSafe<Record<string, unknown>>(prefix, params)

    const metricAliases = query.metrics.map((m: AggregateMetric) => m.as ?? `${m.fn}_${m.field}`)
    const rows = normalizeAggregateRows(paginated.items, query.groupBy, metricAliases)

    return {
      rows,
      total: paginated.page.total ?? 0,
      truncated: paginated.page.hasMore ?? false,
      executionTimeMs: Date.now() - start,
    }
  }

  async getSources(): Promise<ComputeSource[]> {
    const result: ComputeSource[] = []
    for (const type of this.ontology.types) {
      if (!this.typeRegistry[type.name]?.prefix) continue
      const schema = ontologyToSourceSchema(this.ontology, type.name)
      if (!schema.fields.some((f) => f.aggregatable)) continue
      result.push({ name: type.name })
    }
    return result
  }

  async getSourceSchema(source: string): Promise<SourceSchema> {
    return ontologyToSourceSchema(this.ontology, source)
  }
}
