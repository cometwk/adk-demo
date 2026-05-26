import { createInterface } from 'readline'
import { newPipelineTestContext } from './case/rest/helper'
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
const testCases = {
  S0: {
    taskId: 'S0',
    goal: '康传兵有几个下级代理商, 分别是谁',
    entryEntities: [],
  },
  S1: {
    taskId: 'S1',
    goal: '哪些代理商进件的商户, 本月没有发生交易？',
    entryEntities: [],
  },
}

// 第一步 创建任务和 Session
const task: PipelineTask = { type: 'reasoning', ...testCases.S1 }
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
