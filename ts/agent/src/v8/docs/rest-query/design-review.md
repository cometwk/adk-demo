
---

### ⚠️ P1 级缺陷（环境安全 / 架构隔离 / 严重容错异常）

#### 3. 全局 `axios` 污染的全局副作用
* **评审视角**：安全守护者 (Security Sentinel) & 对抗性架构师 (Adversarial Document Reviewer)
* **缺陷描述**：第 `6.2` 节的代码中，设计为直接修改全局的 `axios.defaults.baseURL`，并注册了全局 `axios.interceptors`：

```435:441:src/v8/docs/rest-query/design.md
// ── 全局配置 ──
const host = 'http://localhost:5099'
axios.defaults.baseURL = host
```

**这是一项高危设计**。如果在同一个 Node.js 进程中还有其他 Provider、内置微服务或三方 SDK 也在隐式使用默认的 `axios` 模块，这个设计会彻底污染整个 Node.js 运行上下文，导致其他服务的 HTTP 请求基础路径被意外重置，且在请求头中被无差别塞入当前系统的 bearer token。
* **改进建议**：应当杜绝污染全局模块默认配置。应该在 `http-client.ts` 中通过 `axios.create({ baseURL: host })` 创建一个专用的 `apiClient` 实例，将拦截器绑定在专用的实例上。

#### 4. 敏感凭证在设计骨架中的明文硬编码
* **评审视角**：安全守护者 (Security Sentinel)
* **缺陷描述**：在 token 获取流程的设计中，明文硬编码了敏感的用户凭据（手机号与密码）：

```445:453:src/v8/docs/rest-query/design.md
async function initToken(): Promise<string> {
  if (token) return token
  if (!initPromise) {
    initPromise = signin({ mobile: 'wk', password: '123123', clientid: '123456' })
      .then(res => { token = res.token; return token })
      .catch(err => { initPromise = null; throw err })
  }
  return initPromise
}
```

* **改进建议**：这不仅极不符合代码安全扫描标准，且为后续向多租户或多测试环境适配制造了阻碍。应提倡从环境上下文（如 `process.env`）或是从 `AccessContext` 初始化配置（例如外部向 `HttpClient` 提供参数注入）来获取授权信息，严禁明文硬编码：

```typescript
const mobile = process.env.REST_API_MOBILE || 'wk';
const password = process.env.REST_API_PASSWORD || '123123';
```

#### 5. “一刀切式”一过性 404 全局黑名单熔断导致的雪崩隐患
* **评审视角**：对抗性架构师 (Adversarial Document Reviewer)
* **缺陷描述**：在第 `5.3` 节中，为了“避免重复 404”，设计为：只要 `apiSearch` 抛出 404 错误，就直接将 prefix 塞入常驻内存的 `unavailablePrefixes` 中，在后续拦截所有对该 prefix 的请求直接返回空：

```397:418:src/v8/docs/rest-query/design.md
// 不可用的 API 前缀缓存（避免重复 404）
const unavailablePrefixes = new Set<string>()

async function apiSearchSafe<T>(
  prefix: string,
  query?: SearchParams
): Promise<Paginated<T>> {
  // 前缀已标记为不可用，直接返回空结果
  if (unavailablePrefixes.has(prefix)) {
    return emptyPaginated(query?.pagesize ?? 20, (query?.page ?? 0) * (query?.pagesize ?? 20))
  }

  try {
    return await apiSearch<T>(prefix, query)
  } catch (err) {
    if (isNotFoundError(err)) {
      // 标记为不可用，后续请求直接返回空
      unavailablePrefixes.add(prefix)
      return emptyPaginated(query?.pagesize ?? 20, (query?.page ?? 0) * (query?.pagesize ?? 20))
    }
    throw err
  }
}
```

这一设计的缺陷在于：
1. **永久黑名单**：`unavailablePrefixes` 没有任何自动淘汰（TTL 缓存）、指数避退、手动重置或健康探测恢复机制。若在 LLM 链路执行中，因为网络瞬时闪断、后端服务器热重启、或容器平滑发布造成短暂 404，该实体类型所对应的 API 前缀将被**永久屏蔽**，导致后续所有查询永久返回空，极大降低了系统容灾鲁棒性。
2. **404 语义的误判**：部分 REST 框架中，当查询“特定的、不存在的单条记录”或“条件搜索返回空列表”时，经常会抛出 404。如果因此误伤并屏蔽整个前缀，会造成大面积可用性雪崩。
* **改进建议**：
  * **方案 A**：不建议由底层的 `ApiSearchLayer` 实行这样具有极大状态副作用的“前缀屏蔽”，将其剥离，把路由与熔断检测剥离到上一层的服务状态治理（如 Orchestrator）。
  * **方案 B**：若必须要防爆，可以使用具备生命周期（TTL 短效过期，例如 30s）的 Map 承载，使黑名单前缀可以自我恢复，并严密检测 404 是否为“路由不存在（API Endpoint Not Exist）”而非正常的“数据查询未匹配到”。

---
