import { registerRule } from '../../ontology/rules'

// ── Library borrow-request decision rules ──
//
// 三条核心约束规则，对应图书馆借阅规定：
//   Rule 1 — borrow_limit_exceeded  : 每人最多借 3 本（hard_constraint）
//   Rule 2 — new_book_not_lendable  : 新书（< 7 天）不可外借（hard_constraint）
//   Rule 3 — overdue_blocks_borrow  : 有逾期书籍则无法借新书（hard_constraint）
//
// 另有一条 soft_criterion 作为正向评分依据（读者资质良好）。

export function registerLibraryRules(): void {
  // ── Rule 1：借阅数量上限（hard_constraint）──
  registerRule({
    id: 'borrow_limit_exceeded',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '每位读者最多同时借阅 3 本书，超过上限则拒绝新借阅申请',
    requiredFacts: [{ property: 'currentBorrowCount', scope: 'entity' }],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const count = ctx.facts.getValue(entityId, 'currentBorrowCount') as number | undefined
      if (count === undefined) {
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'currentBorrowCount' }],
        }
      }
      const triggered = (count as number) >= 3
      return {
        triggered,
        explanation: triggered
          ? `读者当前已借 ${count} 本，达到最大借阅上限 3 本，无法再借新书`
          : `读者当前已借 ${count} 本，未超出上限 3 本`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── Rule 2：新书保护期（hard_constraint）──
  registerRule({
    id: 'new_book_not_lendable',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '上架不足 7 天的新书只能馆内阅读，不允许外借',
    requiredFacts: [{ property: 'daysOnShelf', scope: 'entity' }],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const days = ctx.facts.getValue(entityId, 'daysOnShelf') as number | undefined
      if (days === undefined) {
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'daysOnShelf' }],
        }
      }
      const newBookThreshold = 7
      const triggered = (days as number) < newBookThreshold
      return {
        triggered,
        explanation: triggered
          ? `《${entityId}》上架仅 ${days} 天，未满 ${newBookThreshold} 天新书保护期，只能馆内阅读`
          : `《${entityId}》上架已 ${days} 天，超过 ${newBookThreshold} 天保护期，可外借`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── Rule 3：逾期书籍阻断（hard_constraint）──
  registerRule({
    id: 'overdue_blocks_borrow',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '读者持有逾期未还书籍时，借阅权限暂停，无法借新书',
    requiredFacts: [{ property: 'hasOverdueBook', scope: 'entity' }],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const hasOverdue = ctx.facts.getValue(entityId, 'hasOverdueBook') as boolean | undefined
      if (hasOverdue === undefined) {
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'hasOverdueBook' }],
        }
      }
      const triggered = hasOverdue === true
      return {
        triggered,
        explanation: triggered
          ? `读者 ${entityId} 有逾期未还书籍，借阅资格已暂停`
          : `读者 ${entityId} 无逾期书籍，借阅资格正常`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion：良好借阅记录（正向评分）──
  registerRule({
    id: 'good_borrow_record',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Reader'],
    description: '读者当前借书数为 0 且无逾期历史，表明借阅习惯良好',
    requiredFacts: [
      { property: 'currentBorrowCount', scope: 'entity' },
      { property: 'hasOverdueBook', scope: 'entity' },
    ],
    direction: 'risk_down',
    weight: 0.5,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const count = ctx.facts.getValue(entityId, 'currentBorrowCount') as number | undefined
      const hasOverdue = ctx.facts.getValue(entityId, 'hasOverdueBook') as boolean | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (count === undefined) missing.push({ entityId, property: 'currentBorrowCount' })
      if (hasOverdue === undefined) missing.push({ entityId, property: 'hasOverdueBook' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const triggered = (count as number) === 0 && hasOverdue === false
      return {
        triggered,
        explanation: triggered ? '读者当前无在借书且无逾期记录，借阅信用良好' : '读者当前有在借书或逾期记录',
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })
}
