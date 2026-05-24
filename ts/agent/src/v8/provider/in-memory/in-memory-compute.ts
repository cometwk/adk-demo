import type { ComputeStore, ComputeSource, SourceSchema, FieldSchema } from '../../engine/stores/compute-store'
import type { ComputeQuery, ComputeQueryResult, ComputeRow, ComputeFilter, AggregateMetric } from '../../engine/query/compute-query'

// ── InMemoryComputeStore ──
// Stores flattened row data for OLAP-style aggregation

export class InMemoryComputeStore implements ComputeStore {
  private sources = new Map<string, { rows: Record<string, unknown>[]; schema: FieldSchema[] }>()

  seedSource(sourceName: string, rows: Record<string, unknown>[], schema: FieldSchema[]): void {
    this.sources.set(sourceName, { rows, schema })
  }

  async aggregate(query: ComputeQuery): Promise<ComputeQueryResult> {
    const start = Date.now()
    const sourceData = this.sources.get(query.source)
    if (!sourceData) {
      return { rows: [], total: 0, truncated: false, executionTimeMs: Date.now() - start }
    }

    // Apply filters
    let filteredRows = sourceData.rows
    if (query.filters && query.filters.length > 0) {
      filteredRows = sourceData.rows.filter((row) => this.matchesFilters(row, query.filters!))
    }

    // Compute aggregation
    const resultRows = this.computeAggregation(filteredRows, query.metrics, query.groupBy)

    // Apply orderBy
    if (query.orderBy && query.orderBy.length > 0) {
      this.applyOrderBy(resultRows, query.orderBy)
    }

    // Apply pagination
    const offset = query.offset ?? 0
    const limit = query.limit ?? resultRows.length
    const pagedRows = resultRows.slice(offset, offset + limit)

    return {
      rows: pagedRows,
      total: resultRows.length,
      truncated: offset + limit < resultRows.length,
      executionTimeMs: Date.now() - start,
    }
  }

  async getSources(): Promise<ComputeSource[]> {
    return Array.from(this.sources.entries()).map(([name, data]) => ({
      name,
      rowCount: data.rows.length,
    }))
  }

  async getSourceSchema(source: string): Promise<SourceSchema> {
    const data = this.sources.get(source)
    if (!data) {
      return { fields: [] }
    }
    return { fields: data.schema }
  }

  // ── Helper methods ──

  private matchesFilters(row: Record<string, unknown>, filters: ComputeFilter[]): boolean {
    return filters.every((f) => this.evalComputeFilter(row, f))
  }

  private evalComputeFilter(row: Record<string, unknown>, filter: ComputeFilter): boolean {
    const value = row[filter.field]
    const { op, value: filterValue } = filter

    switch (op) {
      case 'eq':
        return value === filterValue
      case 'ne':
        return value !== filterValue
      case 'gt':
        return (value as number) > (filterValue as number)
      case 'gte':
        return (value as number) >= (filterValue as number)
      case 'lt':
        return (value as number) < (filterValue as number)
      case 'lte':
        return (value as number) <= (filterValue as number)
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(value)
      case 'between':
        if (!Array.isArray(filterValue) || filterValue.length !== 2) return false
        const v = value as number
        return v >= (filterValue[0] as number) && v <= (filterValue[1] as number)
      default:
        return false
    }
  }

  private computeAggregation(
    rows: Record<string, unknown>[],
    metrics: AggregateMetric[],
    groupBy?: string[]
  ): ComputeRow[] {
    if (!groupBy || groupBy.length === 0) {
      // Single group aggregation
      const row: ComputeRow = {}
      for (const m of metrics) {
        const alias = m.as ?? `${m.fn}_${m.field}`
        row[alias] = this.computeMetric(rows, m)
      }
      return [row]
    }

    // Grouped aggregation
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const row of rows) {
      const key = groupBy.map((g) => String(row[g] ?? 'null')).join('|')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }

    return Array.from(groups.entries()).map(([key, groupRows]) => {
      const row: ComputeRow = {}
      // Extract group values
      const groupValues: Record<string, unknown> = {}
      groupBy.forEach((g, i) => {
        const firstRow = groupRows[0]
        groupValues[g] = firstRow[g]
      })
      row.group = groupValues

      // Compute metrics
      for (const m of metrics) {
        const alias = m.as ?? `${m.fn}_${m.field}`
        row[alias] = this.computeMetric(groupRows, m)
      }
      return row
    })
  }

  private computeMetric(rows: Record<string, unknown>[], metric: AggregateMetric): number {
    const values = rows.map((r) => {
      if (metric.field === '*') return 1
      const v = r[metric.field]
      return typeof v === 'number' ? v : 0
    })

    switch (metric.fn) {
      case 'count':
        return rows.length
      case 'sum':
        return values.reduce((a, b) => a + b, 0)
      case 'avg':
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
      case 'min':
        return values.length > 0 ? Math.min(...values) : 0
      case 'max':
        return values.length > 0 ? Math.max(...values) : 0
      default:
        return 0
    }
  }

  private applyOrderBy(rows: ComputeRow[], orderBy: { field: string; direction: 'asc' | 'desc' }[]): void {
    rows.sort((a, b) => {
      for (const order of orderBy) {
        const aVal = this.getSortValue(a, order.field)
        const bVal = this.getSortValue(b, order.field)
        if (aVal < bVal) return order.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return order.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  private getSortValue(row: ComputeRow, field: string): number | string {
    // Check if it's a group field
    if (row.group && typeof row.group === 'object') {
      const group = row.group as Record<string, unknown>
      if (group[field] !== undefined) {
        const v = group[field]
        return typeof v === 'number' ? v : String(v)
      }
    }
    // Check if it's a metric field
    const v = row[field]
    return typeof v === 'number' ? v : String(v ?? '')
  }
}