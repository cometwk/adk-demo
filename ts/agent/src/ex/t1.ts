import { makeTask, runPredictiveAgent } from '../v6/helper'
import { registerGraph2Rules } from './rules'
import { clearRules } from '../v6/index'
import { seedGraph } from './seed'
import { S0, S1, syncPredictiveAgent } from './use-case'

// /*
//  * 场景 S1：2 跳跨实体参数传递 — 允许借阅
//  *
//  * 小红（basic 卡，0 借，无逾期，在西馆）申请借阅《人类简史》（历史类，90 天）。
//  * 全部约束不触发。
//  *
//  * Agent 必须：
//  *   1. inspect_node(xiao_hong) → currentBorrowCount, membershipLevel
//  *   2. query_neighbors(xiao_hong, registered_at) → branch_west
//  *   3. inspect_node(branch_west) → maxBorrowPerReader = 3
//  *   4. call_method(xiao_hong, checkBorrowEligibility, { branchMaxBorrow: 3 })
//  *
//  * 验证点：Agent 能从 Branch 节点取得参数，再传入 Reader 方法（不能盲传 0）。
//  */

// // it('S1: 2跳参数传递 + 无阻断 → 允许借阅',
// const mS1 = async () => {
//   const graph = seedGraph()
//   const task = makeTask({
//     // goal: '评估小红是否能从西馆借阅《人类简史》',
//     // entryEntities: ['xiao_hong', 'book_sapiens', 'branch_west'],
//     goal: '评估小红是否能借阅《人类简史》',
//     entryEntities: ['xiao_hong', 'book_sapiens'],
//   })

//   const r = await runPredictiveAgent(task, graph)
//   console.log(r.content)
// }

// /*
//  * 场景 S2：借阅上限（需从 Branch 节点获取上限参数）
//  *
//  * 老王（silver 卡，已借 3 本，在主馆）申请借阅《人类简史》。
//  * R_borrow_limit 触发（3 >= 3）。
//  *
//  * Agent 必须：
//  *   1. 从 branch_central 获取 maxBorrowPerReader = 3
//  *   2. 将 3 传入 checkBorrowEligibility
//  *   3. 方法返回 eligible: false
//  *
//  * 验证点：Agent 不能凭空假设上限为 3，必须通过图查询得到。
//  */

// //  it('S2: 从 Branch 获取上限参数 → 借阅上限触发',
// const mS2 = async () => {
//   const task = makeTask({
//     goal: '评估老王是否能从主馆借阅《人类简史》',
//     entryEntities: ['lao_wang', 'book_sapiens', 'branch_central'],
//   })

//   const graph = seedGraph()
//   const r = await runPredictiveAgent(task, graph)
//   const text = r.content
//   console.log(text)
// }

// clearRules()
// registerGraph2Rules()

syncPredictiveAgent(S0, [])
