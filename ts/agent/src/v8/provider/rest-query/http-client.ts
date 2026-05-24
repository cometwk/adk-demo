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
// 业务用的全局 axios，配置 baseURL 后不需要手动拼 host
const host = 'http://localhost:5099'
console.log('host=', host)
axios.defaults.baseURL = host

// ── 拦截器：自动初始化 token ──
axios.interceptors.request.use(async (config) => {
  if (!token) {
    await initToken()
  }

  return {
    ...config,
    headers: {
      ...config.headers,
      authorization: 'Bearer ' + token,
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

// ── Token 初始化（懒加载 + 防并发重复请求）──

let token: string | null = null
let initPromise: Promise<string> | null = null

// 专用于登录认证的干净实例，不带任何拦截器，从根源杜绝递归死锁
const authInstance = axios.create({
  baseURL: host,
})

interface LoginRequest {
  mobile?: string
  password: string
  clientid: string
}
interface LoginResponse {
  token: string
}

async function signin(data: LoginRequest) {
  const response = await authInstance.post<LoginResponse>('/login/signin', data)
  return response.data
}

function initToken(): Promise<string> {
  if (token) return Promise.resolve(token!)

  if (!initPromise) {
    console.log('=== 正在执行服务端异步初始化 ===')
    initPromise = signin({
      mobile: 'wk',
      password: '123123',
      clientid: '123456',
    })
      .then((res) => {
        token = res.token
        console.log('token =', token)
        return token!
      })
      .catch((err) => {
        initPromise = null
        throw err
      })
  }

  return initPromise!
}