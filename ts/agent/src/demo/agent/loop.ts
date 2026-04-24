import type { Executor } from '../runtime/executor'
import type { Graph } from '../runtime/graph'
import type { AgentState } from '../runtime/state'
import type { NextAction } from '../runtime/types'
import type { Validator } from '../runtime/validator'
import { callLLM } from './llm'
import { buildPrompt } from './prompt'
import { callLLM_mock } from './llm_mock'

const MAX_STEPS = 10;
const MAX_CONSECUTIVE_ERRORS = 2;

export async function runAgentLoop(
  goal: string,
  graph: Graph,
  executor: Executor,
  validator: Validator,
  state: AgentState<any>
) {
  let lastObservation = '(none)'
  let consecutiveErrors = 0

  for (let step = 0; step < MAX_STEPS; step++) {
    const prompt = buildPrompt(goal, graph, state, lastObservation)
    const action = await callLLM(prompt)
    console.log('ACTION:', action)

    // ── 校验层：失败时回注错误作为观测，让 LLM 有机会修正 ──────────
    const validation = validator.validate(action)
    if (!validation.valid) {
      consecutiveErrors++
      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
        console.log(`❌ Aborted after ${MAX_CONSECUTIVE_ERRORS} consecutive errors:`, validation.error)
        break
      }
      console.log(`⚠️  Validation error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, validation.error)
      lastObservation = `VALIDATION_ERROR: ${validation.error} — please fix your action and retry`
      continue
    }

    // ── 执行层：失败同样回注，允许 LLM 修正 ─────────────────────────
    const obs = executor.execute(action)
    console.log('OBS:', obs)

    if (!obs.success) {
      consecutiveErrors++
      if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
        console.log(`❌ Aborted after ${MAX_CONSECUTIVE_ERRORS} consecutive errors:`, obs.error)
        break
      }
      console.log(`⚠️  Execution error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, obs.error)
      lastObservation = `EXECUTION_ERROR: ${obs.error} — please fix your action and retry`
      continue
    }

    // ── 成功：重置计数器，更新观测 ───────────────────────────────────
    consecutiveErrors = 0
    lastObservation = `${action.op} → ${JSON.stringify(obs.data)}`

    if (action.op === 'stop') {
      console.log('✅ DONE:', obs.data)
      break
    }
  }
}
