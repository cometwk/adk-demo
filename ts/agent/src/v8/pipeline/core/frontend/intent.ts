// ── Intent Classification (V8) ──
// Two-pass: keyword rules first, LLM fallback if confidence < threshold

import { z } from 'zod'
import { generateStructureOutput } from '../../../../lib/structure_output'
import type { TaskType, IntentRule, IntentClassifyResult } from '../types'

// ── V8 Intent Rules ──
// Extends V6 with 'reasoning' task type

export const V8_INTENT_RULES: IntentRule[] = [
  // Predictive
  {
    type: 'predictive',
    keywords: ['预测', 'predict', '风险', 'risk', '评估', 'assess', '危险', '威胁', '隐患', '推荐', '建议', 'recommend', 'suggest', '应该', '最佳', '优先', 'priority', '排序', '紧急'],
    confidence: 0.7,
  },
  // Diagnostic
  {
    type: 'diagnostic',
    keywords: ['原因', '为什么', 'why', '导致', 'cause', '根因', '归因', '故障', '事故', 'incident', '崩溃', '中断', '异常', 'anomaly', '下降', 'regression', '退步', '变差'],
    confidence: 0.7,
  },
  // Reasoning (V8 extension)
  {
    type: 'reasoning',
    keywords: ['分析', '经营状况', '情况', '了解', '查看', '报告', '概况', '总结', 'describe', 'explain', '解释', '说明', '概况', 'overview', '简介', '介绍'],
    confidence: 0.6,
  },
]

// ── LLM fallback schema ──

const TaskTypeSchema = z.object({
  type: z.enum(['predictive', 'diagnostic', 'reasoning']),
  confidence: z.number().min(0).max(1),
})

// ── Keyword-based classification (fast path) ──

/**
 * Classify query via keyword rules (synchronous, deterministic).
 */
export function classifyIntentByRules(
  query: string,
  rules: IntentRule[] = V8_INTENT_RULES,
): IntentClassifyResult {
  const lowerQuery = query.toLowerCase()
  const matches: { type: TaskType; score: number; keywords: string[] }[] = []

  for (const rule of rules) {
    const matched = rule.keywords.filter((kw) => lowerQuery.includes(kw.toLowerCase()))
    if (matched.length > 0) {
      matches.push({
        type: rule.type,
        score: matched.length * rule.confidence,
        keywords: matched,
      })
    }
  }

  if (matches.length === 0) {
    return {
      type: 'reasoning', // Default fallback
      confidence: 0.3,
      source: 'rule',
    }
  }

  // Pick highest-scoring match
  const best = matches.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), matches[0])

  // Normalize confidence (cap at 1.0)
  const normalizedConfidence = Math.min(1.0, best.score / 2)

  return {
    type: best.type,
    confidence: normalizedConfidence,
    source: 'rule',
  }
}

// ── LLM fallback classification ──

/**
 * Classify query via LLM when rules have low confidence.
 */
export async function classifyIntentWithLLM(query: string): Promise<IntentClassifyResult> {
  try {
    const result = await generateStructureOutput({
      schema: TaskTypeSchema,
      prompt: `将用户问题分类为任务类型。

用户问题: "${query}"

任务类型说明:
  predictive  — 前向推断/预测/评估未来（风险评估、推荐、优先级排序）
  diagnostic  — 后向归因/解释已发生的事（根因分析、故障诊断、异常解释）
  reasoning   — 通用语义推理/分析现状/开放式问题（经营分析、概况总结、解释说明）

请以 JSON 格式输出最匹配的 type 和置信度（0-1）。`,
    })

    return {
      type: result.type,
      confidence: result.confidence,
      source: 'llm',
    }
  } catch (error) {
    // Fallback on LLM error
    console.warn('LLM intent classification failed:', error)
    return {
      type: 'reasoning',
      confidence: 0.5,
      source: 'llm',
    }
  }
}

// ── Full two-pass classification ──

/**
 * Classify user query into task type.
 * Two-pass: keyword rules first (threshold 0.6), LLM fallback if confidence < threshold.
 */
export async function classifyIntent(
  query: string,
  threshold: number = 0.6,
): Promise<IntentClassifyResult> {
  const ruleResult = classifyIntentByRules(query)
  if (ruleResult.confidence >= threshold) {
    return ruleResult
  }
  // Low confidence → LLM fallback
  return classifyIntentWithLLM(query)
}