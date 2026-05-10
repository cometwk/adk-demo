import chalk from 'chalk'

import { generateText, stepCountIs } from 'ai'
import { model } from '../../../../lib/model'
import { buildPredictiveSystemPrompt } from '../../../agent/prompt'
import { createFactTools } from '../../../agent/tools/facts'
import { createGraphTools } from '../../../agent/tools/graph'
import { createMethodTools } from '../../../agent/tools/method'
import { DecisionTask, DecisionWorkspace } from '../../../ontology/decision'
import { OPEN_POLICY } from '../../../policy/context'
import { FactStore } from '../../../runtime/eventStore'
import { buildOntology } from '../../../runtime/ontology-builder'
import { seedGraph } from './seed1'
import { createCandidateTools } from '../../../agent/tools/candidates'

const systemLog = (x: any) => {
  console.log('system:', chalk.bold.red(x))
}
const contentLog = (x: any) => {
  console.log('content:', x)
}
const userLog = (x: any) => {
  console.log('user:', chalk.bold.gray(x))
}
const reasoningLog = (x: any) => {
  console.log('reasoning:', chalk.bold.green(x))
}
const toolCallsLog = (x: any) => {
  const { toolName, input } = x
  console.log('toolCalls:', chalk.bold.yellow(`${toolName}(${JSON.stringify(input)})`))
}
const toolResultsLog = (x: any) => {
  console.log('toolResults:', chalk.bold.blue(JSON.stringify(x)))
}

function onStep(step: any) {
  // console.log(step)
  const stepNumber = chalk.bgGray.blue.bold('step:' + step.stepNumber)
  console.log(stepNumber)

  if (step.toolCalls.length > 0) {
    for (let i = 0; i < step.toolCalls.length; i++) {
      toolCallsLog(step.toolCalls[i])
      toolResultsLog(step.toolResults[i])
    }
  }
  if (step.content.length > 0) {
    for (const c of step.content) {
      if (c.type === 'text') {
        contentLog(c.text)
      }
      if (c.type === 'reasoning') {
        reasoningLog(c.text)
      }
    }
  }

  console.log('--------------------------------\n')
}

// 测试: 采用llm-agent模式, 执行预测决策任务，收集证据，做出模型裁决
async function llm_agent_predictive() {
  const policy = OPEN_POLICY
  const currentFacts = new FactStore()
  const workspace = new DecisionWorkspace('predictive')

  const ontology = buildOntology({ version: '1.0.0' })
  const graph = seedGraph()

  const task: DecisionTask = {
    taskId: 'test',
    mode: 'predictive',
    intent: 'risk_assessment',
    goal: '评估小明是否能借《人工智能简史》',
    entryEntities: ['xiao_ming', 'book_ai_history'],
    scope: {},
    policyCtx: policy,
  }

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`
  systemLog(systemPrompt)
  userLog(userMessage)

  // Build tools (facts store starts empty; executor populates it)
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(policy)
  const candidateTools = createCandidateTools(workspace, policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
    ...candidateTools,
  }

  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
    onStepFinish: onStep,
    // onFinish: onStep,
  })

  workspace.debugLog()

  return result
}

const r = await llm_agent_predictive()
console.log(r.content)
