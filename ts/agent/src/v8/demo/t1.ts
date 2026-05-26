import { createInterface } from 'readline'
import { newPipelineTestContext, useCaseScenarios } from './case/library/helper'
import { PipelineTask } from '../pipeline'

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

// 测试用例
const { goal, entryEntities } = useCaseScenarios.S1

// 第一步 创建任务和 Session
const task: PipelineTask = { type: 'reasoning', goal, entryEntities }
const ctx = newPipelineTestContext()
const session = ctx.createSession(task)

// 第二步 执行首次任务
const r = await session.run()
console.log('首次结果:', r.rawText)

// 后续，继续就该 session 进行交互 chat
while (true) {
  const chatInput = await readLine('请输入问题: ')
  if (chatInput === 'exit' || chatInput === 'q') {
    break
  }
  if (chatInput.trim() === '') {
    continue
  }

  const chatResult = await session.chat(chatInput)
  console.log('回答:', chatResult.rawText)
}
