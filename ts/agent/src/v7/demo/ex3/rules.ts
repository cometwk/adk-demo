import { registerRule } from '../../ontology/rules'

// ── Library lending rules ──
// 场景：小明想借一本书
// 规则：
//   1. 每个读者最多只能借 3 本书
//   2. 新书（上架不到 7 天）不能外借，只能在馆内阅读
//   3. 如果读者有逾期未还的书，就不能再借新书

export function registerLibraryRules(): void {
  // ── hard_constraint: reader borrow limit (最多 3 本) ──
  registerRule({
    id: 'reader_borrow_limit',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '每个读者最多只能借 3 本书',
    requiredFacts: [{ property: 'borrowedCount', scope: 'entity' }],
    direction: 'risk_up', // 触发 → 拒绝借阅（DENIED）
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] }, // 触发时直接否决 ALLOWED 候选
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const borrowedCount = ctx.facts.getValue(entityId, 'borrowedCount') as number | undefined
      if (borrowedCount === undefined) {
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'borrowedCount' }],
        }
      }
      const limit = 3
      const triggered = (borrowedCount as number) >= limit
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `读者 ${entityId} 已借 ${borrowedCount} 本，达到上限 ${limit} 本`
          : `读者 ${entityId} 已借 ${borrowedCount} 本，剩余 ${limit - borrowedCount} 个额度`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── hard_constraint: new book restricted (上架不到 7 天不可外借) ──
  registerRule({
    id: 'new_book_restricted',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '新书（上架不到 7 天）不能外借，只能在馆内阅读',
    requiredFacts: [
      { property: 'shelvedAt', scope: 'entity' },
      { property: 'daysSinceShelved', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const shelvedAt = ctx.facts.getValue(entityId, 'shelvedAt') as string | undefined
      const daysSinceShelved = ctx.facts.getValue(entityId, 'daysSinceShelved') as number | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (shelvedAt === undefined) missing.push({ entityId, property: 'shelvedAt' })
      if (daysSinceShelved === undefined) missing.push({ entityId, property: 'daysSinceShelved' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const restrictionDays = 7
      const triggered = (daysSinceShelved as number) < restrictionDays
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `图书 ${entityId} 上架仅 ${daysSinceShelved} 天，不足 ${restrictionDays} 天，仅限馆内阅读`
          : `图书 ${entityId} 上架已 ${daysSinceShelved} 天，可外借`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── hard_constraint: reader overdue block (逾期未还则阻止借新书) ──
  registerRule({
    id: 'reader_overdue_block',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '如果读者有逾期未还的书，就不能再借新书',
    requiredFacts: [
      { property: 'hasOverdue', scope: 'entity' },
      { property: 'overdueCount', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const hasOverdue = ctx.facts.getValue(entityId, 'hasOverdue') as boolean | undefined
      const overdueCount = ctx.facts.getValue(entityId, 'overdueCount') as number | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (hasOverdue === undefined) missing.push({ entityId, property: 'hasOverdue' })
      if (overdueCount === undefined) missing.push({ entityId, property: 'overdueCount' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const triggered = (hasOverdue as boolean) === true
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `读者 ${entityId} 有 ${overdueCount} 本逾期未还，禁止借新书`
          : `读者 ${entityId} 无逾期记录，可正常借阅`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: book availability (图书当前状态) ──
  registerRule({
    id: 'book_availability',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Book'],
    description: '图书必须处于可借状态（未被借出、非馆内限定）',
    requiredFacts: [
      { property: 'status', scope: 'entity' },
      { property: 'canCheckout', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 0.8,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const status = ctx.facts.getValue(entityId, 'status') as string | undefined
      const canCheckout = ctx.facts.getValue(entityId, 'canCheckout') as boolean | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (status === undefined) missing.push({ entityId, property: 'status' })
      if (canCheckout === undefined) missing.push({ entityId, property: 'canCheckout' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      // status === 'borrowed' 或 canCheckout === false → 触发拒绝
      const triggered = (status as string) === 'borrowed' || (canCheckout as boolean) === false
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `图书 ${entityId} 当前状态：${status}，不可借阅`
          : `图书 ${entityId} 当前状态：${status}，可借阅`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── inference_rule: compute days since shelved ──
  registerRule({
    id: 'compute_days_since_shelved',
    version: '1.0.0',
    kind: 'inference_rule',
    appliesTo: ['Book'],
    description: '计算图书上架天数（用于判断是否为新书）',
    requiredFacts: [
      { property: 'shelvedAt', scope: 'entity' },
      { property: 'currentTime', scope: 'global' },
    ],
    direction: 'neutral',
    weight: 0,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const shelvedAt = ctx.facts.getValue(entityId, 'shelvedAt') as string | undefined
      const currentTime = ctx.facts.getValue('global', 'currentTime') as string | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (shelvedAt === undefined) missing.push({ entityId, property: 'shelvedAt' })
      if (currentTime === undefined) missing.push({ entityId: 'global', property: 'currentTime' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const shelvedDate = new Date(shelvedAt as string)
      const currentDate = new Date(currentTime as string)
      const daysSinceShelved = Math.floor((currentDate.getTime() - shelvedDate.getTime()) / (1000 * 60 * 60 * 24))
      return {
        triggered: true,
        derivedFacts: [
          {
            entityId,
            property: 'daysSinceShelved',
            value: daysSinceShelved,
            source: { kind: 'derived', ref: 'compute_days_since_shelved' },
            confidence: 1.0,
            validFrom: currentTime as string,
            observedAt: currentTime as string,
          },
        ],
        explanation: `图书 ${entityId} 上架已 ${daysSinceShelved} 天`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })
}
