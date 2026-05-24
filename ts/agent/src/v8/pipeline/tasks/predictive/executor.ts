// ── Predictive Executor (V8 Pipeline) ──

import { generateText, stepCountIs } from 'ai'
import type { ExecuteParams, TaskExecuteResult } from '../../core/types'
import { parsePredictiveVerdict } from './types'

// ── Execute Predictive Task ──

/**
 * Execute predictive task with LLM agent.
 *
 * Flow:
 * 1. Build user message from task.goal + entryEntities
 * 2. Run generateText with tools
 * 3. Extract facts (handled by tool calls)
 * 4. Parse ModelVerdict_Predictive from output
 * 5. Return TaskExecuteResult
 */
export async function executePredictive(params: ExecuteParams): Promise<TaskExecuteResult> {
  const { task, systemPrompt, tools, model } = params

  // 1. Build user message
  const entryEntities = task.entryEntities ?? []
  const userMessage = entryEntities.length > 0
    ? `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
    : task.goal

  // 2. Run agent
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  // 3. Extract facts - collected via tool calls (bind_fact, record_evidence)
  // Note: facts are in workspace.bindings, which is handled by PipelineContext
  const facts: import('../../core/types').FactBinding[] = []

  // 4. Parse verdict
  const verdict = parsePredictiveVerdict(result.text)

  // 5. Return result
  return {
    facts,
    modelVerdict: verdict ?? {
      source: 'model',
      mode: 'predictive',
      recommendedCandidateId: '',
      confidence: 0,
      rationale: result.text,
      citedEvidenceIds: [],
      citedRuleIds: [],
    },
    rawText: result.text,
  }
}

// ── Execute with facts extraction ──

/**
 * Execute predictive task and extract facts from workspace.
 */
export async function executePredictiveWithWorkspace(
  params: ExecuteParams,
  workspace: import('../../../engine/runtime/workspace').Workspace,
): Promise<TaskExecuteResult> {
  const { task, systemPrompt, tools, model } = params

  // Build user message
  const entryEntities = task.entryEntities ?? []
  const userMessage = entryEntities.length > 0
    ? `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
    : task.goal

  // Run agent
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  // Extract facts from workspace
  const facts = workspace.allBindings()

  // Parse verdict
  const verdict = parsePredictiveVerdict(result.text)

  return {
    facts,
    modelVerdict: verdict ?? {
      source: 'model',
      mode: 'predictive',
      recommendedCandidateId: '',
      confidence: 0,
      rationale: result.text,
      citedEvidenceIds: [],
      citedRuleIds: [],
    },
    rawText: result.text,
  }
}