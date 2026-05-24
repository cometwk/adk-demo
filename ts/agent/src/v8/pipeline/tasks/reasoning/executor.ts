// ── Reasoning Executor (V8 Pipeline) ──

import { generateText, stepCountIs } from 'ai'
import type { ExecuteParams, TaskExecuteResult } from '../../core/types'
import type { ReasoningTask } from './types'
import { parseVerdict, createFallbackVerdict } from './verdict'

// ── Execute Reasoning Task ──

/**
 * Execute reasoning task with LLM agent.
 *
 * Flow:
 * 1. Build user message from task.goal + entryEntities
 * 2. Run generateText with tools and stop condition
 * 3. Extract facts from workspace
 * 4. Parse verdict from output
 * 5. Return TaskExecuteResult
 */
export async function executeReasoning(params: ExecuteParams): Promise<TaskExecuteResult> {
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

  // 3. Extract facts from workspace (note: facts are in workspace.bindings)
  // The workspace is passed via ToolParams during tool building
  // We need to get facts from somewhere - typically passed through params or accessed via runtime
  // For now, we'll assume facts are collected via tool calls and stored in workspace

  // Since we don't have direct access to workspace here, we'll return empty facts
  // The actual facts are collected during tool execution and stored in workspace
  // The PipelineContext will extract them from workspace after execute
  const facts: import('../../core/types').FactBinding[] = []

  // 4. Parse verdict
  const verdict = parseVerdict(result.text) ?? createFallbackVerdict(result.text)

  // 5. Return result
  return {
    facts,
    modelVerdict: verdict,
    rawText: result.text,
  }
}

// ── Execute with facts extraction ──

/**
 * Execute reasoning task and extract facts from workspace.
 * This version receives workspace directly for fact extraction.
 */
export async function executeReasoningWithWorkspace(
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
  const verdict = parseVerdict(result.text) ?? createFallbackVerdict(result.text)

  return {
    facts,
    modelVerdict: verdict,
    rawText: result.text,
  }
}