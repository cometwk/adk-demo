import { setInitToken } from '../../provider/rest'
import { newAgentContext, S0, syncPredictiveAgent } from './use-case'

await setInitToken()
console.log('jusetInitToken success')

const testS0 = newAgentContext({
  taskId: 'S0',
  goal: '康传兵有几个下级代理商, 分别是谁？',
  entryEntities: [],
})

await syncPredictiveAgent(testS0)

console.log('over: =================================')
console.log('\n\n\n')

console.log('facts =================================')
console.log(S0.workspace.bindings)
console.log('workspace =================================')
// console.log(S0.workspace.debugLog())
