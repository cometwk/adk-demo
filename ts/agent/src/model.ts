import './env'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export function createModels() {
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

  const ali = createOpenAICompatible({
    // baseURL: process.env.ALI_API_BASE,
    name: 'qwen',
    baseURL: process.env.OPENAI_API_BASE,
    apiKey: process.env.ALI_API_KEY,
  })

  const MODEL =
    process.env.OPENAI_MODEL || //
    'qwen-plus-2025-09-11' ||
    'qwen3-max-preview' ||
    'qwen-flash' ||
    'qwen-plus' ||
    'gpt-4o-mini'

  // const embeddingModel = client.embedding("text-embedding-3-small");
  const model = client(MODEL)

  // https://help.aliyun.com/zh/model-studio/vision
  const ocr = ali('qwen-vl-max-0813')

  return {
    client,
    model,
    ocr,
  }
}

const models = createModels()
export const model = models.model
export const ocr = models.ocr
