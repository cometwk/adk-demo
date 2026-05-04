import { generateText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { DecisionTask, ModelVerdict_Predictive, DiagnosticVerdict } from '../ontology/decision'
import type { Ontology } from '../ontology/schema'
import type { Graph } from '../runtime/graph'
import type { FactStore } from '../runtime/eventStore'
import type { EventStore } from '../runtime/eventStore'
import { DecisionWorkspace } from '../ontology/decision'
import type { CausalGraph } from '../ontology/causal'
import { buildPredictiveSystemPrompt, buildDiagnosticSystemPrompt } from './prompt'
import { createGraphTools } from './tools/graph'
import { createMethodTools } from './tools/method'
import { createFactTools, getSessionFactStore, resetSessionFacts } from './tools/facts'
import { createRuleTools } from './tools/rules'
import { createCandidateTools } from './tools/candidates'
import { createCounterfactualTools, resetCounterfactuals } from './tools/counterfactual'
import { createEventTools } from './tools/events'
import { model } from '../../lib/model'

// ── Executor result ──

export type PredictiveExecutorResult = {
  facts: FactStore
  workspace: DecisionWorkspace
  modelVerdict: ModelVerdict_Predictive
  rawText: string
}

export type DiagnosticExecutorResult = {
  facts: FactStore
  eventStore: EventStore
  workspace: DecisionWorkspace
  modelVerdict: DiagnosticVerdict
  rawText: string
}

// ── Predictive executor ──

export async function runPredictiveExecutor(
  task: DecisionTask,
  graph: Graph,
  initialFacts: FactStore,
  ontology: Ontology,
  modelId = 'gpt-4o'
): Promise<PredictiveExecutorResult> {
  resetSessionFacts()
  resetCounterfactuals()

  const workspace = new DecisionWorkspace('predictive')
  const policy = task.policyCtx

  // Seed FactStore from graph properties (entry entities)
  for (const eid of task.entryEntities ?? []) {
    const node = graph.getNode(eid)
    if (!node) continue
    const props = node.getProperties()
    // We don't auto-bind here — the executor must explicitly bind_fact.
    // This keeps the "no blind reads" contract.
    void props
  }

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

  // Build tools (facts store starts empty; executor populates it)
  const currentFacts = getSessionFactStore()
  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(policy)
  const ruleTools = createRuleTools(currentFacts, graph, policy)
  const candidateTools = createCandidateTools(workspace, policy)
  const counterfactualTools = createCounterfactualTools(policy)

  const tools = {
    ...graphTools,
    ...methodTools,
    ...factTools,
    ...ruleTools,
    ...candidateTools,
    ...counterfactualTools,
  }

  // const openai = createOpenAI({});
  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  // Parse model verdict from last assistant message
  const modelVerdict = parseModelVerdictPredictive(result.text, workspace)

  return {
    facts: getSessionFactStore(),
    workspace,
    modelVerdict,
    rawText: result.text,
  }
}

// ── Diagnostic executor ──

export async function runDiagnosticExecutor(
  task: DecisionTask,
  graph: Graph,
  eventStore: EventStore,
  ontology: Ontology,
  causalGraph: CausalGraph,
  modelId = 'gpt-4o'
): Promise<DiagnosticExecutorResult> {
  resetSessionFacts()
  resetCounterfactuals()

  const workspace = new DecisionWorkspace('diagnostic')
  const policy = task.policyCtx
  const facts = getSessionFactStore()

  const systemPrompt = buildDiagnosticSystemPrompt(task, ontology)
  const userMessage =
    `请对以下已发生事件进行归因分析：` +
    `${task.outcome ? `${task.outcome.eventType} @ ${task.outcome.entityId} (${task.outcome.occurredAt})` : task.goal}`

  const graphTools = createGraphTools(graph, policy, facts)
  const factTools = createFactTools(policy)
  const candidateTools = createCandidateTools(workspace, policy)
  const counterfactualTools = createCounterfactualTools(policy)
  const eventTools = createEventTools(eventStore, causalGraph, workspace, policy)

  const tools = {
    ...graphTools,
    ...factTools,
    ...candidateTools,
    ...counterfactualTools,
    ...eventTools,
  }

  // const openai = createOpenAI({});
  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  const modelVerdict = parseModelVerdictDiagnostic(result.text, workspace)

  return {
    facts: getSessionFactStore(),
    eventStore,
    workspace,
    modelVerdict,
    rawText: result.text,
  }
}

// ── Verdict parsers ──

function parseModelVerdictPredictive(text: string, workspace: DecisionWorkspace): ModelVerdict_Predictive {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/)
    const jsonStr = match ? match[1] : text
    const parsed = JSON.parse(jsonStr.trim())
    const v = parsed.modelVerdict ?? parsed
    return {
      source: 'model',
      mode: 'predictive',
      recommendedCandidateId: v.recommendedCandidateId ?? '',
      confidence: v.confidence ?? 0.5,
      rationale: v.rationale ?? '',
      citedEvidenceIds: v.citedEvidenceIds ?? [],
      citedRuleIds: v.citedRuleIds ?? [],
    }
  } catch {
    // Fallback: pick first candidate
    const firstCand = workspace.listCandidates()[0]
    return {
      source: 'model',
      mode: 'predictive',
      recommendedCandidateId: firstCand?.id ?? '',
      confidence: 0.3,
      rationale: 'Failed to parse model verdict from text',
      citedEvidenceIds: [],
      citedRuleIds: [],
    }
  }
}

function parseModelVerdictDiagnostic(text: string, workspace: DecisionWorkspace): DiagnosticVerdict {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/)
    const jsonStr = match ? match[1] : text
    const parsed = JSON.parse(jsonStr.trim())
    const v = parsed.modelVerdict_diagnostic ?? parsed
    return {
      source: 'model',
      mode: 'diagnostic',
      rankedAttributions: (v.rankedCauses ?? []).map(
        (c: { causeId: string; rationale?: string; citedEvidenceIds?: string[] }) => ({
          causeId: c.causeId,
          label: workspace.getCause(c.causeId)?.label ?? c.causeId,
          necessity: 0,
          sufficiency: 0,
          pathCompleteness: 0,
          temporalPlausibility: 0,
          attributionScore: 0,
          confidence: 0.5,
          rationale: c.rationale ?? '',
        })
      ),
      overdetermined: v.overdetermined ?? false,
      notes: [],
      rationale: v.rationale,
      citedEvidenceIds: v.citedEvidenceIds,
    }
  } catch {
    return {
      source: 'model',
      mode: 'diagnostic',
      rankedAttributions: [],
      overdetermined: false,
      notes: ['Failed to parse diagnostic verdict'],
    }
  }
}
