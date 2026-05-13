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
  goal: '评估小红是否能借阅《人类简史》',
  entryEntities: ['xiao_hong', 'book_sapiens'],
})

