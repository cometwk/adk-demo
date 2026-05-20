import { InMemoryGraphStore, type Graph } from '../../provider/in-memory'
import { EventStore, FactStore } from '../../runtime/eventStore'
import { clearRules } from '../../ontology/rules'
import type { FactBinding } from '../../runtime/types'
import type { RelationSchema } from '../../ontology/schema'
import { Reader, Book, Library } from './entities'
import { registerLibraryRules } from './rules'
import { buildLibraryCausalGraph } from './causal'

// ── 场景说明 ──
//
// 小明（xiao_ming）想借《人工智能简史》（book_ai_history）
//
// 当前状态：
//   - 小明已借 2 本书（book_gone_with_wind, book_three_body）
//   - 小明有 1 本书逾期未还（book_old_man_and_sea，借期已过 3 天）
//   - 《人工智能简史》3 天前刚上架（处于 7 天新书保护期）
//
// 规则触发情况：
//   Rule 1 borrow_limit_exceeded : 已借 2 本，未满 3 本 → 不触发
//   Rule 2 new_book_not_lendable : 书上架仅 3 天，< 7 天 → 触发（VETO ALLOWED）
//   Rule 3 overdue_blocks_borrow : 小明有逾期书籍 → 触发（VETO ALLOWED）
//
// 预期系统判决：DENIED（两条 hard_constraint 均触发）

// ── Graph seed ──

export const data = {
  library: [{ id: 'city_library', maxBorrowPerReader: 3, newBookProtectionDays: 7 }],
  reader: [{ id: 'xiao_ming', name: '小明' }],
  books: [
    { id: 'book_gone_with_wind', title: '飘', isbn: '978-0-7432-7356-5', daysOnShelf: 120, lendable: true },
    { id: 'book_three_body', title: '三体', isbn: '978-0-7653-2293-1', daysOnShelf: 45, lendable: true },
    { id: 'book_old_man_and_sea', title: '老人与海', isbn: '978-0-684-80122-3', daysOnShelf: 90, lendable: true },
    { id: 'book_ai_history', title: '人工智能简史', isbn: '978-7-115-54672-0', daysOnShelf: 3, lendable: true },
    { id: 'book_sapiens', title: '人类简史', isbn: '978-0-06-231609-7', daysOnShelf: 60, lendable: true },
  ],
  relations: [
    { from: 'xiao_ming', to: 'book_gone_with_wind', type: 'borrows' },
    { from: 'xiao_ming', to: 'book_three_body', type: 'borrows' },
    { from: 'xiao_ming', to: 'book_old_man_and_sea', type: 'overdue' },
    { from: 'xiao_ming', to: 'book_ai_history', type: 'requests' },
    { from: 'book_gone_with_wind', to: 'city_library', type: 'managed_by' },
    { from: 'book_three_body', to: 'city_library', type: 'managed_by' },
    { from: 'book_old_man_and_sea', to: 'city_library', type: 'managed_by' },
    { from: 'book_ai_history', to: 'city_library', type: 'managed_by' },
    { from: 'book_sapiens', to: 'city_library', type: 'managed_by' },
  ],
}
export function seedLibraryGraph(relations?: RelationSchema[]): InMemoryGraphStore {
  const g = new InMemoryGraphStore({ relations })

  // Library
  const library = new Library('city_library', 3, 7)

  // Reader — 小明
  const xiaoMing = new Reader('xiao_ming', '小明', 2, true)

  // Books currently borrowed by xiao_ming
  const bookGoneWithWind = new Book('book_gone_with_wind', '飘', '978-0-7432-7356-5', 120, true)
  const bookThreeBody = new Book('book_three_body', '三体', '978-0-7653-2293-1', 45, true)

  // Book that xiao_ming has overdue
  const bookOldMan = new Book('book_old_man_and_sea', '老人与海', '978-0-684-80122-3', 90, true)

  // Target book xiao_ming wants to borrow — NEW book, only 3 days on shelf
  const bookAiHistory = new Book('book_ai_history', '人工智能简史', '978-7-115-54672-0', 3, true)

  // A few other books in the library
  const bookSapiens = new Book('book_sapiens', '人类简史', '978-0-06-231609-7', 60, true)

  for (const node of [library, xiaoMing, bookGoneWithWind, bookThreeBody, bookOldMan, bookAiHistory, bookSapiens]) {
    g.addNode(node)
  }

  // xiao_ming currently borrows 2 books
  g.addEdge({ from: 'xiao_ming', to: 'book_gone_with_wind', type: 'borrows' })
  g.addEdge({ from: 'xiao_ming', to: 'book_three_body', type: 'borrows' })

  // xiao_ming has 1 overdue book
  g.addEdge({ from: 'xiao_ming', to: 'book_old_man_and_sea', type: 'overdue' })

  // xiao_ming wants to borrow the new AI book
  g.addEdge({ from: 'xiao_ming', to: 'book_ai_history', type: 'requests' })

  // All books managed by city_library
  for (const bookId of [
    'book_gone_with_wind',
    'book_three_body',
    'book_old_man_and_sea',
    'book_ai_history',
    'book_sapiens',
  ]) {
    g.addEdge({ from: bookId, to: 'city_library', type: 'managed_by' })
  }

  return g
}

