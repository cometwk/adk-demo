import './env'
// import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible as createOpenAI } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

const customOpenAI = createOpenAI({
  name: 'custom',
  //   baseURL: '你的第三方 API 地址（如智谱、讯飞或中转）',
  //   apiKey: process.env.CUSTOM_API_KEY,
  baseURL: process.env.OPENAI_API_BASE!,
  apiKey: process.env.OPENAI_API_KEY,
})

const result = await generateText({
  model: customOpenAI(process.env.OPENAI_MODEL!),
  prompt: '请问 9.11 和 9.9 哪个大？并给出详细的推导过程。',
})

// 1. 验证是否获取到了思考内容
if (result.reasoning) {
  console.log('✅ 成功开启思考模式！')
  console.log('思考过程：', result.reasoning)
} else {
  console.log('❌ 未触发思考模式或模型未返回思考内容。')
}

console.log('最终回复：', result.text)
