import { newAgentContext } from './helper'
export * from './helper'

export const S0 = newAgentContext({
  taskId: 'S0',
  goal: '',
  entryEntities: [],
})

export const S10 = newAgentContext({
  taskId: 'S10',
  goal: '评估小红是否能借阅《量子纠缠导论》，需全面检查所有借阅约束',
  entryEntities: ['xiao_hong', 'book_quantum', 'branch_west'],
})
