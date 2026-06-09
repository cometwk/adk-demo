import '../lib/env'
import { generateText, stepCountIs } from 'ai'
import { model } from '../lib/model'
import { discover_entities, execute_query } from './tools'
import { chatDebug } from '../lib/chat'

// const result = await generateText({
//   model: model,
//   prompt: '订单数最多的商户是哪个？',
//   system: `你是BI助手，可以回答关于BI的问题。`,
//   tools: {
//     discover_entities,
//     execute_query,
//   },
//   stopWhen: stepCountIs(50),
// })

// // 1. 验证是否获取到了思考内容
// if (result.reasoning) {
//   console.log('✅ 成功开启思考模式！')
//   console.log('思考过程：', result.reasoning)
// } else {
//   console.log('❌ 未触发思考模式或模型未返回思考内容。')
// }

// console.log('最终回复：', result.text)

async function main() {
  await chatDebug({
    prompt: '订单数最多的商户是哪个？',
    system: `你是BI助手，可以回答关于BI的问题。`,
    tools: {
      discover_entities,
      execute_query,
    },
  })
}
main()
