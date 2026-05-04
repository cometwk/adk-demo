import { CausalGraph, type CausalEdge } from '../../ontology/causal'

// ── Library lending causal graph ──
// 用于诊断模式：分析借阅被拒绝的原因

export function buildLibraryCausalGraph(): CausalGraph {
  const edges: CausalEdge[] = [
    // 新书限制因果链
    {
      id: 'ce_new_book_restricted',
      cause: { kind: 'event_type', matcher: 'book_shelved' },
      effect: { kind: 'fact_condition', matcher: 'Book.isNew=true' },
      mechanism: '新上架的图书被标记为 isNew=true',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['new_book_restricted'],
    },
    {
      id: 'ce_new_book_checkout_blocked',
      cause: {
        kind: 'fact_condition',
        matcher: 'Book.isNew=true && Book.daysSinceShelved<7',
      },
      effect: { kind: 'event_type', matcher: 'borrow_rejected' },
      mechanism: '上架不足 7 天的新书触发 new_book_restricted 规则，阻止外借',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['new_book_restricted'],
    },

    // 逾期阻止因果链
    {
      id: 'ce_due_date_passed',
      cause: { kind: 'event_type', matcher: 'due_date_passed' },
      effect: { kind: 'fact_condition', matcher: 'Reader.hasOverdue=true' },
      mechanism: '应还日期已过且未归还，读者被标记为有逾期',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['reader_overdue_block'],
    },
    {
      id: 'ce_overdue_block_borrow',
      cause: { kind: 'fact_condition', matcher: 'Reader.hasOverdue=true' },
      effect: { kind: 'event_type', matcher: 'borrow_rejected' },
      mechanism: '逾期读者触发 reader_overdue_block 规则，阻止借新书',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['reader_overdue_block'],
    },

    // 借阅上限因果链
    {
      id: 'ce_borrow_count_reached',
      cause: { kind: 'fact_condition', matcher: 'Reader.borrowedCount>=3' },
      effect: { kind: 'event_type', matcher: 'borrow_rejected' },
      mechanism: '借阅数量达到上限，触发 reader_borrow_limit 规则',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['reader_borrow_limit'],
    },

    // 图书状态因果链
    {
      id: 'ce_book_borrowed',
      cause: { kind: 'event_type', matcher: 'book_borrowed' },
      effect: { kind: 'fact_condition', matcher: 'Book.status=borrowed' },
      mechanism: '图书被借出，状态变为 borrowed',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['book_availability'],
    },
    {
      id: 'ce_book_unavailable',
      cause: {
        kind: 'fact_condition',
        matcher: 'Book.status=borrowed || Book.canCheckout=false',
      },
      effect: { kind: 'event_type', matcher: 'borrow_rejected' },
      mechanism: '图书不可用，触发 book_availability 规则阻止借阅',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['book_availability'],
    },
  ]

  return new CausalGraph(edges)
}
