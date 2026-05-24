import type { Rule } from '../../types/rule'
import type { RuleContext, RuleResult } from '../../types/context'

// ── Library Domain Demo Rules ──
// 图书馆领域示例规则：展示 hard_constraint veto + soft_criterion scoring

// ── Hard Constraints (触发即否决) ──

/**
 * 黑名单读者不可借阅
 * 触发条件：读者在黑名单中
 * Veto: candidatesByLabel = ["ALLOWED"] — 否决所有"允许"候选
 */
export const rule_blacklist: Rule = {
  id: 'library:blacklist',
  version: '1.0',
  kind: 'hard_constraint',
  appliesTo: ['Reader'],
  description: '黑名单读者不可借阅',
  direction: 'neutral',
  veto: { candidatesByLabel: ['ALLOWED'] },
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => {
    const readerId = ctx.entityId
    if (!readerId) {
      return { triggered: false, missingFacts: [{ property: 'readerId' }] }
    }

    // Check if reader is blacklisted
    const blacklistFlag = ctx.facts.get(readerId, 'blacklisted')
    if (blacklistFlag?.value === true) {
      return { triggered: true, explanation: `读者 ${readerId} 在黑名单中` }
    }

    return { triggered: false }
  },
}

/**
 * 新书保护期规则：新书在保护期内不可外借
 * 触发条件：图书出版日期 < 30天
 * Veto: candidatesByLabel = ["ALLOWED"] — 否决所有"允许"候选
 */
export const rule_protection_period: Rule = {
  id: 'library:protection_period',
  version: '1.0',
  kind: 'hard_constraint',
  appliesTo: ['Book'],
  description: '新书保护期（30天内不可外借）',
  direction: 'neutral',
  veto: { candidatesByLabel: ['ALLOWED'] },
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => {
    const bookId = ctx.entityId
    if (!bookId) {
      return { triggered: false, missingFacts: [{ property: 'bookId' }] }
    }

    const publishedAt = ctx.facts.get(bookId, 'publishedAt')
    if (!publishedAt) {
      return { triggered: false, missingFacts: [{ property: 'publishedAt', entityId: bookId }] }
    }

    const now = ctx.now ?? new Date()
    const publishDate = new Date(publishedAt.value as string)
    const daysSincePublish = Math.floor((now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSincePublish < 30) {
      return {
        triggered: true,
        explanation: `图书 ${bookId} 出版仅 ${daysSincePublish} 天，处于保护期`,
      }
    }

    return { triggered: false }
  },
}

// ── Soft Criteria (加权评分) ──

/**
 * 借阅历史良好加分
 * 触发条件：读者历史借阅量 > 50 且无逾期
 * Direction: risk_down — 倾向于降低风险（允许借阅）
 */
export const rule_good_history: Rule = {
  id: 'library:good_history',
  version: '1.0',
  kind: 'soft_criterion',
  appliesTo: ['Reader'],
  description: '借阅历史良好加分',
  direction: 'risk_down',
  weight: 0.6,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => {
    const readerId = ctx.entityId
    if (!readerId) {
      return { triggered: false, missingFacts: [{ property: 'readerId' }] }
    }

    const borrowCount = ctx.facts.get(readerId, 'borrowCount')
    const overdueCount = ctx.facts.get(readerId, 'overdueCount')

    if (!borrowCount || !overdueCount) {
      return {
        triggered: false,
        missingFacts: [
          { property: 'borrowCount', entityId: readerId },
          { property: 'overdueCount', entityId: readerId },
        ],
      }
    }

    const count = borrowCount.value as number
    const overdue = overdueCount.value as number

    if (count > 50 && overdue === 0) {
      return {
        triggered: true,
        explanation: `读者 ${readerId} 借阅 ${count} 次且无逾期`,
      }
    }

    return { triggered: false }
  },
}

/**
 * 违约率低加分
 * 触发条件：违约率 < 5%
 * Direction: risk_down — 倾向于降低风险
 */
export const rule_low_violation: Rule = {
  id: 'library:low_violation',
  version: '1.0',
  kind: 'soft_criterion',
  appliesTo: ['Reader'],
  description: '违约率低加分',
  direction: 'risk_down',
  weight: 0.4,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => {
    const readerId = ctx.entityId
    if (!readerId) {
      return { triggered: false, missingFacts: [{ property: 'readerId' }] }
    }

    const violationRate = ctx.facts.get(readerId, 'violationRate')
    if (!violationRate) {
      return { triggered: false, missingFacts: [{ property: 'violationRate', entityId: readerId }] }
    }

    const rate = violationRate.value as number
    if (rate < 0.05) {
      return { triggered: true, explanation: `读者 ${readerId} 违约率 ${rate.toFixed(2)}` }
    }

    return { triggered: false }
  },
}

/**
 * 高需求图书优先保护
 * 触发条件：图书预约队列 > 10
 * Direction: risk_up — 倾向于提高风险（限制借阅）
 */
export const rule_high_demand: Rule = {
  id: 'library:high_demand',
  version: '1.0',
  kind: 'soft_criterion',
  appliesTo: ['Book'],
  description: '高需求图书优先保护',
  direction: 'risk_up',
  weight: 0.5,
  evaluator: async (ctx: RuleContext): Promise<RuleResult> => {
    const bookId = ctx.entityId
    if (!bookId) {
      return { triggered: false, missingFacts: [{ property: 'bookId' }] }
    }

    const reservationCount = ctx.facts.get(bookId, 'reservationCount')
    if (!reservationCount) {
      return { triggered: false, missingFacts: [{ property: 'reservationCount', entityId: bookId }] }
    }

    const count = reservationCount.value as number
    if (count > 10) {
      return { triggered: true, explanation: `图书 ${bookId} 有 ${count} 个预约` }
    }

    return { triggered: false }
  },
}

// ── Register All Demo Rules ──

export const LIBRARY_DEMO_RULES: Rule[] = [
  rule_blacklist,
  rule_protection_period,
  rule_good_history,
  rule_low_violation,
  rule_high_demand,
]