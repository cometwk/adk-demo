import type { Executor } from '../runtime/executor'
import type { Graph } from '../runtime/graph'
import type { AgentState } from '../runtime/state'
import type { NextAction } from '../runtime/types'
import type { Validator } from '../runtime/validator'
import { callLLM } from './llm'
import { buildPrompt } from './prompt'
import { callLLM_mock } from './llm_mock'

export async function runAgentLoop(
  goal: string,
  graph: Graph,
  executor: Executor,
  validator: Validator,
  state: AgentState<any>
) {
  let lastObservation = '(none)'

  for (let step = 0; step < 6; step++) {
    const prompt = buildPrompt(goal, graph, state, lastObservation)

    const action = await callLLM(prompt)

    console.log('ACTION:', action)

    const validation = validator.validate(action)
    if (!validation.valid) {
      console.log('❌ Invalid action:', validation.error)
      break
    }

    const obs = executor.execute(action)

    console.log('OBS:', obs)

    // 格式化 lastObservation
    if (obs.success && obs.data !== undefined) {
      lastObservation = `${action.op} → ${JSON.stringify(obs.data)}`
    } else if (!obs.success) {
      lastObservation = `${action.op} → ERROR: ${obs.error}`
    }

    if (action.op === 'stop') {
      console.log('✅ DONE:', obs.data)
      break
    }
  }
}
