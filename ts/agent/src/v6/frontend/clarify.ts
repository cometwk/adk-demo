import type { EntityLinkResult } from './entityLinker'
import type { DecisionTask, DecisionIntent, DecisionMode } from '../ontology/decision'
import type { OPEN_POLICY } from '../policy/context'

// ── Clarification (frontend) ──
//
// When the entity linker returns multiple ambiguous candidates,
// or when intent confidence is low, the frontend generates a structured
// clarification question (not free-form chat).

export type ClarifyOption = {
  id: string
  label: string
  description?: string
}

export type ClarifyQuestion = {
  id: string
  type: 'entity_select' | 'intent_confirm' | 'time_window' | 'outcome_describe'
  prompt: string
  options?: ClarifyOption[] // for structured choice; null = free text
  required: boolean
}

export type ClarifySession = {
  questions: ClarifyQuestion[]
  resolved: Map<string, string> // questionId → chosen value
}

let _questionId = 0
function qid(): string {
  return `q_${++_questionId}`
}

// ── Clarify entity ambiguity ──

export function buildEntityClarification(mentionedName: string, candidates: EntityLinkResult[]): ClarifyQuestion {
  return {
    id: qid(),
    type: 'entity_select',
    prompt: `"${mentionedName}" 匹配到多个实体，请选择：`,
    options: candidates.map((c) => ({
      id: c.entityId,
      label: `${c.entityId} (${c.typeName})`,
      description: `匹配度 ${(c.confidence * 100).toFixed(0)}%`,
    })),
    required: true,
  }
}

// ── Clarify intent when confidence is low ──

export function buildIntentClarification(detectedIntent: DecisionIntent): ClarifyQuestion {
  return {
    id: qid(),
    type: 'intent_confirm',
    prompt: `我理解你的问题是"${describeIntent(detectedIntent)}"，对吗？`,
    options: [
      { id: 'yes', label: '对，继续' },
      { id: 'predictive_risk', label: '不对——我想做风险评估（前向预测）' },
      { id: 'diagnostic_rca', label: '不对——我想找原因（后向归因）' },
      { id: 'other', label: '都不对，我重新描述' },
    ],
    required: false,
  }
}

// ── Clarify diagnostic outcome ──

export function buildOutcomeClarification(): ClarifyQuestion {
  return {
    id: qid(),
    type: 'outcome_describe',
    prompt: '请描述已经发生的事件（结果）：',
    options: undefined, // free text
    required: true,
  }
}

// ── Clarify time window (diagnostic) ──

export function buildTimeWindowClarification(): ClarifyQuestion {
  return {
    id: qid(),
    type: 'time_window',
    prompt: '请指定归因分析的时间范围（开始日期 → 结束日期）：',
    options: [
      { id: 'last_week', label: '过去 7 天' },
      { id: 'last_month', label: '过去 30 天' },
      { id: 'last_quarter', label: '过去 90 天' },
      { id: 'custom', label: '自定义（请告知具体日期）' },
    ],
    required: false,
  }
}

// ── Helper ──

function describeIntent(intent: DecisionIntent): string {
  const descriptions: Record<DecisionIntent, string> = {
    risk_assessment: '风险评估',
    prioritization: '优先级排序',
    recommendation: '推荐建议',
    capacity_planning: '容量规划',
    what_if_planning: '假设情景分析',
    rca: '根因分析',
    post_mortem: '事后复盘',
    anomaly_explanation: '异常解释',
    regression_attribution: '退步归因',
    incident_diagnosis: '事故诊断',
    unknown: '未知意图',
  }
  return descriptions[intent] ?? intent
}

// ── Resolve clarification responses to DecisionTask fields ──

export function resolveTimeWindow(optionId: string): {
  from: string
  to: string
} {
  const now = new Date()
  const to = now.toISOString()
  const dayMs = 86400000

  switch (optionId) {
    case 'last_week':
      return { from: new Date(now.getTime() - 7 * dayMs).toISOString(), to }
    case 'last_month':
      return { from: new Date(now.getTime() - 30 * dayMs).toISOString(), to }
    case 'last_quarter':
      return { from: new Date(now.getTime() - 90 * dayMs).toISOString(), to }
    default:
      return { from: new Date(now.getTime() - 30 * dayMs).toISOString(), to }
  }
}

export type PartialTaskOverrides = Partial<
  Pick<DecisionTask, 'mode' | 'intent' | 'entryEntities' | 'outcome' | 'timeWindow'>
>

export function applyIntentClarification(
  optionId: string,
  current: PartialTaskOverrides
): PartialTaskOverrides & { mode: DecisionMode; intent: DecisionIntent } {
  switch (optionId) {
    case 'predictive_risk':
      return { ...current, mode: 'predictive', intent: 'risk_assessment' }
    case 'diagnostic_rca':
      return { ...current, mode: 'diagnostic', intent: 'rca' }
    default:
      return {
        ...current,
        mode: current.mode ?? 'predictive',
        intent: current.intent ?? 'unknown',
      }
  }
}
