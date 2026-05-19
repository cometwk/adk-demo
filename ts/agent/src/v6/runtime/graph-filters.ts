import type { PropertyFilter } from './query-types'

export function evalFilter(value: unknown, filter: PropertyFilter): boolean {
  const { op, value: v } = filter
  switch (op) {
    case 'eq':
      return value === v
    case 'ne':
      return value !== v
    case 'gt':
      return (value as number) > (v as number)
    case 'gte':
      return (value as number) >= (v as number)
    case 'lt':
      return (value as number) < (v as number)
    case 'lte':
      return (value as number) <= (v as number)
    case 'contains':
      return String(value).includes(String(v))
    case 'in':
      return Array.isArray(v) && v.includes(value)
  }
}

export function matchesFilters(props: Record<string, unknown>, filters: PropertyFilter[]): boolean {
  return filters.every((f) => evalFilter(props[f.property], f))
}

export function projectFields(
  props: Record<string, unknown>,
  fields?: string[],
): Record<string, unknown> {
  if (!fields || fields.length === 0) return props
  return Object.fromEntries(fields.map((f) => [f, props[f]]))
}
