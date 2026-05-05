import { z } from 'zod'
import { model } from '../../lib/model'
import type { DecisionMode, DecisionIntent } from '../ontology/decision'
import { generateStructureOutput } from '../../lib/structure_output'

// ── Intent detection (frontend / pre-executor) ──
//
// Two-pass approach:
//   1. Rule-based keyword matching (fast, deterministic)
//   2. LLM fallback via generateObject if confidence < 0.6

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

// ── LLM fallback schema ──

const IntentSchema = z.object({
  mode: z.enum(['predictive', 'diagnostic']),
  intent: z.enum([
    'risk_assessment',
    'prioritization',
    'recommendation',
    'capacity_planning',
    'what_if_planning',
    'rca',
    'post_mortem',
    'anomaly_explanation',
    'regression_attribution',
    'incident_diagnosis',
  ]),
  confidence: z.number().min(0).max(1),
})

async function classifyIntentWithLLM(userQuery: string, ruleResult: IntentResult): Promise<IntentResult> {
  const  object  = await generateStructureOutput({
    schema: IntentSchema,
    prompt: `将用户问题分类为决策意图。

规则系统初步判断: mode=${ruleResult.mode}, intent=${ruleResult.intent}, confidence=${ruleResult.confidence.toFixed(2)}

用户问题: "${userQuery}"

predictive 意图（前向预测/评估未来）:
  risk_assessment    — 风险评估
  prioritization     — 优先级排序
  recommendation     — 推荐建议
  capacity_planning  — 容量/人力规划
  what_if_planning   — 假设情景分析

diagnostic 意图（后向归因/解释已发生的事）:
  rca                    — 根因分析
  post_mortem            — 事后复盘
  anomaly_explanation    — 异常解释
  regression_attribution — 退步归因
  incident_diagnosis     — 事故诊断

请以 JSON 格式输出最匹配的 mode、intent 和置信度。`,
  })

  return {
    mode: object.mode,
    intent: object.intent,
    confidence: object.confidence,
    matchedKeywords: ruleResult.matchedKeywords,
  }
}

// ── Public API ──

/**
 * Classify user query into mode + intent.
 * Two-pass: keyword rules first, LLM fallback if confidence < 0.6.
 */
export async function classifyIntent(userQuery: string): Promise<IntentResult> {
  let ruleResult = detectIntent(userQuery)
  if (ruleResult.confidence < 0.8)  {
    ruleResult = await classifyIntentWithLLM(userQuery, ruleResult)
  }
  return ruleResult
}

/**
 * Classify user query into mode + intent via keyword rules (synchronous, deterministic).
 * Use classifyIntent() for the full two-pass version with LLM fallback.
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
