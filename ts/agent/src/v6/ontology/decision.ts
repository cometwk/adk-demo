import type { PolicyContext } from '../policy/context'

// ── Decision mode ──

export type DecisionMode = 'predictive' | 'diagnostic'

// ── Decision intents ──

export type DecisionIntent =
  // predictive
  | 'risk_assessment'
  | 'prioritization'
  | 'recommendation'
  | 'capacity_planning'
  | 'what_if_planning'
  // diagnostic
  | 'rca' // root cause analysis
  | 'post_mortem'
  | 'anomaly_explanation'
  | 'regression_attribution'
  | 'incident_diagnosis'
  | 'unknown'

// ── Outcome event (diagnostic mode) ──

export type OutcomeEvent = {
  entityId: string
  eventType: string // e.g. "milestone_missed" / "incident_p1"
  occurredAt: string // ISO 8601
  details?: Record<string, unknown>
}

// ── Decision task ──

export type DecisionTask = {
  taskId: string
  mode: DecisionMode
  intent: DecisionIntent
  goal: string
  scope: {
    typesOfInterest?: string[]
    maxGraphDepth?: number
    maxNodes?: number
  }
  policyCtx: PolicyContext

  // predictive
  entryEntities?: string[]

  // diagnostic (V6.5)
  outcome?: OutcomeEvent
  timeWindow?: { from: string; to: string }
}

// ── Evidence (shared by both modes) ──

export type EvidenceSourceKind =
  | 'property'
  | 'method_result'
  | 'rule_evaluation'
  | 'aggregation'
  | 'event' // V6.5 — from EventStore
  | 'causal_path' // V6.5 — traversal of CausalGraph

export type Evidence = {
  id: string
  sourceKind: EvidenceSourceKind
  entityIds: string[]
  relatedRuleIds: string[]
  content: string
  confidence: number // 0..1; base from source kind, LLM modifier ∈ {-0.2, 0, +0.2}
  observedAt?: string // timestamp for time-aware evidence
}

// ── Uncertainty ──

export type Uncertainty = {
  id: string
  description: string
  impact: 'low' | 'medium' | 'high'
  missingFacts: string[]
  nextQuery?: string
}

// ── Candidates (predictive) ──

export type CandidateAnswer = {
  id: string
  label: string // "HIGH" / "MEDIUM" / "LOW"
  description: string
  supportingEvidenceIds: string[]
}

// ── Scored candidate (from MCDA) ──

export type ScoredCandidate = {
  candidateId: string
  label: string
  rawScore: number
  normalizedScore: number
  confidence: number
  triggeredRuleIds: string[]
  blockingRuleIds: string[] // veto-triggered
  rationale: string
}

// ── Candidate causes (diagnostic / V6.5) ──

export type CausalPathRef = {
  edgeIds: string[]
  rootCauseMatcher: string
  finalEffectMatcher: string
}

export type CandidateCause = {
  id: string
  label: string
  description: string
  causalPathRef: CausalPathRef
  timelineEvidenceIds: string[]
  canCoexistWith: string[] // other cause IDs that can co-occur
}

// ── Attribution result (diagnostic) ──

export type AttributionResult = {
  causeId: string
  label: string
  necessity: number // 0..1 — but-for test: P(¬outcome | ¬cause)
  sufficiency: number // 0..1 — P(outcome | cause alone)
  pathCompleteness: number // 0..1 — evidence completeness along causal path
  temporalPlausibility: number // 0..1 — cause precedes outcome within typicalLag
  attributionScore: number // 0..1 composite (not forced to sum=1)
  confidence: number
  rationale: string
}

// ── Verdicts ──

export type SystemVerdict_Predictive = {
  source: 'system'
  mode: 'predictive'
  ruleSetVersion: string // 规则集版本号，用于追溯和可解释性，记录裁决时使用的规则版本
  ranking: ScoredCandidate[] // 所有候选答案的完整排名列表，按分数排序，包含每个候选的得分和依据
  recommendedCandidateId: string // 系统推荐的候选答案ID，通常是 ranking[0].candidateId
  confidence: number
  vetoedLabels: string[] // 被否决规则标记的候选标签列表，如 ['ALLOW'] 表示 ALLOW 选项被否决
  notes: string[] // 系统执行过程中的备注信息，用于调试和可解释性
}

export type ModelVerdict_Predictive = {
  source: 'model'
  mode: 'predictive'
  recommendedCandidateId: string // 模型推荐的候选答案ID，指向 CandidateAnswer.id
  confidence: number
  rationale: string // 模型给出推荐的理由说明，解释为什么选择该候选答案
  citedEvidenceIds: string[] // 用的证据ID列表，指向 Evidence.id，表示模型决策依据的证据
  citedRuleIds: string[] // 引用的规则ID列表，表示模型决策时考虑的相关规则
}

