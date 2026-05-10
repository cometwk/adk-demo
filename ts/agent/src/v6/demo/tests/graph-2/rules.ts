import { registerRule } from '../../../ontology/rules'

// ── Graph-2 图书馆增强版借阅决策规则 ──
//
// 8 条约束规则 + 2 条软性评分，对应图书馆借阅场景：
//
//  hard_constraint（否决）
//   C1  borrow_limit_exceeded      : 借阅数达到分馆上限
//   C2  overdue_blocks_borrow      : 有逾期书籍阻断借阅
//   C3  new_book_protection        : 新书保护期内不可外借
//   C4  restricted_category_access : 类目等级限制（需指定会员卡）
//   C5  series_order_required      : 系列书必须按顺序借阅
//   C6  no_copies_available        : 本馆无可借库存（未考虑馆际互借）
//   C7  reservation_limit_exceeded : 预约人数已满（> 5）
//
//  soft_criterion（加权评分）
//   S1  popular_author_bonus       : 热门作者书籍，评分加权（risk_down）
//   S2  reader_in_good_standing    : 读者信用良好（无逾期、在借数少），评分加权（risk_down）
//
// ── 注意 ──
// 跨实体参数（如 branchMaxBorrowPerReader、branchProtectionDays、categoryRequiredLevel
// 等）需由 Agent 在调用 Critic 前通过图工具收集并以 bind_fact 绑定到对应实体，
// 规则 evaluator 从 FactStore 读取。
//
// 部分规则（C2 overdueCount、C7 reservationCount）也支持从 ctx.graph 直接统计边数，
// 以应对 Agent 未显式绑定的情况。

