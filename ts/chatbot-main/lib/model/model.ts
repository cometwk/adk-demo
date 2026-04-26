import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

function createProvider() {
  if (!process.env.OPENAI_API_BASE || !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_BASE and OPENAI_API_KEY must be set')
  }

  // 配置 OpenAI 客户端
  console.log(process.env.OPENAI_API_BASE)
  console.log(process.env.OPENAI_API_KEY)

  const provider = createOpenAICompatible({
    name: 'qwen',
    baseURL: process.env.OPENAI_API_BASE,
    apiKey: process.env.OPENAI_API_KEY,
  })

  return provider

}

function createDefaultModel(name?:string) {
  const provider = createProvider()
  const MODEL = name || process.env.OPENAI_MODEL || 'glm-5'
  const model = provider(MODEL)
  return model
}
const defaultModel = createDefaultModel()

export const model = defaultModel
export const titleModel = createDefaultModel('qwen3.6-plus')