export type DiagnosticVerdict = {
  source: 'system' | 'model'
  mode: 'diagnostic'
  rankedAttributions: AttributionResult[]
  overdetermined: boolean // true if top-2 attributionScores both > 0.4
  notes: string[]
  rationale?: string // model only
  citedEvidenceIds?: string[] // model only
}

// ── Reconciliation ──

export type ReconciliationLikelyCause =
  | 'missing_facts'
  | 'rule_weight_misalignment'
  | 'model_overrides_system'
  | 'system_too_coarse'
  | 'attribution_rank_mismatch'
  | 'unknown'

export type Reconciliation = {
  agree: boolean
  surfacedToUser: boolean
  diff?: {
    systemPick: string
    modelPick: string
    likelyCause: ReconciliationLikelyCause
    explanation: string
  }
}

// ── Counterfactual offers ──

export type CounterfactualMode = 'what_if' | 'but_for'

export type CounterfactualOffer = {
  id: string
  mode: CounterfactualMode
  description: string
  // what_if: fact overrides
  overrides?: Array<{ entityId: string; property: string; value: unknown }>
  // but_for: erase an event from EventStore
  eraseEventId?: string
  impactPreview?: {
    before: string
    estimatedAfter: string
    rerunCostHint: 'cheap' | 'moderate' | 'expensive'
  }
}

// ── Decision workspace (runtime state during executor loop) ──

let nextId = 0
function genId(prefix: string): string {
  return `${prefix}_${++nextId}`
}

export class DecisionWorkspace {
  readonly mode: DecisionMode
  private candidates = new Map<string, CandidateAnswer>()
  private causes = new Map<string, CandidateCause>()
  private evidence = new Map<string, Evidence>()
  private uncertainties = new Map<string, Uncertainty>()
  private triggeredRuleIds = new Set<string>()
  modelVerdict_predictive?: ModelVerdict_Predictive
  modelVerdict_diagnostic?: DiagnosticVerdict

  constructor(mode: DecisionMode) {
    this.mode = mode
  }

  // ── Candidates (predictive) ──

  addCandidate(label: string, description: string): CandidateAnswer {
    const id = genId('cand')
    const c: CandidateAnswer = {
      id,
      label,
      description,
      supportingEvidenceIds: [],
    }
    this.candidates.set(id, c)
    return c
  }

  getCandidate(id: string): CandidateAnswer | undefined {
    return this.candidates.get(id)
  }
  listCandidates(): CandidateAnswer[] {
    return [...this.candidates.values()]
  }

  // ── Causes (diagnostic) ──

  addCause(input: Omit<CandidateCause, 'id'>): CandidateCause {
    const id = genId('cause')
    const c: CandidateCause = { id, ...input }
    this.causes.set(id, c)
    return c
  }

  getCause(id: string): CandidateCause | undefined {
    return this.causes.get(id)
  }
  listCauses(): CandidateCause[] {
    return [...this.causes.values()]
  }

  // ── Evidence ──

  addEvidence(input: Omit<Evidence, 'id'>): Evidence {
    const id = genId('ev')
    const ev: Evidence = { id, ...input }
    this.evidence.set(id, ev)
    for (const ruleId of input.relatedRuleIds) this.triggeredRuleIds.add(ruleId)
    return ev
  }

  getEvidence(id: string): Evidence | undefined {
    return this.evidence.get(id)
  }
  listEvidence(): Evidence[] {
    return [...this.evidence.values()]
  }
  linkEvidenceToCandidate(candidateId: string, evidenceId: string): boolean {
    const c = this.candidates.get(candidateId)
    const ev = this.evidence.get(evidenceId)
    if (!c || !ev) return false
    if (!c.supportingEvidenceIds.includes(evidenceId)) c.supportingEvidenceIds.push(evidenceId)
    return true
  }

  // ── Uncertainties ──

  addUncertainty(input: Omit<Uncertainty, 'id'>): Uncertainty {
    const id = genId('unc')
    const u: Uncertainty = { id, ...input }
    this.uncertainties.set(id, u)
    return u
  }

  listUncertainties(): Uncertainty[] {
    return [...this.uncertainties.values()]
  }

  // ── Triggered rules ──

  addTriggeredRule(ruleId: string): void {
    this.triggeredRuleIds.add(ruleId)
  }
  listTriggeredRules(): string[] {
    return [...this.triggeredRuleIds]
  }
}

export function resetIdCounter(): void {
  nextId = 0
}

// ── Full decision response ──

export type DecisionResponse = {
  taskId: string
  mode: DecisionMode
  systemVerdict: SystemVerdict_Predictive | DiagnosticVerdict
  modelVerdict: ModelVerdict_Predictive | DiagnosticVerdict
  reconciliation: Reconciliation
  evidence: Evidence[]
  uncertainties: Uncertainty[]
  counterfactuals: CounterfactualOffer[]
  traceId: string
  feedbackToken: string
}
