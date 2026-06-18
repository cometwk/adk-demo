import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
// import { createOpenAI } from '@ai-sdk/openai'

function createProvider() {
  if (!process.env.OPENAI_API_BASE || !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_BASE and OPENAI_API_KEY must be set')
  }

  // 配置 OpenAI 客户端
  console.log(process.env.OPENAI_API_BASE)
  console.log(process.env.OPENAI_API_KEY)

  const X = createOpenAICompatible

  const client = X({
    name: 'normal',
    baseURL: process.env.OPENAI_API_BASE,
    apiKey: process.env.OPENAI_API_KEY,
    // ⭐ 在这里拦截并全局注入自定义 Body 参数
    fetch: async (url, options) => {
      if (options?.body && typeof options.body === 'string') {
        try {
          const bodyObj = JSON.parse(options.body)

          // 全局自动注入思考参数
          bodyObj.enable_thinking = true

          // 重新序列化放回 options
          options.body = JSON.stringify(bodyObj)
        } catch (e) {
          console.error('解析请求体失败:', e)
        }
      }
      // 调用原生 fetch 发送请求
      return fetch(url, options)
    },
  })

  return client
}
export const provider = createProvider()

function createModel() {
  const MODEL = process.env.OPENAI_MODEL!
  const model = provider(MODEL)
  return model
}

export const model = createModel()
export const tinyModel = createOpenAICompatible({
  name: 'tiny',
  baseURL: process.env.OPENAI_API_BASE!,
  apiKey: process.env.OPENAI_API_KEY!,
})(process.env.OPENAI_MODEL!)

export const embedding = provider("doubao-embedding-vision")
