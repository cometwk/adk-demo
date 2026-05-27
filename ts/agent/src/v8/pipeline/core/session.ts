// ── Pipeline Session ──
// 多轮对话状态管理，支持首次任务执行后继续对话

import { generateText, stepCountIs, type ModelMessage } from 'ai'
import type { LanguageModel, Tool } from 'ai'
import { SemanticRuntimeOrchestrator } from '../../engine/runtime/orchestrator'
import { Workspace } from '../../engine/runtime/workspace'
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '../../engine/runtime/config'
import { OPEN_POLICY, type PolicyContext } from '../../policy/context'
import type { GraphStore } from '../../engine/stores/graph-store'
import type { ComputeStore } from '../../engine/stores/compute-store'
import type { VectorStore } from '../../engine/stores/vector-store'
import type { Ontology } from '../../ontology/schema'
import type { RuleRegistry } from '../../rule/registry/registry'
import type { FactBinding } from '../../engine/runtime/types'
import type {
  PipelineTask,
  PipelineResult,
  TaskPlugin,
  PromptParams,
  ToolParams,
  CritiqueParams,
  CritiqueResult,
} from './types'
import { TaskTypeNotFoundError, PromptBuildError } from './types'
import { parseVerdict, createFallbackVerdict } from '../tasks/reasoning/verdict'
import { trace } from '../../../lib/trace'

// ── Session Dependencies ──

export type SessionDeps = {
  graphStore: GraphStore
  computeStore: ComputeStore
  vectorStore: VectorStore
  ontology: Ontology
  ruleRegistry: RuleRegistry
  model: LanguageModel
  config?: RuntimeConfig
}

// ── PipelineSession ──

export class PipelineSession {
  private task: PipelineTask
  private deps: SessionDeps
  private policy: PolicyContext

  // Session state (initialized on run)
  private workspace: Workspace | null = null
  private nodeDataCache: Map<string, import('../../engine/runtime/types').NodeData> | null = null
  private runtime: SemanticRuntimeOrchestrator | null = null
  private plugin: TaskPlugin | null = null
  private systemPrompt: string | null = null
  private tools: Record<string, Tool> | null = null
  private messages: ModelMessage[] = []
  private _ran = false

  constructor(task: PipelineTask, deps: SessionDeps, policy: PolicyContext = OPEN_POLICY) {
    this.task = task
    this.deps = deps
    this.policy = policy
  }

  /**
   * 执行首次任务，等价于 runTask() 完整流程
   */
  async run(): Promise<PipelineResult> {
    // 1. Init workspace + session-scoped node cache
    this.workspace = new Workspace()
    this.nodeDataCache = new Map()

    // 2. Get plugin from registry
    // NOTE: Session receives plugin from PipelineContext.createSession
    // But we also support standalone creation via deps.plugin
    if (!this.plugin) {
      throw new TaskTypeNotFoundError(this.task.type)
    }

    // 3. Build prompt
    let systemPrompt: string
    try {
      const promptParams: PromptParams = {
        task: this.task,
        ontology: this.deps.ontology,
        rules: this.deps.ruleRegistry.list().map((r) => ({
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
      systemPrompt = this.plugin.buildPrompt(promptParams)
    } catch (err) {
      throw new PromptBuildError(this.task.type, err instanceof Error ? err : new Error(String(err)))
    }
    this.systemPrompt = systemPrompt
    trace.system(systemPrompt)

    // 4. Create runtime orchestrator
    this.runtime = new SemanticRuntimeOrchestrator(
      this.deps.graphStore,
      this.deps.computeStore,
      this.deps.vectorStore,
      this.workspace,
      this.deps.config ?? DEFAULT_RUNTIME_CONFIG,
      this.policy,
      this.nodeDataCache,
    )

    // 5. Build tools
    const toolParams: ToolParams = {
      runtime: this.runtime,
      workspace: this.workspace,
      policy: this.policy,
    }
    this.tools = this.plugin.buildTools(toolParams)

    // 6. Build user message and push to messages
    const entryEntities = this.task.entryEntities ?? []
    const userMessage = entryEntities.length > 0
      ? `请分析以下实体：${entryEntities.join(', ')}。\n问题：${this.task.goal}`
      : this.task.goal

    this.messages.push({ role: 'user', content: userMessage })

    // 7. Execute first turn
    const { rawText, responseMessages } = await this.executeTurn()
    this.messages.push(...responseMessages)

    // 8. Extract facts and verdict
    const facts = this.workspace.allBindings()
    const verdict = parseVerdict(rawText) ?? createFallbackVerdict(rawText)

    // 9. Critique (optional)
    let systemVerdict: unknown = undefined
    let reconciliation: import('./types').Reconciliation | undefined = undefined

    if (this.plugin.critique) {
      try {
        const critiqueParams: CritiqueParams = {
          task: this.task,
          facts,
          modelVerdict: verdict,
          runtime: this.runtime,
          ruleRegistry: this.deps.ruleRegistry,
          ontology: this.deps.ontology,
        }
        const critiqueResult: CritiqueResult = await this.plugin.critique(critiqueParams)
        systemVerdict = critiqueResult.systemVerdict
        reconciliation = critiqueResult.reconciliation
      } catch (err) {
        console.warn(`Critique failed for task '${this.task.type}':`, err)
      }
    }

    this._ran = true

    return {
      taskType: this.task.type,
      facts,
      modelVerdict: verdict,
      systemVerdict,
      reconciliation,
      rawText,
    }
  }

  /**
   * 追加用户消息，复用 Workspace 和 Tools，再次调用 LLM
   */
  async chat(input: string): Promise<PipelineResult> {
    if (!this._ran || !this.workspace || !this.systemPrompt || !this.tools) {
      throw new Error('Session must call run() before chat()')
    }

    // 1. Push user message
    this.messages.push({ role: 'user', content: input })

    // 2. Execute turn
    const { rawText, responseMessages } = await this.executeTurn()
    this.messages.push(...responseMessages)

    // 3. Extract facts and verdict
    const facts = this.workspace.allBindings()
    const verdict = parseVerdict(rawText) ?? createFallbackVerdict(rawText)

    return {
      taskType: this.task.type,
      facts,
      modelVerdict: verdict,
      rawText,
    }
  }

  /**
   * 返回累积的 FactBinding 快照
   */
  getFacts(): FactBinding[] {
    return this.workspace?.allBindings() ?? []
  }

  /**
   * 返回 messages 数组的只读副本
   */
  getHistory(): ModelMessage[] {
    return [...this.messages]
  }

  // ── Internal ──

  /** Set plugin (called by PipelineContext.createSession) */
  _setPlugin(plugin: TaskPlugin): void {
    this.plugin = plugin
  }

  /** Unified generateText call for both run() and chat() */
  private async executeTurn(): Promise<{ rawText: string; responseMessages: ModelMessage[] }> {
    const result = await generateText({
      model: this.deps.model,
      system: this.systemPrompt!,
      messages: this.messages,
      tools: this.tools!,
      stopWhen: stepCountIs(30),
      temperature: 0,
      onStepFinish: trace.onStep,
    })
    return { rawText: result.text, responseMessages: result.response.messages }
  }
}
