// ── Diagnostic Executor (V8 Pipeline) ──

import { generateText, stepCountIs } from 'ai'
import type { ExecuteParams, TaskExecuteResult } from '../../core/types'
import { parseDiagnosticVerdict } from './types'

// ── Execute Diagnostic Task ──

/**
 * Execute diagnostic task with LLM agent.
 *
 * Flow:
 * 1. Build user message from task.goal + entryEntities + outcome
 * 2. Run generateText with tools
 * 3. Extract facts (handled by tool calls)
 * 4. Parse DiagnosticVerdict from output
 * 5. Return TaskExecuteResult
 */
export async function executeDiagnostic(params: ExecuteParams): Promise<TaskExecuteResult> {
  const { task, systemPrompt, tools, model } = params

  // 1. Build user message
  const entryEntities = task.entryEntities ?? []
  const context = task.context as any
  const outcome = context?.outcome

  let userMessage = ''
  if (outcome) {
    userMessage = `观测到的结果：${outcome.eventType} 发生于 ${outcome.entityId} 在 ${outcome.occurredAt}。\n问题：${task.goal}`
  } else if (entryEntities.length > 0) {
    userMessage = `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
  } else {
    userMessage = task.goal
  }

  // 2. Run agent
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(30),
    temperature: 0,
  })

  // 3. Extract facts - collected via tool calls
  const facts: import('../../core/types').FactBinding[] = []

  // 4. Parse verdict
  const verdict = parseDiagnosticVerdict(result.text)

  // 5. Return result
  return {
    facts,
    modelVerdict: verdict ?? {
      source: 'model',
      mode: 'diagnostic',
      rankedAttributions: [],
      overdetermined: false,
      notes: ['无法解析归因结果'],
      rationale: result.text,
    },
    rawText: result.text,
  }
}

// ── Execute with facts extraction ──

/**
 * Execute diagnostic task and extract facts from workspace.
 */
export async function executeDiagnosticWithWorkspace(
  params: ExecuteParams,
  workspace: import('../../../engine/runtime/workspace').Workspace,
): Promise<TaskExecuteResult> {
  const { task, systemPrompt, tools, model } = params

  // Build user message
  const entryEntities = task.entryEntities ?? []
  const context = task.context as any
  const outcome = context?.outcome

  let userMessage = ''
  if (outcome) {
    userMessage = `观测到的结果：${outcome.eventType} 发生于 ${outcome.entityId} 在 ${outcome.occurredAt}。\n问题：${task.goal}`
  } else if (entryEntities.length > 0) {
    userMessage = `请分析以下实体：${entryEntities.join(', ')}。\n问题：${task.goal}`
  } else {
    userMessage = task.goal
  }

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
  const verdict = parseDiagnosticVerdict(result.text)

  return {
    facts,
    modelVerdict: verdict ?? {
      source: 'model',
      mode: 'diagnostic',
      rankedAttributions: [],
      overdetermined: false,
      notes: ['无法解析归因结果'],
      rationale: result.text,
    },
    rawText: result.text,
  }
}