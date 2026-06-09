import { createInterface } from 'readline'
import { generateText, ModelMessage, stepCountIs } from 'ai'
import { model } from './model'
import { trace } from './trace'

function readLine(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

type GenerateTextArgs = Parameters<typeof generateText>[0]

export function newChatContext(args: GenerateTextArgs) {
  return {
    prompt: (args.prompt as string) || undefined,
    system: (args.system as string) || undefined,
    tools: args.tools,
  }
}
export type ChatContext = ReturnType<typeof newChatContext>

export async function chatDebug(ctx: ChatContext): Promise<void> {
  const { onStep, system, user } = trace

  system(ctx.system)
  user(ctx.prompt)

  let messages: ModelMessage[] = []
//   if (ctx.system) {
//     messages.push({
//       role: 'system',
//       content: ctx.system,
//     })
//   }
  if (ctx.prompt) {
    messages.push({
      role: 'user',
      content: ctx.prompt,
    })
  }

  let chatInput = ''
  let read = ctx.prompt ? false : true
  while (true) {
    if (read) {
      chatInput = await readLine('请输入问题: ')
      chatInput = chatInput.trim()
      if (chatInput === '') continue
      if (chatInput === 'exit' || chatInput === 'q') break

      messages.push({
        role: 'user',
        content: chatInput,
      })
      user(chatInput)
    }
    read = true

    const result = await generateText<any>({
      model: model,
      system: ctx.system,
      messages: messages,
      // prompt: userMessage,
      tools: ctx.tools,
      stopWhen: stepCountIs(50),
      temperature: 0,
      onStepFinish: onStep,
    })

    // 将响应消息添加到 messages 数组
    messages.push(...result.response.messages)
  }
}
