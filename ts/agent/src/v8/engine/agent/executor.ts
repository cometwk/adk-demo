import { generateText, stepCountIs } from 'ai'
import type { GraphStore } from '../stores/graph-store'
import type { ComputeStore } from '../stores/compute-store'
import type { VectorStore } from '../stores/vector-store'
import type { RuntimeConfig } from '../runtime/config'
import type { PolicyContext } from '../../policy/context'
import { SemanticRuntimeOrchestrator } from '../runtime/orchestrator'
import { Workspace } from '../runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG } from '../runtime/config'
import { OPEN_POLICY } from '../../policy/context'
import { buildSemanticReasoningPrompt } from './prompt'
import { parseVerdict, createFallbackVerdict, type AgentResult, type SemanticVerdict } from './verdict'
import { createGraphTools } from '../tools/graph-tools'
import { createComputeTools } from '../tools/compute-tools'
import { createVectorTools } from '../tools/vector-tools'
import { createFactTools } from '../tools/fact-tools'
import { createCandidateTools } from '../tools/candidate-tools'
import { model } from '../../../lib/model'

// ── Agent Reasoning Task ──

export type ReasoningTask = {
  goal: string // User's question/goal
  entryEntities?: string[] // Optional starting entity IDs
  policy?: PolicyContext // Optional policy context
}

// ── Agent Executor ──

/**
 * Run Semantic Reasoning Agent.
 *
 * Flow:
 * 1. Initialize Workspace
 * 2. Create RuntimeOrchestrator with stores and workspace
 * 3. Build tools (routing through RuntimeOrchestrator)
 * 4. Run generateText with tools
 * 5. Parse verdict from output
 *
 * @param task - Reasoning task with goal and optional params
 * @param graphStore - GraphStore instance (Traversal)
 * @param computeStore - ComputeStore instance (OLAP)
 * @param vectorStore - VectorStore instance (Semantic search)
 * @param dataSources - Available compute data sources
 * @returns AgentResult with facts, verdict, and raw output
 */
export async function runSemanticReasoningAgent(
  task: ReasoningTask,
  graphStore: GraphStore,
  computeStore: ComputeStore,
  vectorStore: VectorStore,
  dataSources: string[] = ['OrderDaily', 'ProfitDaily'],
  config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
): Promise<AgentResult> {
  const workspace = new Workspace()
  const policy = task.policy ?? OPEN_POLICY

  // Create orchestrator with workspace (runtime will inject facts into this workspace)
  const runtime = new SemanticRuntimeOrchestrator(
    graphStore,
    computeStore,
    vectorStore,
    workspace,
    config,
    policy,
  )

  // Build system prompt
  const systemPrompt = buildSemanticReasoningPrompt({ dataSources })

  // Build user message
  const entryEntities = task.entryEntities ?? []
  const userMessage = entryEntities.length > 0
    ? `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
    : task.goal

  // Build tools - all route through runtime
  const graphTools = createGraphTools(runtime)
  const computeTools = createComputeTools(runtime)
  const vectorTools = createVectorTools(runtime)
  const factTools = createFactTools(workspace, policy)
  const candidateTools = createCandidateTools(workspace, policy)

  const tools = {
    ...graphTools,
    ...computeTools,
    ...vectorTools,
    ...factTools,
    ...candidateTools,
  }

  // Run agent
  const result = await generateText({
    model: model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  // Parse verdict
  const verdict = parseVerdict(result.text) ?? createFallbackVerdict(result.text)

  return {
    facts: workspace.allBindings(),
    verdict,
    rawText: result.text,
  }
}

// Re-export types
export { type SemanticVerdict, type AgentResult } from './verdict'