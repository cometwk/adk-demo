// ── Pipeline Context ──
// V8 Pipeline 入口类，协调 Engine + Ontology + Rule

import type { LanguageModel } from 'ai'
import type { GraphStore } from '../../engine/stores/graph-store'
import type { ComputeStore } from '../../engine/stores/compute-store'
import type { VectorStore } from '../../engine/stores/vector-store'
import { SemanticRuntimeOrchestrator } from '../../engine/runtime/orchestrator'
import { Workspace } from '../../engine/runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '../../engine/runtime/config'
import { OPEN_POLICY, type PolicyContext } from '../../policy/context'
import { model as defaultModel } from '../../../lib/model'
import type {
  TaskType,
  PipelineTask,
  PipelineResult,
  PipelineDeps,
  Frontend,
  FrontendResult,
  ClarificationRequest,
  TaskPlugin,
  PromptParams,
  ToolParams,
  ExecuteParams,
  CritiqueParams,
  CritiqueResult,
} from './types'
import { TaskTypeNotFoundError, PromptBuildError, ExecuteError } from './types'
import { TaskRegistry, InMemoryTaskRegistry } from './registry'
import { DefaultFrontend } from './frontend/index'
import { reasoningPlugin } from '../tasks/reasoning/index'
import { PipelineSession, type SessionDeps } from './session'

// ── PipelineContext ──

export class PipelineContext {
  readonly registry: TaskRegistry
  private frontend: Frontend
  private graphStore: GraphStore
  private computeStore: ComputeStore
  private vectorStore: VectorStore
  private ontology: import('../../ontology/schema').Ontology
  private ruleRegistry: import('../../rule/registry/registry').RuleRegistry
  private model: LanguageModel
  private config: RuntimeConfig

  constructor(deps: PipelineDeps) {
    this.registry = new InMemoryTaskRegistry(deps.plugins ?? [])
    this.frontend = deps.frontend ?? new DefaultFrontend(deps.graphStore, deps.ontology)
    this.graphStore = deps.graphStore
    this.computeStore = deps.computeStore
    this.vectorStore = deps.vectorStore
    this.ontology = deps.ontology
    this.ruleRegistry = deps.ruleRegistry
    this.model = deps.model ?? defaultModel
    this.config = deps.config ?? DEFAULT_RUNTIME_CONFIG

    // Register default plugins if not provided
    if (!deps.plugins || deps.plugins.length === 0) {
      this.registry.register(reasoningPlugin)
    }
  }

  /**
   * 同步执行：指定任务类型
   */
  async runTask(
    type: TaskType,
    task: Omit<PipelineTask, 'type'>,
    policy: PolicyContext = OPEN_POLICY,
  ): Promise<PipelineResult> {
    // 1. Create workspace (per-call isolation)
    const workspace = new Workspace()

    // 2. Get plugin from registry
    const plugin = this.registry.get(type)
    if (!plugin) {
      throw new TaskTypeNotFoundError(type)
    }

    // 3. Build prompt
    let systemPrompt: string
    try {
      const promptParams: PromptParams = {
        task: { ...task, type },
        ontology: this.ontology,
        rules: this.ruleRegistry.list().map((r) => ({
          id: r.id,
          version: r.version,
          kind: r.kind,
          appliesTo: r.appliesTo,
          description: r.description,
          direction: r.direction,
          weight: r.weight,
          requiredFacts: r.requiredFacts,
        })),
      }
      systemPrompt = plugin.buildPrompt(promptParams)
    } catch (err) {
      throw new PromptBuildError(type, err instanceof Error ? err : new Error(String(err)))
    }

    // 4. Create runtime orchestrator with workspace
    const runtime = new SemanticRuntimeOrchestrator(
      this.graphStore,
      this.computeStore,
      this.vectorStore,
      workspace,
      this.config,
      policy,
    )

    // 5. Build tools
    const toolParams: ToolParams = {
      runtime,
      workspace,
      policy,
    }
    const tools = plugin.buildTools(toolParams)

    // 6. Execute
    let executeResult
    try {
      const executeParams: ExecuteParams = {
        task: { ...task, type },
        systemPrompt,
        tools,
        model: this.model,
      }
      executeResult = await plugin.execute(executeParams)
    } catch (err) {
      throw new ExecuteError(type, err instanceof Error ? err : new Error(String(err)))
    }

    // 7. Critique (if present, non-blocking on failure)
    let systemVerdict: unknown = undefined
    let reconciliation: import('./types').Reconciliation | undefined = undefined

    if (plugin.critique) {
      try {
        const critiqueParams: CritiqueParams = {
          task: { ...task, type },
          facts: executeResult.facts,
          modelVerdict: executeResult.modelVerdict,
          runtime,
          ruleRegistry: this.ruleRegistry,
          ontology: this.ontology,
        }
        const critiqueResult: CritiqueResult = await plugin.critique(critiqueParams)
        systemVerdict = critiqueResult.systemVerdict
        reconciliation = critiqueResult.reconciliation
      } catch (err) {
        // Critique failure is non-blocking: proceed without systemVerdict
        console.warn(`Critique failed for task '${type}':`, err)
      }
    }

    // 8. Return PipelineResult
    return {
      taskType: type,
      facts: executeResult.facts,
      modelVerdict: executeResult.modelVerdict,
      systemVerdict,
      reconciliation,
      rawText: executeResult.rawText,
    }
  }

  /**
   * 创建多轮对话 Session
   */
  createSession(
    task: import('./types').PipelineTask,
    policy: import('../../policy/context').PolicyContext = OPEN_POLICY,
  ): PipelineSession {
    const plugin = this.registry.get(task.type)
    if (!plugin) {
      throw new TaskTypeNotFoundError(task.type)
    }

    const deps: SessionDeps = {
      graphStore: this.graphStore,
      computeStore: this.computeStore,
      vectorStore: this.vectorStore,
      ontology: this.ontology,
      ruleRegistry: this.ruleRegistry,
      model: this.model,
      config: this.config,
    }

    const session = new PipelineSession(task, deps, policy)
    session._setPlugin(plugin)
    return session
  }

  /**
   * 自动路由：Frontend 识别意图后自动分发
   * (Will be implemented in Unit 12)
   */
  async run(query: string): Promise<PipelineResult | ClarificationRequest> {
    const frontendResult = await this.frontend.process(query)
    if (frontendResult.status === 'ready') {
      return this.runTask(frontendResult.task.type, frontendResult.task)
    }
    return {
      questions: frontendResult.questions,
      originalQuery: query,
    }
  }

  /**
   * 单独澄清（当 run() 返回 ClarificationRequest 后续调）
   * (Will be implemented in Unit 12)
   */
  async runAfterClarify(
    query: string,
    answers: Record<string, string>,
  ): Promise<PipelineResult> {
    // Re-process with answers context
    const enhancedQuery = `${query}\n\n澄清信息：${Object.entries(answers)
      .map(([id, answer]) => `${id}: ${answer}`)
      .join('\n')}`
    const frontendResult = await this.frontend.process(enhancedQuery)
    if (frontendResult.status === 'ready') {
      return this.runTask(frontendResult.task.type, frontendResult.task)
    }
    throw new Error('Clarification still needed after providing answers')
  }
}

// ── Factory function ──

export function newPipelineContext(deps: PipelineDeps): PipelineContext {
  return new PipelineContext(deps)
}