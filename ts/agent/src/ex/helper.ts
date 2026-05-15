import { generateText, ModelMessage, stepCountIs, streamText } from 'ai'
import { model } from '../lib/model'
import { buildPredictiveSystemPrompt } from '../v6/agent/prompt'
import { createFactTools } from '../v6/agent/tools/facts'
import { createGraphTools } from '../v6/agent/tools/graph'
import { createMethodTools } from '../v6/agent/tools/method'
import { DecisionTask, DecisionWorkspace } from '../v6/ontology/decision'
import { OPEN_POLICY } from '../v6/policy/context'
import { FactStore } from '../v6/runtime/eventStore'
import { buildOntology } from '../v6/runtime/ontology-builder'
import { createCandidateTools } from '../v6/agent/tools/candidates'
import { createRuleTools } from '../v6/agent/tools/rules'

import { makeTask, onStep, systemLog, userLog } from '../v6/helper'
import { seedGraph } from '../ex/seed'
import { clearRules } from '../v6'
import { registerGraph2Rules } from './rules'

// 初始化
// T
import '../ex/ontology' // 必须 import 实体类以触发装饰器注册（副作用 import）
// C
clearRules()
registerGraph2Rules()
// E, R
const graph = seedGraph()

export function newAgentContext(jsonStr: string | any) {
  if (typeof jsonStr === 'string') {
    const task = JSON.parse(jsonStr)
    return newUseCase(makeTask(task))
  }
  return newUseCase(makeTask(jsonStr))
}

function newUseCase(task: DecisionTask) {
  const policy = OPEN_POLICY
  const currentFacts = new FactStore()
  const workspace = new DecisionWorkspace('predictive')

  const ontology = buildOntology({ version: '1.0.0' })
  // console.log('ontology', ontology)

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

  // systemLog(systemPrompt)
  // userLog(userMessage)

  // Build tools (facts store starts empty; executor populates it)
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(policy)
  const candidateTools = createCandidateTools(workspace, policy)
  const ruleTools = createRuleTools(currentFacts, graph, policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
    ...candidateTools,
    ...ruleTools,
  }

  const result = {
    system: systemPrompt,
    prompt: userMessage,
    tools,
    workspace,
    taskId: task.taskId,
  }

  // workspace.debugLog()

  return result
}

export function streamPredictiveAgent(ctx: ReturnType<typeof newUseCase>, messages: ModelMessage[]) {
  const result = streamText<any>({
    model: model,
    system: ctx.system,
    messages,
    // prompt: userMessage,
    tools: ctx.tools,
    stopWhen: stepCountIs(50),
    temperature: 0,
    onStepFinish: onStep,
  })
  // ctx.workspace.debugLog()
  return result
}

export async function syncPredictiveAgent(ctx: ReturnType<typeof newUseCase>, messages: ModelMessage[]) {
  systemLog(ctx.system)
  userLog(ctx.prompt)

  if (messages.length === 0) {
    messages = [
      {
        role: 'system',
        content: ctx.system,
      },
      {
        role: 'user',
        content: ctx.prompt,
      },
    ]
  }
  const result = await generateText<any>({
    model: model,
    system: ctx.system,
    messages,
    // prompt: userMessage,
    tools: ctx.tools,
    stopWhen: stepCountIs(50),
    temperature: 0,
    onStepFinish: onStep,
  })
  ctx.workspace.debugLog()
  return result
}