// ── FactStore seed（predictive: current state snapshot）──

export function seedLibraryFactStore(): FactStore {
  return new FactStore([])
}

// ── EventStore seed（diagnostic: borrow-denial incident timeline）──
//
// 记录导致"2026-05-03 小明借阅申请被拒"的历史事件链。
// Diagnostic 模式将沿这条时间线反向溯因。

export function seedLibraryEventStore(): EventStore {
  const store = new EventStore()

  // T-21d：小明借出《老人与海》
  store.addEvent({
    id: 'evt_borrow_old_man',
    type: 'book_borrowed',
    occurredAt: '2026-04-12T14:00:00.000Z',
    actorId: 'xiao_ming',
    affectedEntities: ['xiao_ming', 'book_old_man_and_sea'],
    payload: {
      dueDate: '2026-04-26T23:59:00.000Z',
      causalEdgeId: 'ce_book_not_returned_limit',
    },
  })

  // T-7d：到期归还提醒发送（被忽略）
  store.addEvent({
    id: 'evt_return_reminder_sent',
    type: 'return_reminder_ignored',
    occurredAt: '2026-04-26T10:00:00.000Z',
    actorId: 'library_system',
    affectedEntities: ['xiao_ming', 'book_old_man_and_sea'],
    payload: {
      reminderChannel: 'SMS',
      description: '《老人与海》借阅期限今日到期，请及时归还',
      causalEdgeId: 'ce_forgot_return_overdue',
    },
  })

  // T-0 当天 -1 day：归还截止日期未归还 → 逾期标记
  store.addEvent({
    id: 'evt_return_deadline_missed',
    type: 'return_deadline_missed',
    occurredAt: '2026-04-27T00:01:00.000Z',
    actorId: 'library_system',
    affectedEntities: ['xiao_ming', 'book_old_man_and_sea'],
    payload: {
      overdayCount: 1,
      causalEdgeId: 'ce_deadline_missed_overdue',
    },
    derivedBindings: [
      {
        entityId: 'xiao_ming',
        property: 'hasOverdueBook',
        value: true,
        source: { kind: 'derived', ref: 'evt_return_deadline_missed' },
        confidence: 1.0,
        validFrom: '2026-04-27T00:01:00.000Z',
        observedAt: '2026-04-27T00:01:00.000Z',
      },
    ],
  })

  // T-3d：《人工智能简史》上架
  store.addEvent({
    id: 'evt_book_added_to_shelf',
    type: 'book_added_to_shelf',
    occurredAt: '2026-04-30T09:00:00.000Z',
    actorId: 'librarian',
    affectedEntities: ['book_ai_history'],
    payload: {
      isbn: '978-7-115-54672-0',
      newBookProtectionDays: 7,
      protectionExpires: '2026-05-07T09:00:00.000Z',
      causalEdgeId: 'ce_book_recently_added',
    },
    derivedBindings: [
      {
        entityId: 'book_ai_history',
        property: 'daysOnShelf',
        value: 3,
        source: { kind: 'derived', ref: 'evt_book_added_to_shelf' },
        confidence: 1.0,
        validFrom: '2026-04-30T09:00:00.000Z',
        observedAt: '2026-04-30T09:00:00.000Z',
      },
    ],
  })

  // T-0：小明提交借阅申请 → 被拒绝
  store.addEvent({
    id: 'evt_borrow_request_denied',
    type: 'borrow_request_denied',
    occurredAt: '2026-05-03T10:00:00.000Z',
    actorId: 'library_system',
    affectedEntities: ['xiao_ming', 'book_ai_history'],
    payload: {
      blockedReasons: ['new_book_not_lendable', 'overdue_blocks_borrow'],
      description: '小明借阅《人工智能简史》申请被拒：新书保护期 + 逾期未还',
    },
  })

  return store
}

// ── Alias table for entity linker ──
//
// Maps natural-language names (as a user might type them) to canonical entity IDs.
// Used by the frontend entity linker so callers need not pass entryEntities manually.

export const LIBRARY_ALIASES: Record<string, string> = {
  // // Reader aliases
  // 小明: 'xiao_ming',
  // xiao_ming: 'xiao_ming',
  // // Book aliases
  // 人工智能简史: 'book_ai_history',
  // ai简史: 'book_ai_history',
  // '人工智能简史(book)': 'book_ai_history',
  // 老人与海: 'book_old_man_and_sea',
  // 三体: 'book_three_body',
  // 飘: 'book_gone_with_wind',
  // 人类简史: 'book_sapiens',
  // // Library aliases
  // 图书馆: 'city_library',
  // 市图书馆: 'city_library',
  // city_library: 'city_library',
}

// ── Full scenario setup ──

export function setupLibraryScenario(opts: { relations?: RelationSchema[] } = {}): {
  graph: Graph
  factStore: FactStore
  eventStore: EventStore
  causalGraph: ReturnType<typeof buildLibraryCausalGraph>
} {
  clearRules()
  registerLibraryRules()

  return {
    graph: seedLibraryGraph(opts.relations),
    factStore: seedLibraryFactStore(),
    eventStore: seedLibraryEventStore(),
    causalGraph: buildLibraryCausalGraph(),
  }
}
