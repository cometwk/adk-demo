import './env'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

function createModels() {
  if (!process.env.OPENAI_API_BASE || !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_BASE and OPENAI_API_KEY must be set')
  }

  // 配置 OpenAI 客户端
  console.log(process.env.OPENAI_API_BASE)
  console.log(process.env.OPENAI_API_KEY)

  const client = createOpenAICompatible({
    name: 'qwen',
    baseURL: process.env.OPENAI_API_BASE,
    apiKey: process.env.OPENAI_API_KEY,
  })

  const MODEL =
    process.env.OPENAI_MODEL || //
    'qwen-plus-2025-09-11' ||
    'qwen3-max-preview' ||
    'qwen-flash' ||
    'qwen-plus' ||
    'gpt-4o-mini'

  const model = client(MODEL)
  return model
}

export const model = createModels()
