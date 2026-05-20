import { randomUUID } from 'crypto'
import type { DecisionTask, DecisionResponse, OutcomeEvent } from './ontology/decision'
import type { Graph } from './provider/in-memory'
import type { FactStore, EventStore } from './runtime/eventStore'
import type { Ontology } from './ontology/schema'
import type { CausalGraph } from './ontology/causal'
import type { PolicyContext } from './policy/context'
import { OPEN_POLICY } from './policy/context'
import { runPredictiveExecutor, runDiagnosticExecutor } from './agent/executor'
import { runCritic } from './agent/critic'
import { reconcilePredictive, reconcileDiagnostic } from './agent/reconciler'
import { getCounterfactualOffers, resetCounterfactuals } from './agent/tools/counterfactual'
import { frontEnd } from './frontend/index'
import { detectIntent } from './frontend/intent'
import { saveTrace } from './runtime/trace'
import type { DecisionTrace } from './runtime/trace'
import type { ScoringProfile } from './ontology/scoring'

// ── Public API ──

export type RunDecisionOptions = {
  graph: Graph
  ontology: Ontology
  factStore?: FactStore // predictive: initial facts; if omitted, executor starts fresh
  eventStore?: EventStore // diagnostic: required
  causalGraph?: CausalGraph // diagnostic: required
  scoringProfile?: ScoringProfile // domain-specific direction mapping; falls back to DEFAULT_RISK_SCORING_PROFILE
  policyCtx?: PolicyContext
  modelId?: string
  verbose?: boolean
}

export type RunDecisionInput = {
  userQuery: string
  /** Explicit entry entity IDs — skips entity linker when provided (backward compat). */
  entryEntities?: string[]
  /** Alias table for entity linker, e.g. { '小明': 'xiao_ming' }. */
  aliases?: Record<string, string>
  outcome?: OutcomeEvent // for diagnostic; required if mode=diagnostic
  timeWindow?: { from: string; to: string }
} & RunDecisionOptions

export async function runDecisionAssistant(input: RunDecisionInput): Promise<DecisionResponse> {
  const startedAt = new Date().toISOString()
  const traceId = randomUUID()
  const feedbackToken = randomUUID()

  const {
    userQuery,
    graph,
    ontology,
    factStore,
    eventStore,
    causalGraph,
    scoringProfile,
    policyCtx = OPEN_POLICY,
    modelId = 'gpt-4o',
    verbose = false,
  } = input

  // ── Frontend: intent classification + entity linking ──
  //
  // When the caller provides explicit entryEntities, we still run the frontend
  // for intent classification but use the caller-supplied IDs as contextual
  // priority hints and merge them into the final entity list.
  const frontEndResult = await frontEnd(userQuery, graph, ontology, {
    contextualEntityIds: input.entryEntities,
    aliases: input.aliases,
    policyCtx,
  })

  if (frontEndResult.kind === 'clarify') {
    // Clarification needed — surface structured questions instead of running the pipeline.
    // As a simple fallback for programmatic callers that don't handle clarify,
    // we fall back to a minimal task using keyword-only intent detection.
    const fallbackIntent = detectIntent(userQuery)
    if (verbose) {
      console.log(
        `[V6] Clarification needed (${frontEndResult.questions.length} questions). Falling back to keyword intent.`,
      )
      for (const q of frontEndResult.questions) {
        console.log(`  [clarify] ${q.type}: ${q.prompt}`)
      }
    }
    // Build a minimal task from keyword detection + caller-supplied entities
    const task: DecisionTask = {
      taskId: randomUUID(),
      mode: fallbackIntent.mode,
      intent: fallbackIntent.intent,
      goal: userQuery,
      scope: { typesOfInterest: ontology.types.map((t) => t.name) },
      policyCtx,
      entryEntities: input.entryEntities ?? [],
      outcome: input.outcome,
      timeWindow: input.timeWindow,
    }
    return runTaskSession(task, { graph, ontology, factStore, eventStore, causalGraph, scoringProfile, modelId, traceId, feedbackToken, startedAt, verbose })
  }

  // Merge caller-supplied entryEntities into the linker's result (backward compat)
  const task: DecisionTask = {
    ...frontEndResult.task,
    entryEntities: input.entryEntities?.length
      ? [...new Set([...(frontEndResult.task.entryEntities ?? []), ...input.entryEntities])]
      : frontEndResult.task.entryEntities,
    outcome: input.outcome,
    timeWindow: input.timeWindow,
  }

  if (verbose) {
    console.log(
      `[V6] mode=${task.mode} intent=${task.intent} entryEntities=[${task.entryEntities?.join(', ')}]`,
    )
  }

  return runTaskSession(task, { graph, ontology, factStore, eventStore, causalGraph, scoringProfile, modelId, traceId, feedbackToken, startedAt, verbose })
}

// ── Session dispatcher ──

type SessionContext = {
  graph: Graph
  ontology: Ontology
  factStore?: FactStore
  eventStore?: EventStore
  causalGraph?: CausalGraph
  scoringProfile?: ScoringProfile
  modelId: string
  traceId: string
  feedbackToken: string
  startedAt: string
  verbose: boolean
}

