import { describe, expect, it, vi, beforeEach } from 'vitest'
import { apiAggregate, apiAggregateSafe, emptyPaginated, resetUnavailablePrefixes } from '../api-search'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    defaults: { baseURL: '' },
    interceptators: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import axios from 'axios'
const mockedGet = vi.mocked(axios.get)

describe('apiAggregate', () => {
  beforeEach(() => {
    resetUnavailablePrefixes()
    vi.clearAllMocks()
  })

  it('should return Paginated from TableData response', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [{ status: 'active', total: 10 }],
      page: 0,
      pagesize: 20,
      total: 1,
    })

    const result = await apiAggregate('/order-daily')

    expect(mockedGet).toHaveBeenCalledWith('/admin/order-daily/searchAggregate', { params: undefined })
    expect(result.items).toEqual([{ status: 'active', total: 10 }])
    expect(result.page.total).toBe(1)
    expect(result.page.offset).toBe(0)
    expect(result.page.limit).toBe(20)
    expect(result.page.hasMore).toBe(false)
  })

  it('should pass query params to axios', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [],
      page: 0,
      pagesize: 10,
      total: 0,
    })

    const params = { metrics: 'count(*).total', page: 0, pagesize: 10 }
    await apiAggregate('/order-daily', params)

    expect(mockedGet).toHaveBeenCalledWith('/admin/order-daily/searchAggregate', { params })
  })
})

describe('apiAggregateSafe', () => {
  beforeEach(() => {
    resetUnavailablePrefixes()
    vi.clearAllMocks()
  })

  it('should return emptyPaginated on 404 and cache prefix', async () => {
    mockedGet.mockRejectedValueOnce({ status: 404 })

    const result = await apiAggregateSafe('/unknown')

    expect(result.items).toEqual([])
    expect(result.page.total).toBe(0)

    // Second call should not hit axios
    const result2 = await apiAggregateSafe('/unknown')
    expect(result2.items).toEqual([])
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('should propagate non-404 errors', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Server error'))

    await expect(apiAggregateSafe('/order-daily')).rejects.toThrow('Server error')
  })

  it('should return empty for cached prefix without making request', async () => {
    // First call fails with 404
    mockedGet.mockRejectedValueOnce({ status: 404 })
    await apiAggregateSafe('/bad-prefix')

    // Second call should skip
    const result = await apiAggregateSafe('/bad-prefix')
    expect(result.items).toEqual([])
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
