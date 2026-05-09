import { type CausalEdge, CausalGraph } from '../../ontology/causal'

// ── Library borrow-rejection causal graph ──
//
// 描述导致"借阅被拒绝"事件的因果链。
// 用于 Diagnostic 模式：当小明的借阅申请被拒绝时，回溯原因。

export function buildLibraryCausalGraph(): CausalGraph {
  const edges: CausalEdge[] = [
    // ── 链路 A：借阅数量超限 ──
    {
      id: 'ce_book_not_returned_limit',
      cause: { kind: 'event_type', matcher: 'book_not_returned' },
      effect: { kind: 'state', matcher: 'borrow_limit_reached' },
      mechanism: '读者长期未归还书籍，占用借阅名额，导致已借数量接近或达到上限',
      typicalLag: 'days to weeks',
      strength: 'strong',
      relatedRuleIds: ['borrow_limit_exceeded'],
    },
    {
      id: 'ce_borrow_limit_request_denied',
      cause: { kind: 'state', matcher: 'borrow_limit_reached' },
      effect: { kind: 'event_type', matcher: 'borrow_request_denied' },
      mechanism: '借阅数量达到上限 3 本，新借阅申请被拒绝',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['borrow_limit_exceeded'],
    },

    // ── 链路 B：新书保护期 ──
    {
      id: 'ce_book_recently_added',
      cause: { kind: 'event_type', matcher: 'book_added_to_shelf' },
      effect: { kind: 'state', matcher: 'new_book_protection_active' },
      mechanism: '书籍刚上架，进入 7 天新书保护期，此期间只允许馆内阅读',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['new_book_not_lendable'],
    },
    {
      id: 'ce_new_book_request_denied',
      cause: { kind: 'state', matcher: 'new_book_protection_active' },
      effect: { kind: 'event_type', matcher: 'borrow_request_denied' },
      mechanism: '读者申请借阅处于保护期内的新书，被系统拒绝',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['new_book_not_lendable'],
    },

    // ── 链路 C：逾期未还阻断 ──
    {
      id: 'ce_deadline_missed_overdue',
      cause: { kind: 'event_type', matcher: 'return_deadline_missed' },
      effect: { kind: 'state', matcher: 'reader_has_overdue' },
      mechanism: '读者未在截止日期前归还书籍，账户被标记为有逾期未还',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['overdue_blocks_borrow'],
    },
    {
      id: 'ce_overdue_request_denied',
      cause: { kind: 'state', matcher: 'reader_has_overdue' },
      effect: { kind: 'event_type', matcher: 'borrow_request_denied' },
      mechanism: '读者账户存在逾期标记，借阅权限被暂停，新借阅申请被拒绝',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['overdue_blocks_borrow'],
    },

    // ── 链路 D：逾期的前置原因 ──
    {
      id: 'ce_forgot_return_overdue',
      cause: { kind: 'event_type', matcher: 'return_reminder_ignored' },
      effect: { kind: 'event_type', matcher: 'return_deadline_missed' },
      mechanism: '读者忽略归还提醒，未能在截止日期前归还，最终形成逾期',
      typicalLag: '1-3 days',
      strength: 'moderate',
      relatedRuleIds: ['overdue_blocks_borrow'],
    },
  ]

  return new CausalGraph(edges)
}
