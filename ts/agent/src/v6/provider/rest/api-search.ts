import axios from 'axios'
import type { Paginated } from '../../runtime/types'
import type { SearchParams, TableData } from './axios'

const DEFAULT_LIMIT = 20

const unavailablePrefixes = new Set<string>()

export function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: number }).status
  if (status === 404) return true
  const msg = err instanceof Error ? err.message : String(err)
  return msg === 'Not Found' || msg.includes('404') || msg.includes('无权限') || msg.includes('禁止访问')
}

export function emptyPaginated<T>(limit = DEFAULT_LIMIT, offset = 0): Paginated<T> {
  return {
    items: [],
    page: { offset, limit, hasMore: false, total: 0 },
  }
}

export async function apiSearch<T extends Record<string, unknown>>(
  prefix: string,
  query?: SearchParams,
): Promise<Paginated<T>> {
  const r = (await axios.get(`/admin${prefix}/search`, { params: query })) as TableData<T>
  const limit = r.pagesize || DEFAULT_LIMIT
  const offset = r.page * limit
  return {
    items: r.data,
    page: {
      offset,
      limit,
      hasMore: r.total > offset + r.data.length,
      total: r.total,
    },
  }
}

export async function apiSearchSafe<T extends Record<string, unknown>>(
  prefix: string,
  query?: SearchParams,
): Promise<Paginated<T>> {
  if (unavailablePrefixes.has(prefix)) {
    const limit = query?.pagesize ?? DEFAULT_LIMIT
    const offset = (query?.page ?? 0) * limit
    return emptyPaginated(limit, offset)
  }
  try {
    return await apiSearch<T>(prefix, query)
  } catch (err) {
    if (isNotFoundError(err)) {
      unavailablePrefixes.add(prefix)
      const limit = query?.pagesize ?? DEFAULT_LIMIT
      const offset = (query?.page ?? 0) * limit
      return emptyPaginated(limit, offset)
    }
    throw err
  }
}

export function resetUnavailablePrefixes(): void {
  unavailablePrefixes.clear()
}