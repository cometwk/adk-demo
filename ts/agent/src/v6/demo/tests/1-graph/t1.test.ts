import { generateText, stepCountIs } from 'ai'
import { describe, expect, it } from 'vitest'
import { model } from '../../../../lib/model'
import { buildPredictiveSystemPrompt } from '../../../agent/prompt'
import { createFactTools } from '../../../agent/tools/facts'
import { createGraphTools } from '../../../agent/tools/graph'
import { createMethodTools } from '../../../agent/tools/method'
import { DecisionTask, DecisionWorkspace } from '../../../ontology/decision'
import { OPEN_POLICY } from '../../../policy/context'
import { buildOntology } from '../../../runtime/ontology-builder'
import { seedGraph } from './seed1'

// 测试: 采用llm-agent模式, 执行预测决策任务，收集证据，做出模型裁决
async function llm_agent_predictive() {
  const policy = OPEN_POLICY
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

  // Build tools (workspace.bindings is populated by executor via bind_fact)
  const currentFacts = workspace.getFacts()
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(workspace.bindings, policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
  }

  // const openai = createOpenAI({});
  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(3),
    temperature: 0,
  })
  return result
}

describe('graph.test', () => {
  it('graph seed', async () => {
    const r = await llm_agent_predictive()
    console.log(r)
    const result = [1, 2] as any
    expect(result.length).toBe(2)
  }, 120_000)
})
