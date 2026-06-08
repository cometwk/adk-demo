import '../lib/env'
import { query } from '@anthropic-ai/claude-agent-sdk'

// 必须在最前面将配置写入 process.env
console.log(process.env.ANTHROPIC_API_KEY)
console.log(process.env.ANTHROPIC_BASE_URL)
console.log(process.env.ANTHROPIC_MODEL)

async function run() {
  for await (const message of query({
    prompt: 'hi',
    options: {
      allowedTools: ['Read', 'Edit', 'Bash'],
    },
  })) {
    // console.log(message)
    // Print human-readable output
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if ('text' in block) {
          console.log(block.text) // Claude's reasoning
        } else if ('name' in block) {
          console.log(`Tool: ${block.name}`) // Tool being called
        }
      }
    } else if (message.type === 'result') {
      console.log(`Done: ${message.subtype}`) // Final result
    }
  }
}

run()
