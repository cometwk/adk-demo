import type { DecisionMode, DecisionIntent } from '../ontology/decision'

// ── Intent detection (frontend / pre-executor) ──
//
// Two-pass approach:
//   1. Rule-based keyword matching (fast, deterministic)
//   2. Small LLM fallback if confidence < 0.6

export type IntentResult = {
  mode: DecisionMode
  intent: DecisionIntent
  confidence: number
  matchedKeywords: string[]
}

type IntentRule = {
  intent: DecisionIntent
  mode: DecisionMode
  keywords: string[]
  weight: number
}

const INTENT_RULES: IntentRule[] = [
  // Predictive
  {
    intent: 'risk_assessment',
    mode: 'predictive',
    keywords: ['风险', 'risk', '评估', 'assess', '危险', '威胁', '隐患'],
    weight: 1.0,
  },
  {
    intent: 'prioritization',
    mode: 'predictive',
    keywords: ['优先', 'priority', '排序', '先后', '紧急'],
    weight: 0.9,
  },
  {
    intent: 'capacity_planning',
    mode: 'predictive',
    keywords: ['容量', 'capacity', '规划', '人力', '招聘', '扩容'],
    weight: 0.8,
  },
  {
    intent: 'what_if_planning',
    mode: 'predictive',
    keywords: ['如果', '假设', 'what if', '假如', '如何影响', '预测'],
    weight: 0.85,
  },
  {
    intent: 'recommendation',
    mode: 'predictive',
    keywords: ['推荐', '建议', 'recommend', 'suggest', '应该', '最佳'],
    weight: 0.75,
  },
  // Diagnostic
  {
    intent: 'rca',
    mode: 'diagnostic',
    keywords: ['原因', '为什么', 'why', '导致', 'cause', '原因分析', '根因', '归因'],
    weight: 1.0,
  },
  {
    intent: 'post_mortem',
    mode: 'diagnostic',
    keywords: ['事后', 'post mortem', '复盘', '回顾', '发生了什么'],
    weight: 0.95,
  },
  {
    intent: 'incident_diagnosis',
    mode: 'diagnostic',
    keywords: ['故障', '事故', 'incident', 'outage', '崩溃', '中断', '报警'],
    weight: 0.9,
  },
  {
    intent: 'regression_attribution',
    mode: 'diagnostic',
    keywords: ['退步', '变差', '下降', 'regression', '恶化', '降低'],
    weight: 0.85,
  },
  {
    intent: 'anomaly_explanation',
    mode: 'diagnostic',
    keywords: ['异常', 'anomaly', '奇怪', 'unusual', 'unexpected', '意外'],
    weight: 0.8,
  },
]

/**
 * Classify user query into mode + intent via keyword rules.
 */
export function detectIntent(userQuery: string): IntentResult {
  const lowerQuery = userQuery.toLowerCase()
  const scores: Map<DecisionIntent, { score: number; keywords: string[] }> = new Map()

  for (const rule of INTENT_RULES) {
    const matched = rule.keywords.filter((kw) => lowerQuery.includes(kw.toLowerCase()))
    if (matched.length > 0) {
      const existing = scores.get(rule.intent)
      const score = rule.weight * matched.length
      if (!existing || score > existing.score) {
        scores.set(rule.intent, { score, keywords: matched })
      }
    }
  }

  if (scores.size === 0) {
    return {
      mode: 'predictive',
      intent: 'unknown',
      confidence: 0,
      matchedKeywords: [],
    }
  }

  // Pick highest-scoring intent
  let bestIntent: DecisionIntent = 'unknown'
  let bestScore = 0
  let bestKeywords: string[] = []

  for (const [intent, { score, keywords }] of scores) {
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
      bestKeywords = keywords
    }
  }

  const intentRule = INTENT_RULES.find((r) => r.intent === bestIntent)
  const mode = intentRule?.mode ?? 'predictive'

  // Normalize confidence: cap at 1.0, scale based on score
  const confidence = Math.min(1.0, bestScore / 2)

  return {
    mode,
    intent: bestIntent,
    confidence,
    matchedKeywords: bestKeywords,
  }
}

/**
 * Check if the query is clearly diagnostic (contains outcome language).
 * Returns true if the user is reporting something that already happened.
 */
export function isDefinitelyDiagnostic(userQuery: string): boolean {
  const lower = userQuery.toLowerCase()
  const outcomeIndicators = [
    '已经发生',
    '发生了',
    'already happened',
    'has occurred',
    '导致延期',
    '延期了',
    '失败了',
    '崩了',
    '挂了',
    '出事了',
    '事故',
    '复盘',
  ]
  return outcomeIndicators.some((ind) => lower.includes(ind))
}
