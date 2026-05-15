import { newAgentContext } from './helper'
export * from './helper'

export const S0 = newAgentContext({
  taskId: 'S0',
  goal: 'just hi',
  entryEntities: [],
})


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

// 'S1: 2跳参数传递 + 无阻断 → 允许借阅',
export const S1 = newAgentContext({
  taskId: 'S1',
  goal: '评估小红是否能从西馆借阅《人类简史》',
  entryEntities: ['xiao_hong', 'book_sapiens', 'branch_west'],
})

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
export const S2 = newAgentContext({
  taskId: 'S2',
  goal: '评估老王是否能从主馆借阅《人类简史》',
  entryEntities: ['lao_wang', 'book_sapiens', 'branch_central'],
})

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
export const S3 = newAgentContext({
  taskId: 'S3',
  goal: '评估小李是否能借阅《人类简史》，需检查是否有逾期书籍',
  entryEntities: ['xiao_li', 'book_sapiens'],
})

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
export const S4 = newAgentContext({
  taskId: 'S4',
  goal: '评估小红是否能借阅《三体（第一部）》，需检查类目限制和会员等级',
  entryEntities: ['xiao_hong', 'book_tb1'],
})

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
export const S5 = newAgentContext({
  taskId: 'S5',
  goal: '评估小明是否能借阅《哈利·波特与阿兹卡班的囚徒》，需结合分馆保护期规则',
  entryEntities: ['xiao_ming', 'book_hp3', 'branch_central'],
})

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
export const S6 = newAgentContext({
  taskId: 'S6',
  goal: '判断小明是否可以借阅《三体·死神永生（第三部）》，需检查系列阅读顺序',
  entryEntities: ['xiao_ming', 'book_tb3', 'series_three_body'],
})

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
export const S7 = newAgentContext({
  taskId: 'S7',
  goal: '评估小红是否能借阅《宇宙的奇迹》，需检查是否有馆际互借方案',
  entryEntities: ['xiao_hong', 'book_cosmos', 'branch_west'],
})

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
export const S8 = newAgentContext({
  taskId: 'S8',
  goal: '判断刘慈欣是否为热门作者：需先聚合其所有书籍的总可借册数，再调用 isPopular 方法',
  entryEntities: ['author_liu'],
  intent: 'recommendation',
})

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
export const S9 = newAgentContext({
  taskId: 'S9',
  goal: '统计《哈利·波特与阿兹卡班的囚徒》当前预约人数，判断是否已满（上限 5 人）',
  entryEntities: ['book_hp3'],
  intent: 'recommendation',
})

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
export const S10 = newAgentContext({
  taskId: 'S10',
  goal: '评估小红是否能借阅《量子纠缠导论》，需全面检查所有借阅约束',
  entryEntities: ['xiao_hong', 'book_quantum', 'branch_west'],
})

