import chalk from 'chalk'

import { generateText, stepCountIs } from 'ai'
import { model } from '../lib/model'
import { buildPredictiveSystemPrompt } from './agent/prompt'
import { createFactTools } from './agent/tools/facts'
import { createGraphTools } from './agent/tools/graph'
import { createMethodTools } from './agent/tools/method'
import { DecisionTask, DecisionWorkspace } from './ontology/decision'
import { OPEN_POLICY } from './policy/context'
import { buildOntology } from './runtime/ontology-builder'
import { createCandidateTools } from './agent/tools/candidates'
import { createRuleTools } from './agent/tools/rules'
import { Graph } from './provider/in-memory'

export const systemLog = (x: any) => {
  console.log('system:', chalk.bold.red(x))
}
export const contentLog = (x: any) => {
  console.log('content:', x)
}
export const userLog = (x: any) => {
  console.log('user:', chalk.bold.gray(x))
}
export const reasoningLog = (x: any) => {
  console.log('reasoning:', chalk.bold.green(x))
}
export const toolCallsLog = (x: any) => {
  const { toolName, input } = x
  console.log('toolCalls:', chalk.bold.yellow(`${toolName}(${JSON.stringify(input)})`))
}
export const toolResultsLog = (x: any) => {
  const { toolName, output } = x
  console.log('toolResults:', chalk.bold.blue(`${toolName}: ${JSON.stringify(output)}`))
}

export function onStep(step: any) {
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
export async function runPredictiveAgent(task: DecisionTask, graph: Graph) {
  const policy = OPEN_POLICY
  const workspace = new DecisionWorkspace('predictive')

  const ontology = buildOntology({ version: '1.0.0' })
  // const graph = seedGraph()

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`
  systemLog(systemPrompt)
  userLog(userMessage)

  // Build tools (workspace.bindings is populated by executor via bind_fact)
  const currentFacts = workspace.getFacts()
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(workspace.bindings, policy)
  const candidateTools = createCandidateTools(workspace, policy)
  const ruleTools = createRuleTools(currentFacts, graph, policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
    ...candidateTools,
    ...ruleTools,
  }

  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(50),
    temperature: 0,
    onStepFinish: onStep,
    // onFinish: onStep,
  })

  workspace.debugLog()

  return result
}

export function makeTask(overrides: Partial<DecisionTask> & { goal: string; entryEntities: string[] }): DecisionTask {
  return {
    taskId: 'g2-test-' + Date.now(),
    mode: 'predictive',
    intent: 'risk_assessment',
    scope: {},
    policyCtx: OPEN_POLICY,
    ...overrides,
  }
}
