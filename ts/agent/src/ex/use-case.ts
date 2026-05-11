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
import { Graph } from '../v6/runtime/graph'

import { makeTask, onStep, systemLog, userLog } from '../v6/helper'
import { seedGraph } from './seed'

// 只读
const graph = seedGraph()

/*
 * 场景 S1：2 跳跨实体参数传递 — 允许借阅
 *
 * 小红（basic 卡，0 借，无逾期，在西馆）申请借阅《人类简史》（历史类，90 天）。
 * 全部约束不触发。
 *
 * Agent 必须：
 *   1. inspect_node(xiao_hong) → currentBorrowCount, membershipLevel
 *   2. query_neighbors(xiao_hong, registered_at) → branch_west
 *   3. inspect_node(branch_west) → maxBorrowPerReader = 3
 *   4. call_method(xiao_hong, checkBorrowEligibility, { branchMaxBorrow: 3 })
 *
 * 验证点：Agent 能从 Branch 节点取得参数，再传入 Reader 方法（不能盲传 0）。
 */

// 'S1: 2跳参数传递 + 无阻断 → 允许借阅',
export const S1 = newAgentContext({
  taskId: 'S1',
  goal: '评估小红是否能借阅《人类简史》',
  entryEntities: ['xiao_hong', 'book_sapiens'],
})

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
  // const graph = seedGraph()

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

  systemLog(systemPrompt)
  userLog(userMessage)

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
    stopWhen: stepCountIs(30),
    temperature: 0,
    onStepFinish: onStep,
  })
  // ctx.workspace.debugLog()
  return result
}
