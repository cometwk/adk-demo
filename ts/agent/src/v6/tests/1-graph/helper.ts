import { generateText, ModelMessage, stepCountIs, streamText } from 'ai'
import { model } from '../../../lib/model'
import { buildPredictiveSystemPrompt } from '../../agent/prompt'
import { createFactTools } from '../../agent/tools/facts'
import { createGraphTools } from '../../agent/tools/graph'
import { createMethodTools } from '../../agent/tools/method'
import { DecisionTask, DecisionWorkspace } from '../../ontology/decision'
import { OPEN_POLICY } from '../../policy/context'
import { buildOntology } from '../../runtime/ontology-builder'
import { createCandidateTools } from '../../agent/tools/candidates'
import { createRuleTools } from '../../agent/tools/rules'

import { makeTask, onStep, systemLog, userLog } from '../../helper'
// import { seedGraph } from './seed'
// import { clearRules } from '../../index'
// import { registerGraph2Rules } from './rules'

// 初始化
// T
import './restapi/ontology' // 必须 import 实体类以触发装饰器注册（副作用 import）
import { RestCrudGraphStore } from './restapi/RestCrudGraph'
// C
// clearRules()
// registerGraph2Rules()
// E, R
const graph = newGraph()
function newGraph() {
  const ontology = buildOntology({ version: 'restapi-1.0' })
  console.log(
    'ontology types:',
    ontology.types.map((t) => t.name)
  )
  console.log(
    'ontology relations:',
    ontology.relations.map((r) => `${r.fromType} --${r.type}--> ${r.toType}`)
  )

  const store = new RestCrudGraphStore({ relations: ontology.relations })
  //   const x = await store.findNodes({ type: 'AgentRel', limit: 3 })
  return store
}

export function newAgentContext(jsonStr: string | any) {
  if (typeof jsonStr === 'string') {
    const task = JSON.parse(jsonStr)
    return newUseCase(makeTask(task))
  }
  return newUseCase(makeTask(jsonStr))
}

function newUseCase(task: DecisionTask) {
  const policy = OPEN_POLICY
  const workspace = new DecisionWorkspace('predictive')

  const ontology = buildOntology({ version: '1.0.0' })
  // console.log('ontology', ontology)

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

  // systemLog(systemPrompt)
  // userLog(userMessage)

  // Build tools (workspace.bindings is populated by executor via bind_fact)
  const currentFacts = workspace.getFacts()
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(workspace.bindings, policy)
  const candidateTools = createCandidateTools(workspace, policy)
//   const ruleTools = createRuleTools(currentFacts, graph, policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
    ...candidateTools,
    // ...ruleTools,
  }

  const result = {
    system: systemPrompt,
    prompt: userMessage,
    tools,
    workspace,
    taskId: task.taskId,

    first: true,
  }

  // workspace.debugLog()

  return result
}

export function streamPredictiveAgent(ctx: ReturnType<typeof newUseCase>, messages: ModelMessage[]) {
  if (ctx.first) {
    ctx.first = false
    systemLog(ctx.system)
    userLog(ctx.prompt)
  }
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
