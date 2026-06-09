import './env'
// import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible as createOpenAI } from '@ai-sdk/openai-compatible'
import { generateText } from 'ai'

const customOpenAI = createOpenAI({
  name: 'custom',
  baseURL: process.env.OPENAI_API_BASE!,
  apiKey: process.env.OPENAI_API_KEY,
  // ⭐ 在这里拦截并全局注入自定义 Body 参数
  fetch: async (url, options) => {
    if (options?.body && typeof options.body === 'string') {
      try {
        const bodyObj = JSON.parse(options.body);
        
        // 全局自动注入思考参数
        bodyObj.enable_thinking = true;
        
        // 重新序列化放回 options
        options.body = JSON.stringify(bodyObj);
      } catch (e) {
        console.error('解析请求体失败:', e);
      }
    }
    // 调用原生 fetch 发送请求
    return fetch(url, options);
  },
})

const result = await generateText({
  model: customOpenAI(process.env.OPENAI_MODEL!),
  prompt: '请问 9.11 和 9.9 哪个大？并给出详细的推导过程。',
  providerOptions: {
    custom: {
      enable_thinking: true, 
    },
  },

  // // 🔥 关键：面向 openai-compatible 包的专属自定义参数作用域
  // providerOptions: {
  //   'openai-compatible': {
  //     enable_thinking: true,
  //   },
  //   'openai': {
  //     enable_thinking: true,
  //   },
  //   providerOptions: {
  //     openai: {
  //       extraBody: {
  //         enable_thinking: true, // 这里会被直接放进 POST 请求的 JSON Body 中
  //         // 如果下游模型使用的是其他字段（如 reasoning_effort: "high"），也可以写在这里
  //       },
  //     },
  //   },
  // },
})

// 1. 验证是否获取到了思考内容
if (result.reasoning) {
  console.log('✅ 成功开启思考模式！')
  console.log('思考过程：', result.reasoning)
} else {
  console.log('❌ 未触发思考模式或模型未返回思考内容。')
}

console.log('最终回复：', result.text)

// import fetch from 'node-fetch'; // 如果在 Node 18+ 或 Next.js 中，可以直接用全局 fetch
async function verifyXfyunThinking() {
  const response = await fetch(process.env.OPENAI_API_BASE! + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, // 替换为你的 API Key
    },
    body: JSON.stringify({
      model: 'astron-code-latest',
      messages: [{ role: 'user', content: '我应该重构 v8 还是 v6？请详细推导原因。' }],
      // stream: true, // 开启流式
      enable_thinking: true, // 强行注入讯飞参数
    }),
  })

  const body = response.body
  if (!body) return

  const reader = body.getReader()
  const decoder = new TextDecoder()

  // 监听打印流，直接肉眼观察原始报文
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const lines = decoder.decode(value, { stream: true }).split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          console.log('原始报文:', line)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// verifyXfyunThinking();