async function runTaskSession(task: DecisionTask, ctx: SessionContext): Promise<DecisionResponse> {
  const { graph, ontology, factStore, eventStore, causalGraph, scoringProfile, modelId, traceId, feedbackToken, startedAt, verbose } = ctx

  if (task.mode === 'predictive') {
    return runPredictiveSession(task, graph, ontology, factStore, scoringProfile, modelId, traceId, feedbackToken, startedAt, verbose)
  } else {
    if (!eventStore || !causalGraph) {
      throw new Error('Diagnostic mode requires eventStore and causalGraph')
    }
    return runDiagnosticSession(
      task,
      graph,
      ontology,
      eventStore,
      causalGraph,
      modelId,
      traceId,
      feedbackToken,
      startedAt,
      verbose
    )
  }
}

// ── Predictive session ──

async function runPredictiveSession(
  task: DecisionTask,
  graph: Graph,
  ontology: Ontology,
  initialFacts: FactStore | undefined,
  scoringProfile: ScoringProfile | undefined,
  modelId: string,
  traceId: string,
  feedbackToken: string,
  startedAt: string,
  verbose: boolean
): Promise<DecisionResponse> {
  const { FactStore: FS } = await import('./runtime/eventStore')
  const facts = initialFacts ?? new FS()

  // Executor: LLM-driven fact collection + candidate proposal
  const execResult = await runPredictiveExecutor(task, graph, facts, ontology, modelId)

  if (verbose) {
    console.log(
      `[V6] Executor finished: ${execResult.workspace.listCandidates().length} candidates, ${execResult.workspace.listEvidence().length} evidence items`
    )
  }

  // Critic: deterministic MCDA scoring
  const criticOutput = runCritic({
    task,
    graph,
    ontology,
    facts: execResult.facts,
    candidates: execResult.workspace.listCandidates(),
    scoringProfile,
  })

  if (criticOutput.mode !== 'predictive') throw new Error('Unexpected critic mode')
  const systemVerdict = criticOutput.verdict
  const modelVerdict = execResult.modelVerdict

  // Reconciliation
  const reconciliation = reconcilePredictive(systemVerdict, modelVerdict)

  if (verbose && !reconciliation.agree) {
    console.log(
      `[V6] Conflict: system=${systemVerdict.recommendedCandidateId} model=${modelVerdict.recommendedCandidateId} cause=${reconciliation.diff?.likelyCause}`
    )
  }

  const finishedAt = new Date().toISOString()
  const counterfactuals = getCounterfactualOffers()
  resetCounterfactuals()

  // Save trace
  const trace: DecisionTrace = {
    traceId,
    sessionId: task.taskId,
    mode: 'predictive',
    ontologyVersion: ontology.version,
    ruleSetVersion: ontology.version,
    goal: task.goal,
    entryEntities: task.entryEntities ?? [],
    toolCalls: [],
    factSnapshot: execResult.facts.all(),
    systemVerdictId: systemVerdict.recommendedCandidateId,
    modelVerdictId: modelVerdict.recommendedCandidateId,
    reconciliationAgreed: reconciliation.agree,
    startedAt,
    finishedAt,
  }
  saveTrace(trace)

  return {
    taskId: task.taskId,
    mode: 'predictive',
    systemVerdict,
    modelVerdict,
    reconciliation,
    evidence: execResult.workspace.listEvidence(),
    uncertainties: execResult.workspace.listUncertainties(),
    counterfactuals,
    traceId,
    feedbackToken,
  }
}

// ── Diagnostic session ──

async function runDiagnosticSession(
  task: DecisionTask,
  graph: Graph,
  ontology: Ontology,
  eventStore: EventStore,
  causalGraph: CausalGraph,
  modelId: string,
  traceId: string,
  feedbackToken: string,
  startedAt: string,
  verbose: boolean
): Promise<DecisionResponse> {
  // Executor: LLM-driven event reconstruction + cause proposal
  const execResult = await runDiagnosticExecutor(task, graph, eventStore, ontology, causalGraph, modelId)

  if (verbose) {
    console.log(`[V6.5] Executor finished: ${execResult.workspace.listCauses().length} candidate causes`)
  }

  // Critic: deterministic attribution scoring
  const criticOutput = runCritic({
    task,
    graph,
    ontology,
    eventStore,
    causalGraph,
    candidateCauses: execResult.workspace.listCauses(),
  })

  if (criticOutput.mode !== 'diagnostic') throw new Error('Unexpected critic mode')
  const systemVerdict = criticOutput.verdict
  const modelVerdict = execResult.modelVerdict

  // Reconciliation
  const reconciliation = reconcileDiagnostic(systemVerdict, modelVerdict)

  const finishedAt = new Date().toISOString()
  const counterfactuals = getCounterfactualOffers()
  resetCounterfactuals()

  // Save trace
  const trace: DecisionTrace = {
    traceId,
    sessionId: task.taskId,
    mode: 'diagnostic',
    ontologyVersion: ontology.version,
    ruleSetVersion: ontology.version,
    goal: task.goal,
    entryEntities: task.outcome ? [task.outcome.entityId] : [],
    toolCalls: [],
    factSnapshot: execResult.facts.all(),
    systemVerdictId: systemVerdict.rankedAttributions[0]?.causeId ?? '',
    modelVerdictId: modelVerdict.rankedAttributions?.[0]?.causeId ?? '',
    reconciliationAgreed: reconciliation.agree,
    startedAt,
    finishedAt,
  }
  saveTrace(trace)

  return {
    taskId: task.taskId,
    mode: 'diagnostic',
    systemVerdict,
    modelVerdict,
    reconciliation,
    evidence: execResult.workspace.listEvidence(),
    uncertainties: execResult.workspace.listUncertainties(),
    counterfactuals,
    traceId,
    feedbackToken,
  }
}
