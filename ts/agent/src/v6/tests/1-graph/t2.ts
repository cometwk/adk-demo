import { createInterface } from 'readline'
import { ModelMessage } from 'ai'
import { newAgentContext, S0, syncPredictiveAgent } from './use-case'

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

const testS0 = newAgentContext({
  taskId: 'S0',
  goal: '康传兵有几个下级代理商, 分别是谁？',
  entryEntities: [],
})

async function main() {
  let messages: ModelMessage[] = []

  let chatInput = ''
  chatInput = '哪些代理商进件的商户, 本月没有发生交易？'

  while (true) {
    if (chatInput.trim() === '') {
      chatInput = await readLine('请输入问题: ')
    }
    if (chatInput === 'exit' || chatInput === 'q') {
      break
    }
    if (chatInput.trim() === '') {
      continue
    }

    await syncPredictiveAgent(testS0, chatInput, messages)
    chatInput = ''

    console.log('over: =================================')
    // console.log(messages)
    console.log('\n\n\n')

    console.log('facts =================================')
    console.log(S0.workspace.bindings)
    console.log('workspace =================================')
    // console.log(S0.workspace.debugLog())
  }
}

main()
