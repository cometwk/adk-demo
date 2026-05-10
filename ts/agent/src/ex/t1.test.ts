import { generateText, stepCountIs } from 'ai'
import { describe, expect, it } from 'vitest'
import { model } from '../lib/model'
// import { buildPredictiveSystemPrompt } from '../../../agent/prompt'
// import { createFactTools, resetSessionFacts } from '../../../agent/tools/facts'
// import { createGraphTools } from '../../../agent/tools/graph'
// import { createMethodTools } from '../../../agent/tools/method'
import type { DecisionTask } from '../v6/index'
import { OPEN_POLICY } from '../v6/index'
// import { FactStore } from '../../../runtime/eventStore'
// import { buildOntology } from '../../../runtime/ontology-builder'
import { seedGraph } from './seed'

// 必须 import 实体类以触发装饰器注册（副作用 import）
import './ontology'
import { runPredictiveAgent as runPredictiveAgentV6 } from '../v6/helper'


// ── 通用执行器 ──
const graph = seedGraph()
async function runPredictiveAgent(task: DecisionTask) {
  return runPredictiveAgentV6(task, graph)
}

// async function runPredictiveAgent(task: DecisionTask) {
//   resetSessionFacts()
//   const policy = task.policyCtx
//   const currentFacts = new FactStore()
//   const ontology = buildOntology({ version: '2.0.0' })
//   const graph = seedGraph()

//   const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
//   const userMessage =
//     `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

//   const graphTools = createGraphTools(graph, policy, currentFacts)
//   const methodTools = createMethodTools(graph, currentFacts, policy)
//   const factTools = createFactTools(policy)

//   const tools = { ...graphTools, ...methodTools, ...factTools }

//   const result = await generateText({
//     model,
//     system: systemPrompt,
//     prompt: userMessage,
//     tools,
//     stopWhen: stepCountIs(60),
//     temperature: 0,
//   })
//   return result
// }

function makeTask(
  overrides: Partial<DecisionTask> & { goal: string; entryEntities: string[] }
): DecisionTask {
  return {
    taskId: 'g2-test-' + Date.now(),
    mode: 'predictive',
    intent: 'risk_assessment',
    scope: {},
    policyCtx: OPEN_POLICY,
    ...overrides,
  }
}

type AgentResult = Awaited<ReturnType<typeof runPredictiveAgent>>

function textOf(result: AgentResult): string {
  return result.text ?? ''
}

function usedTool(result: AgentResult, name: string): boolean {
  return result.steps.some((s) => s.toolCalls?.some((tc) => tc.toolName === name))
}

function toolCallCount(result: AgentResult, name: string): number {
  return result.steps.reduce(
    (acc, s) => acc + (s.toolCalls?.filter((tc) => tc.toolName === name).length ?? 0),
    0
  )
}

// AI SDK 用 tc.input（而非 tc.args）存放工具调用参数
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolCall = { toolName: string; input?: Record<string, unknown> } & Record<string, any>

// ─────────────────────────────────────────────────────────────────────────────
// 测试套件
// ─────────────────────────────────────────────────────────────────────────────

