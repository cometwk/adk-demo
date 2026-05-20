import axios, { AxiosResponse } from 'axios'
import { z } from 'zod'

// ── SearchParams ──

export const SearchParamsSchema = z
  .object({
    page: z.number().int().min(0).optional().describe('页码，从0开始'),
    pagesize: z.number().int().min(1).max(500).optional().describe('每页条数，最大500'),
    select: z.string().optional(),
    order: z.string().optional().describe('排序字段，逗号分隔，如: created_at.desc,name.asc'),
  })
  .catchall(z.any())

export type SearchParams = {
  page?: number
  pagesize?: number
  select?: string
  order?: string
} & Record<string, number | string>

export interface TableData<T> {
  data: Array<T>
  page: number
  pagesize: number
  total: number
}

// ── Axios Config ──

const local = {
  token: '',
}

const host = 'http://localhost:5099'
console.log('host=', host)

axios.interceptors.request.use((config) => {
  const url = `${host}${config.url}`
  return {
    ...config,
    url: url,
    headers: {
      ...config['headers'],
      authorization: 'Bearer ' + local.token,
    } as any,
  }
})

axios.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (!error.response) {
      console.error('网络错误，请检查网络连接')
      return Promise.reject(error)
    }

    const res = error.response as AxiosResponse
    const data = res.data
    const errorMsg = data?.message || data?.error || data || `${res.status} : ${res.statusText}`
    const err = new Error(errorMsg)

    const code = res.status || data?.code
    if (code === 401) {
      throw new Error('无权限')
    } else if (code === 403) {
      throw new Error('禁止访问')
    }

    return Promise.reject(err)
  }
)

// ── Auth ──

interface LoginRequest {
  mobile?: string
  password: string
  clientid: string
}
interface LoginResponse {
  token: string
}

async function signin(data: LoginRequest) {
  return (await axios.post('/login/signin', data)) as LoginResponse
}

export async function setInitToken() {
  const res = await signin({
    mobile: 'wk',
    password: '123123',
    clientid: '123456',
  })
  local.token = res.token
  console.log('local.token = ', local.token)
}