export function registerGraph2Rules(): void {
  // ─────────────────────────────────────────────────────
  // C1：借阅数量上限（hard_constraint / Reader）
  //
  // 触发条件：Reader.currentBorrowCount >= branchMaxBorrowPerReader
  //
  // Agent 需预先绑定：
  //   bind_fact(readerId, 'currentBorrowCount',      <value>,  'graph_property')
  //   bind_fact(readerId, 'branchMaxBorrowPerReader', <value>,  'graph_property')  ← 从 Branch 取
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'borrow_limit_exceeded',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '读者当前借阅数已达到注册分馆的最大同时借阅上限，无法再借',
    requiredFacts: [
      { property: 'currentBorrowCount', scope: 'entity' },
      { property: 'branchMaxBorrowPerReader', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const count = ctx.facts.getValue(entityId, 'currentBorrowCount') as number | undefined
      const limit = ctx.facts.getValue(entityId, 'branchMaxBorrowPerReader') as number | undefined

      const missing: Array<{ entityId: string; property: string }> = []
      if (count === undefined) missing.push({ entityId, property: 'currentBorrowCount' })
      if (limit === undefined) missing.push({ entityId, property: 'branchMaxBorrowPerReader' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }

      const triggered = (count as number) >= (limit as number)
      return {
        triggered,
        explanation: triggered
          ? `读者已借 ${count} 本，达到分馆上限 ${limit} 本，无法新借`
          : `读者已借 ${count} 本，未达到分馆上限 ${limit} 本`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C2：逾期书籍阻断（hard_constraint / Reader）
  //
  // 触发条件：Reader 存在 overdue 关系边（逾期未还的书）
  //
  // 优先从 FactStore 读取 overdueBookCount（Agent bind 后可用）；
  // 若未绑定，则直接统计 ctx.graph 中 Reader 的 overdue 出边数量。
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'overdue_blocks_borrow',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '读者持有逾期未还书籍时，借阅权限暂停',
    requiredFacts: [{ property: 'overdueBookCount', scope: 'entity' }],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      // 优先使用 FactStore 中绑定的 overdueBookCount
      let overdueCount = ctx.facts.getValue(entityId, 'overdueBookCount') as number | undefined

      // 若 Agent 未绑定，降级到图遍历：统计 overdue 出边数量
      if (overdueCount === undefined) {
        const outEdges = ctx.graph.getOutEdges(entityId)
        overdueCount = (outEdges['overdue'] ?? []).length
      }

      const triggered = overdueCount > 0
      return {
        triggered,
        explanation: triggered
          ? `读者有 ${overdueCount} 本逾期未还书籍，借阅权限暂停`
          : '读者无逾期书籍，借阅资格正常',
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C3：新书保护期（hard_constraint / Book）
  //
  // 触发条件：Book.daysOnShelf < branchProtectionDays
  //
  // Agent 需预先绑定：
  //   bind_fact(bookId, 'daysOnShelf',          <value>, 'graph_property')
  //   bind_fact(bookId, 'branchProtectionDays',  <value>, 'graph_property')  ← 从 Branch 取
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'new_book_protection',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '书籍上架不足分馆新书保护期天数时，只能馆内阅读，不允许外借',
    requiredFacts: [
      { property: 'daysOnShelf', scope: 'entity' },
      { property: 'branchProtectionDays', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const days = ctx.facts.getValue(entityId, 'daysOnShelf') as number | undefined
      const threshold = ctx.facts.getValue(entityId, 'branchProtectionDays') as number | undefined

      const missing: Array<{ entityId: string; property: string }> = []
      if (days === undefined) missing.push({ entityId, property: 'daysOnShelf' })
      if (threshold === undefined) missing.push({ entityId, property: 'branchProtectionDays' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }

      const triggered = (days as number) < (threshold as number)
      return {
        triggered,
        explanation: triggered
          ? `书籍上架仅 ${days} 天，未满 ${threshold} 天新书保护期，不可外借`
          : `书籍上架已 ${days} 天，超过 ${threshold} 天保护期，可外借`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C4：限制类目会员等级（hard_constraint / Reader）
  //
  // 触发条件：Book 所属类目 isRestricted=true 且 Reader.membershipLevel < requiredLevel
  //
  // Agent 需预先绑定：
  //   bind_fact(readerId, 'membershipLevel',     <value>, 'graph_property')
  //   bind_fact(readerId, 'categoryIsRestricted', <value>, 'graph_property')  ← 从 Category 取
  //   bind_fact(readerId, 'categoryRequiredLevel',<value>, 'graph_property')  ← 从 Category 取
  //
  // 等级顺序：basic(1) < silver(2) < gold(3)
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'restricted_category_access',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Reader'],
    description: '目标书籍属于限制类目，读者会员等级不满足最低要求',
    requiredFacts: [
      { property: 'membershipLevel', scope: 'entity' },
      { property: 'categoryIsRestricted', scope: 'entity' },
      { property: 'categoryRequiredLevel', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const isRestricted = ctx.facts.getValue(entityId, 'categoryIsRestricted') as boolean | undefined
      // 如果类目不限制，规则不触发
      if (isRestricted === false) return { triggered: false, explanation: '目标类目无会员等级限制' }

      const membershipLevel = ctx.facts.getValue(entityId, 'membershipLevel') as string | undefined
      const requiredLevel = ctx.facts.getValue(entityId, 'categoryRequiredLevel') as string | undefined

      const missing: Array<{ entityId: string; property: string }> = []
      if (isRestricted === undefined) missing.push({ entityId, property: 'categoryIsRestricted' })
      if (membershipLevel === undefined) missing.push({ entityId, property: 'membershipLevel' })
      if (requiredLevel === undefined) missing.push({ entityId, property: 'categoryRequiredLevel' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }

      const RANK: Record<string, number> = { basic: 1, silver: 2, gold: 3 }
      const readerRank = RANK[membershipLevel as string] ?? 0
      const requiredRank = RANK[requiredLevel as string] ?? 0

      const triggered = readerRank < requiredRank
      return {
        triggered,
        explanation: triggered
          ? `读者持有 ${membershipLevel} 卡，目标类目要求 ${requiredLevel} 卡，等级不足`
          : `读者持有 ${membershipLevel} 卡，满足类目要求的 ${requiredLevel} 卡`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C5：系列顺序阅读（hard_constraint / Book）
  //
  // 触发条件：书籍是系列书（seriesVolume > 1）且读者未完成前序卷
  //
  // Agent 需预先绑定：
  //   bind_fact(bookId, 'seriesVolume',              <value>,  'graph_property')
  //   bind_fact(bookId, 'readerCompletedPriorVolumes', <bool>, 'derived')  ← Agent 检查后绑定
  //
  // 若 seriesVolume <= 1（第一卷或非系列书），规则不触发。
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'series_order_required',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '系列书必须按卷号顺序借阅，读者未借完前序卷时不可借当前卷',
    requiredFacts: [
      { property: 'seriesVolume', scope: 'entity' },
      { property: 'readerCompletedPriorVolumes', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 0.8,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const vol = ctx.facts.getValue(entityId, 'seriesVolume') as number | undefined
      // 非系列书（volume=0）或第一卷，不需要前序检查
      if (vol === undefined || vol <= 1) {
        return { triggered: false, explanation: vol === undefined ? undefined : '第一卷或非系列书，无前序要求' }
      }

      const priorCompleted = ctx.facts.getValue(entityId, 'readerCompletedPriorVolumes') as boolean | undefined
      if (priorCompleted === undefined) {
        return { triggered: false, missingFacts: [{ entityId, property: 'readerCompletedPriorVolumes' }] }
      }

      const triggered = priorCompleted === false
      return {
        triggered,
        explanation: triggered
          ? `读者尚未借阅第 ${vol} 卷的前序卷，需按顺序借阅`
          : `读者已完成第 ${vol} 卷之前的所有卷，可按顺序借阅`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C6：本馆无可借库存（hard_constraint / Book）
  //
  // 触发条件：Book.availableCopies <= 0
  //
  // 注意：此规则仅检查书籍总可借数，不区分分馆。
  // 若支持馆际互借（ILL），Critic 应结合 S1(popular_author_bonus) 或
  // 业务逻辑综合判断，而非直接否决。
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'no_copies_available',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '书籍当前无可借库存（availableCopies = 0），无法直接外借',
    requiredFacts: [{ property: 'availableCopies', scope: 'entity' }],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const copies = ctx.facts.getValue(entityId, 'availableCopies') as number | undefined
      if (copies === undefined) {
        return { triggered: false, missingFacts: [{ entityId, property: 'availableCopies' }] }
      }

      const triggered = (copies as number) <= 0
      return {
        triggered,
        explanation: triggered
          ? `书籍当前可借册数为 ${copies}，无库存，建议预约或馆际互借`
          : `书籍当前有 ${copies} 册可借`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // C7：预约人数已满（hard_constraint / Book）
  //
  // 触发条件：当前 reserves 反向边数量 > 5（或 FactStore 中绑定的 reservationCount > 5）
  //
  // 优先使用 FactStore 中绑定的 reservationCount；
  // 若未绑定，降级到 ctx.graph 统计 inEdges['reserves'] 数量。
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'reservation_limit_exceeded',
    version: '2.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Book'],
    description: '书籍预约人数已达上限（5 人），无法再接受新预约',
    requiredFacts: [{ property: 'reservationCount', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.9,
    veto: { candidatesByLabel: ['ALLOWED'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      // 优先读 FactStore
      let reserveCount = ctx.facts.getValue(entityId, 'reservationCount') as number | undefined

      // 降级：从图中统计反向 reserves 边
      if (reserveCount === undefined) {
        const inEdges = ctx.graph.getInEdges(entityId)
        reserveCount = (inEdges['reserves'] ?? []).length
      }

      const RESERVE_LIMIT = 5
      const triggered = (reserveCount as number) > RESERVE_LIMIT
      return {
        triggered,
        explanation: triggered
          ? `书籍已有 ${reserveCount} 人预约，超过上限 ${RESERVE_LIMIT}，无法新增预约`
          : `书籍当前预约 ${reserveCount} 人，未超出上限 ${RESERVE_LIMIT}`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // S1：热门作者正向加权（soft_criterion / Book）
  //
  // 评分信号：书籍的作者为热门作者（activeBookCount >= 2）
  //
  // Agent 需预先绑定：
  //   bind_fact(bookId, 'authorIsPopular', <bool>, 'derived')  ← 调用 author.isPopular() 后绑定
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'popular_author_bonus',
    version: '2.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Book'],
    description: '书籍作者为热门作者（馆内多部作品），在评分中给予正向加权',
    requiredFacts: [{ property: 'authorIsPopular', scope: 'entity' }],
    direction: 'risk_down',
    weight: 0.3,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const popular = ctx.facts.getValue(entityId, 'authorIsPopular') as boolean | undefined
      if (popular === undefined) {
        return { triggered: false, missingFacts: [{ entityId, property: 'authorIsPopular' }] }
      }

      return {
        triggered: popular === true,
        explanation: popular
          ? '书籍来自热门作者，在评分中享有正向加权'
          : '书籍作者不在热门列表，无加权',
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ─────────────────────────────────────────────────────
  // S2：读者信用良好正向加权（soft_criterion / Reader）
  //
  // 评分信号：读者当前借阅数 < 2 且无逾期（图中无 overdue 边）
  // ─────────────────────────────────────────────────────
  registerRule({
    id: 'reader_in_good_standing',
    version: '2.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Reader'],
    description: '读者借阅数量少且无逾期记录，信用状态良好，给予正向评分加权',
    requiredFacts: [{ property: 'currentBorrowCount', scope: 'entity' }],
    direction: 'risk_down',
    weight: 0.4,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false }

      const count = ctx.facts.getValue(entityId, 'currentBorrowCount') as number | undefined
      if (count === undefined) {
        return { triggered: false, missingFacts: [{ entityId, property: 'currentBorrowCount' }] }
      }

      // 从图中统计逾期边（无需 Agent 显式绑定）
      const outEdges = ctx.graph.getOutEdges(entityId)
      const overdueCount = (outEdges['overdue'] ?? []).length

      const triggered = (count as number) < 2 && overdueCount === 0
      return {
        triggered,
        explanation: triggered
          ? `读者当前仅借 ${count} 本且无逾期，信用良好`
          : `读者在借 ${count} 本或有 ${overdueCount} 本逾期，不计入良好信用加权`,
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })
}
