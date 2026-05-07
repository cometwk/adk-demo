import './env'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'

function createProvider() {
  if (!process.env.OPENAI_API_BASE || !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_BASE and OPENAI_API_KEY must be set')
  }

  // 配置 OpenAI 客户端
  console.log(process.env.OPENAI_API_BASE)
  console.log(process.env.OPENAI_API_KEY)

  const X = createOpenAICompatible

  const client = X({
    name: 'qwen',
    baseURL: process.env.OPENAI_API_BASE,
    apiKey: process.env.OPENAI_API_KEY,
  })

  return client
}
export const provider = createProvider()

function createModel() {
  const MODEL =
    process.env.OPENAI_MODEL || //
    'qwen-plus-2025-09-11' ||
    'qwen3-max-preview' ||
    'qwen-flash' ||
    'qwen-plus' ||
    'gpt-4o-mini'

  const model = provider(MODEL)
  return model
}

export const model = createModel()
