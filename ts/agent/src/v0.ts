import { ContentPart, generateText, stepCountIs, tool, UIMessage, zodSchema, type ModelMessage } from 'ai'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import readline from 'node:readline'
import { z } from 'zod'
import { model } from './model'
import { convertToModelMessages } from 'ai'

const execAsync = promisify(exec)

const MAX_OUTPUT_LENGTH = 50_000
const COMMAND_TIMEOUT_MS = 300_000

const SYSTEM = `You are a CLI agent at ${process.cwd()}. Solve problems using bash commands.

Rules:
- Prefer tools over prose. Act first, explain briefly after.
- Read files: cat, grep, find, rg, ls, head, tail
- Write files: echo '...' > file, sed -i, or cat << 'EOF' > file
- Subagent: For complex subtasks, spawn a subagent to keep context clean:
  npx tsx src/v0.ts "explore src/ and summarize the architecture"

When to use subagent:
- Task requires reading many files (isolate the exploration)
- Task is independent and self-contained
- You want to avoid polluting current conversation with intermediate details

The subagent runs in isolation and returns only its final summary.`

type BashInput = {
  command: string
}

const bashTool = tool<BashInput, string>({
  description: `Execute shell command. Common patterns:
- Read: cat/head/tail, grep/find/rg/ls, wc -l
- Write: echo 'content' > file, sed -i 's/old/new/g' file
- Subagent: npx tsx src/v0.ts 'task description' (spawns isolated agent, returns summary, 注意运行src/v0.ts时，npx 命令需要放在前面，否则会报错, tsx 用于执行ts文件, 'task description' 是子代理的请求任务说明)`,
  inputSchema: zodSchema(
    z.object({
      command: z.string().describe('Shell command'),
    })
  ),
  execute: async ({ command }) => {
    console.log('command', command)

    let output = ''
    try {
      const result = await execAsync(command, {
        cwd: process.cwd(),
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      })
      output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      output = `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ? `\n${err.message}` : ''}`
    }

    if (output.length > MAX_OUTPUT_LENGTH) {
      return output.slice(0, MAX_OUTPUT_LENGTH)
    }
    return output
  },
})

const tools = {
  bash: bashTool,
}

async function chat(prompt: string, history: ModelMessage[] = []) {
  history.push({ role: 'user', content: prompt })

  // # 1. Call the model with tools
  const result = await generateText({
    model,
    system: SYSTEM,
    messages: history,
    tools: tools,
    stopWhen: stepCountIs(3),
    onStepFinish: (step) => {
      // # 2. Build assistant message content (preserve both text and tool_use blocks)
      // history.push({
      //   role: 'assistant',
      //   content: step.content.filter((p) => p.type === 'text' || p.type === 'tool-call'),
      // })
      // // # 3. If model didn't call tools, we're done

      // console.log('--- Step Finished ---')
      step.content.forEach((part) => {
        if (part.type === 'text') {
          // console.log('文本:', part.text)
        } else if (part.type === 'tool-call') {
          // console.log('工具调用:', part.toolName)
          console.log("\x1b[33m$ " + part.toolName + "\x1b[0m")  //# Yellow color for commands
          console.log(JSON.stringify(part.input, null, 2))
        } else if (part.type === 'tool-result') {
          // console.log('工具结果:', part.toolName)
        }
      })
    },
  })

  const response = await result.response
  history.push(...response.messages)

  // console.log('history=\n', JSON.stringify(history, null, 2))

  return result.text
}

async function run() {
  const args = process.argv.slice(2)
  if (args.length > 0) {
    const prompt = args.join(' ')
    const text = await chat(prompt)
    console.log(text)
    return
  }

  const history: ModelMessage[] = []
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const ask = () => {
    rl.question('\x1b[36m>> \x1b[0m', async (line) => {
      const query = line.trim()
      if (!query || query === 'q' || query === 'exit') {
        rl.close()
        return
      }

      try {
        const text = await chat(query, history)
        console.log(text)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(message)
      }

      ask()
    })
  }

  ask()
}

run()