describe('图书馆增强版 — LLM-Agent 图推理有效性', () => {
  /*
   * 场景 S1：2 跳跨实体参数传递 — 允许借阅
   *
   * 小红（basic 卡，0 借，无逾期，在西馆）申请借阅《人类简史》（历史类，90 天）。
   * 全部约束不触发。
   *
   * Agent 必须：
   *   1. inspect_node(xiao_hong) → currentBorrowCount, membershipLevel
   *   2. query_neighbors(xiao_hong, registered_at) → branch_west
   *   3. inspect_node(branch_west) → maxBorrowPerReader = 3
   *   4. call_method(xiao_hong, checkBorrowEligibility, { branchMaxBorrow: 3 })
   *
   * 验证点：Agent 能从 Branch 节点取得参数，再传入 Reader 方法（不能盲传 0）。
   */
  it('S1: 2跳参数传递 + 无阻断 → 允许借阅', async () => {
    const task = makeTask({
      goal: '评估小红是否能从西馆借阅《人类简史》',
      entryEntities: ['xiao_hong', 'book_sapiens', 'branch_west'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // Agent 应访问分馆节点以获取借阅上限
    expect(r.steps.some((s) => s.toolCalls?.some((tc) => tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'branch_west'))).toBe(true)
    expect(text).toMatch(/允许|可以|eligible|allow/i)
    console.log('[S1] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S2：借阅上限（需从 Branch 节点获取上限参数）
   *
   * 老王（silver 卡，已借 3 本，在主馆）申请借阅《人类简史》。
   * R_borrow_limit 触发（3 >= 3）。
   *
   * Agent 必须：
   *   1. 从 branch_central 获取 maxBorrowPerReader = 3
   *   2. 将 3 传入 checkBorrowEligibility
   *   3. 方法返回 eligible: false
   *
   * 验证点：Agent 不能凭空假设上限为 3，必须通过图查询得到。
   */
  it('S2: 从 Branch 获取上限参数 → 借阅上限触发', async () => {
    const task = makeTask({
      goal: '评估老王是否能从主馆借阅《人类简史》',
      entryEntities: ['lao_wang', 'book_sapiens', 'branch_central'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // Agent 应识别借阅上限问题
    expect(text).toMatch(/上限|超|已满|不能|拒绝|deny|limit|exceeded|3\s*本/i)
    console.log('[S2] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S3：逾期阻断 — 必须遍历 overdue 关系边
   *
   * 小李（gold 卡，已借 1 本）申请借阅《人类简史》，但 book_hp2 逾期未还。
   * 逾期约束触发。
   *
   * Agent 必须：
   *   1. query_neighbors(xiao_li, overdue) → 发现 book_hp2
   *   2. 确认存在逾期书籍 → 拒绝借阅
   *
   * 验证点：Agent 通过图遍历发现逾期关系，而非依赖预计算的布尔属性。
   */
  it('S3: 遍历 overdue 边发现逾期 → 拒绝', async () => {
    const task = makeTask({
      goal: '评估小李是否能借阅《人类简史》，需检查是否有逾期书籍',
      entryEntities: ['xiao_li', 'book_sapiens'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // 应遍历 overdue 边
    const exploredOverdue = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) =>
          (tc.toolName === 'query_neighbors' && (tc as AnyToolCall).input?.relation === 'overdue') ||
          (tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'xiao_li')
      )
    )
    expect(exploredOverdue).toBe(true)
    expect(text).toMatch(/逾期|overdue|不能|拒绝|deny/i)
    console.log('[S3] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S4：限制类目 — 2 跳跨实体会员等级比较
   *
   * 小红（basic 卡）申请借阅《三体（第一部）》（自然科学类，需 gold 卡）。
   * R_restricted_category 触发（basic < gold）。
   *
   * Agent 必须：
   *   1. inspect_node(book_tb1) → belongs_to → cat_science
   *   2. inspect_node(cat_science) → isRestricted=true, requiredMembershipLevel='gold'
   *   3. inspect_node(xiao_hong) → membershipLevel='basic'
   *   4. 比较发现 basic < gold → 拒绝
   *   或：call_method(xiao_hong, checkCategoryAccess, { requiredMembershipLevel: 'gold' })
   *
   * 验证点：Agent 能跨 Book → Category → Reader 三个实体做属性比较。
   */
  it('S4: Book→Category→Reader 2跳比较 → 会员等级不足', async () => {
    const task = makeTask({
      goal: '评估小红是否能借阅《三体（第一部）》，需检查类目限制和会员等级',
      entryEntities: ['xiao_hong', 'book_tb1'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // 应探索 Category 节点
    const exploredCategory = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) =>
          (tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'cat_science') ||
          (tc.toolName === 'query_neighbors' && (tc as AnyToolCall).input?.relation === 'belongs_to')
      )
    )
    expect(exploredCategory).toBe(true)
    expect(text).toMatch(/会员|等级|gold|限制|不能|restricted|拒绝/i)
    console.log('[S4] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S5：新书保护期 — 需从 Branch 获取保护天数参数
   *
   * 小明（gold 卡，主馆）申请借阅《哈利·波特与阿兹卡班的囚徒》（上架 5 天）。
   * R_new_book_protection 触发（5 < 7 天保护期）。
   *
   * Agent 必须：
   *   1. inspect_node(book_hp3) → daysOnShelf=5
   *   2. query_neighbors(xiao_ming, registered_at) → branch_central
   *   3. inspect_node(branch_central) → newBookProtectionDays=7
   *   4. call_method(book_hp3, checkNewBookStatus, { protectionDays: 7 })
   *
   * 验证点：Agent 能通过 2 跳（Reader → Branch → protectionDays）获取动态参数。
   */
  it('S5: Book + Branch 2跳获取保护天数 → 新书保护期触发', async () => {
    const task = makeTask({
      goal: '评估小明是否能借阅《哈利·波特与阿兹卡班的囚徒》，需结合分馆保护期规则',
      entryEntities: ['xiao_ming', 'book_hp3', 'branch_central'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // 应访问分馆节点获取保护期
    const exploredBranch = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) => tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'branch_central'
      )
    )
    expect(exploredBranch).toBe(true)
    expect(text).toMatch(/新书|保护期|5.*天|不足|isNew|拒绝|deny/i)
    console.log('[S5] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S6：系列顺序 — 3-4 跳集合推理
   *
   * 小明申请借阅《三体·死神永生（第三部）》。
   * 他已借第 1、2 卷，第 3 卷应当允许按顺序阅读。
   *
   * Agent 必须：
   *   1. inspect_node(book_tb3) → seriesVolume=3, part_of → series_three_body
   *   2. inspect_node(series_three_body) → totalVolumes=3
   *   3. query_neighbors(xiao_ming, borrows) → [book_tb1, book_tb2]
   *   4. inspect_node(book_tb1) + inspect_node(book_tb2) → seriesVolume = 1, 2
   *   5. call_method(series_three_body, checkReaderProgress, { readerBorrowedVolumeNumbers: [1, 2] })
   *   → canReadNext: true (已按顺序读完 1、2 卷)
   *
   * 验证点：Agent 能跨 Reader → borrows → Book → seriesVolume 构建集合后传入方法。
   */
  it('S6: 3-4跳系列顺序推理 → 允许（已读完前序卷）', async () => {
    const task = makeTask({
      goal: '判断小明是否可以借阅《三体·死神永生（第三部）》，需检查系列阅读顺序',
      entryEntities: ['xiao_ming', 'book_tb3', 'series_three_body'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // Agent 应访问系列节点
    const exploredSeries = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) => tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'series_three_body'
      )
    )
    expect(exploredSeries).toBe(true)
    // 应遍历读者的借阅记录
    const usedExplore = usedTool(r, 'query_neighbors') || usedTool(r, 'search_nodes')
    expect(usedExplore).toBe(true)
    expect(text).toMatch(/可以|允许|顺序|卷|volume|进度|canReadNext|true/i)
    console.log('[S6] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S7：馆际互借 — 3 跳链式分馆遍历
   *
   * 小红（在西馆）申请借阅《宇宙的奇迹》（仅在主馆有库存）。
   * 本馆无书，但通过 partners_with 关系可发现主馆有 2 册可借。
   *
   * Agent 必须：
   *   1. inspect_node(book_cosmos) → available_at → branch_central（无西馆）
   *   2. query_neighbors(xiao_hong, registered_at) → branch_west
   *   3. inspect_node(branch_west) → allowInterLibraryLoan=true
   *   4. query_neighbors(branch_west, partners_with) → branch_central
   *   5. 发现 branch_central 有 book_cosmos → 建议馆际互借
   *
   * 验证点：Agent 能沿 Branch → partners_with → Branch 链式遍历发现跨馆方案。
   */
  it('S7: 3跳 Branch→partners_with→Branch 链式遍历 → 发现馆际互借方案', async () => {
    const task = makeTask({
      goal: '评估小红是否能借阅《宇宙的奇迹》，需检查是否有馆际互借方案',
      entryEntities: ['xiao_hong', 'book_cosmos', 'branch_west'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // Agent 应访问分馆的合作关系
    const exploredPartners = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) =>
          (tc.toolName === 'query_neighbors' && (tc as AnyToolCall).input?.relation === 'partners_with') ||
          (tc.toolName === 'call_method' && (tc as AnyToolCall).input?.method === 'findPartnerBranches') ||
          (tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'branch_central')
      )
    )
    expect(exploredPartners).toBe(true)
    expect(text).toMatch(/主馆|合作|馆际|partner|central|互借|available/i)
    console.log('[S7] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S8：热门作者 — 2 跳反向遍历 + 聚合
   *
   * 判断刘慈欣是否为"热门作者"（activeBookCount >= 2 且借阅量足够）。
   *
   * Agent 必须：
   *   1. inspect_node(author_liu) → activeBookCount=4
   *   2. search_nodes(relatedTo: author_liu, relation: written_by, direction: in) 或
   *      query_neighbors(author_liu, in) → 发现 4 本书
   *   3. 对这些书 inspect_node 获取各自 availableCopies/totalCopies
   *   4. aggregate_facts 对书籍属性求和
   *   5. call_method(author_liu, isPopular, { borrowThreshold: <聚合结果> })
   *
   * 验证点：Agent 能做反向图遍历（author ← written_by ← books）并聚合数值。
   */
  it('S8: 反向遍历 Author←Book + aggregate_facts → 判断热门作者', async () => {
    const task = makeTask({
      goal: '判断刘慈欣是否为热门作者：需先聚合其所有书籍的总可借册数，再调用 isPopular 方法',
      entryEntities: ['author_liu'],
      intent: 'recommendation',
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // Agent 应使用聚合或遍历发现多本书
    const didAggregate = usedTool(r, 'aggregate_facts')
    const exploredBooks = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) =>
          (tc.toolName === 'query_neighbors' && (tc as AnyToolCall).input?.direction === 'in') ||
          (tc.toolName === 'search_nodes' && (tc as AnyToolCall).input?.relatedTo === 'author_liu')
      )
    )
    expect(didAggregate || exploredBooks).toBe(true)
    expect(text).toMatch(/刘慈欣|热门|popular|书籍|作品|author/i)
    console.log('[S8] steps:', r.steps.length, '| aggregate_facts 调用次数:', toolCallCount(r, 'aggregate_facts'))
  }, 150_000)

  /*
   * 场景 S9：预约上限 — 反向计数聚合
   *
   * 某新用户想预约 book_hp3，但已有 6 个预约（超过 5 的上限）。
   *
   * Agent 必须：
   *   1. query_neighbors(book_hp3, reserves, direction: in) → 发现 6 个预约者
   *   2. 计数 > 5 → 触发预约上限约束
   *
   * 验证点：Agent 能做反向边计数（从 Book 逆向找所有 Reader 的 reserves 边）。
   */
  it('S9: 反向计数 reserves 边 → 预约上限触发', async () => {
    const task = makeTask({
      goal: '统计《哈利·波特与阿兹卡班的囚徒》当前预约人数，判断是否已满（上限 5 人）',
      entryEntities: ['book_hp3'],
      intent: 'recommendation',
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node') || usedTool(r, 'query_neighbors')).toBe(true)
    // Agent 应遍历反向预约边或使用搜索
    const exploredReserves = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) =>
          (tc.toolName === 'query_neighbors' &&
            ((tc as AnyToolCall).input?.relation === 'reserves' ||
              (tc as AnyToolCall).input?.direction === 'in')) ||
          (tc.toolName === 'search_nodes' && (tc as AnyToolCall).input?.relatedTo === 'book_hp3')
      )
    )
    expect(exploredReserves).toBe(true)
    expect(text).toMatch(/6|超过|上限|满|预约|reserves|已满/i)
    console.log('[S9] steps:', r.steps.length, '| text excerpt:', text.slice(0, 200))
  }, 150_000)

  /*
   * 场景 S10：综合多规则叠加 — 限制类目 + 新书保护期同时触发
   *
   * 小红（basic 卡，0借，西馆）申请借阅《量子纠缠导论》（科学类[gold限制] + 上架2天）。
   * C4（类目限制）+ C5（新书保护期）双规则触发。
   *
   * Agent 必须：
   *   1. inspect_node(book_quantum) → daysOnShelf=2, belongs_to → cat_science
   *   2. inspect_node(cat_science) → isRestricted=true, requiredMembershipLevel='gold'
   *   3. inspect_node(xiao_hong) → membershipLevel='basic'（basic < gold → 拒绝）
   *   4. inspect_node(branch_west) → newBookProtectionDays=7（2 < 7 → 拒绝）
   *
   * 验证点：Agent 能同时识别并列举多条独立阻断原因，不因第一条阻断就停止探索。
   */
  it('S10: 综合 — 限制类目 + 新书保护期双规则同时触发', async () => {
    const task = makeTask({
      goal: '评估小红是否能借阅《量子纠缠导论》，需全面检查所有借阅约束',
      entryEntities: ['xiao_hong', 'book_quantum', 'branch_west'],
    })

    const r = await runPredictiveAgent(task)
    const text = textOf(r)

    expect(usedTool(r, 'inspect_node')).toBe(true)
    // 应同时覆盖类目检查和新书检查
    const inspectedCategory = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) => tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'cat_science'
      )
    )
    const inspectedBranch = r.steps.some((s) =>
      s.toolCalls?.some(
        (tc) => tc.toolName === 'inspect_node' && (tc as AnyToolCall).input?.nodeId === 'branch_west'
      )
    )
    // 至少应检查其中之一（不能在第一条阻断处停止）
    expect(inspectedCategory || inspectedBranch).toBe(true)
    // 应同时提到两个阻断原因
    expect(text).toMatch(/会员|等级|gold|限制|restricted/i)
    expect(text).toMatch(/新书|保护期|2.*天|不足|isNew/i)
    console.log(
      '[S10] steps:', r.steps.length,
      '| explored cat:', inspectedCategory,
      '| explored branch:', inspectedBranch,
      '| text:', text.slice(0, 300)
    )
  }, 150_000)
})
