import { Graph } from '../../runtime/graph'
import { EventStore, FactStore } from '../../runtime/eventStore'
import { clearRules } from '../../ontology/rules'
import type { FactBinding } from '../../runtime/types'
import { Reader, Book, Library, BorrowRecord } from './entities'
import { registerLibraryRules } from './rules'
import { buildLibraryCausalGraph } from './causal'

// ── Graph seed ──
// 场景：小明想借一本书
// 设定多个测试场景：正常借阅、达到上限、新书限制、逾期阻止

export function seedLibraryGraph(): Graph {
  const g = new Graph()

  // 图书馆
  const mainLib = new Library('main_library', '市中心图书馆', 3, 7)

  // 读者（不同状态）
  const xiaoming = new Reader('xiaoming', 2, false, 0) // 小明：已借 2 本，无逾期
  const zhangsan = new Reader('zhangsan', 3, false, 0) // 张三：已借 3 本，达到上限
  const lisi = new Reader('lisi', 1, true, 2) // 李四：已借 1 本，有 2 本逾期
  const wangwu = new Reader('wangwu', 0, false, 0) // 王五：无借阅，无逾期

  // 图书（不同状态）
  const book1 = new Book(
    'book_design_patterns',
    '设计模式：可复用面向对象软件的基础',
    'textbook',
    false,
    '2026-04-01T00:00:00.000Z', // 上架 20+ 天，非新书
    true,
    'available'
  )

  const book2 = new Book(
    'book_new_ai',
    '人工智能前沿技术',
    'textbook',
    true,
    '2026-05-01T00:00:00.000Z', // 上架仅 2 天，新书
    true,
    'available'
  )

  const book3 = new Book(
    'book_clean_code',
    '代码整洁之道',
    'textbook',
    false,
    '2026-03-15T00:00:00.000Z',
    true,
    'borrowed' // 已被借出
  )

  const book4 = new Book(
    'book_reference_manual',
    '技术参考手册',
    'reference',
    false,
    '2026-04-10T00:00:00.000Z',
    false, // 不可外借（参考书）
    'in_library_only'
  )

  // 借阅记录
  const record1 = new BorrowRecord(
    'record_xiaoming_1',
    '2026-04-20T00:00:00.000Z',
    '2026-05-20T00:00:00.000Z',
    null,
    false
  )

  const record2 = new BorrowRecord(
    'record_xiaoming_2',
    '2026-04-25T00:00:00.000Z',
    '2026-05-25T00:00:00.000Z',
    null,
    false
  )

  const record3 = new BorrowRecord(
    'record_lisi_overdue_1',
    '2026-03-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z',
    null,
    true // 逾期
  )

  const record4 = new BorrowRecord(
    'record_lisi_overdue_2',
    '2026-03-10T00:00:00.000Z',
    '2026-04-10T00:00:00.000Z',
    null,
    true // 逾期
  )

  for (const node of [
    mainLib,
    xiaoming,
    zhangsan,
    lisi,
    wangwu,
    book1,
    book2,
    book3,
    book4,
    record1,
    record2,
    record3,
    record4,
  ]) {
    g.addNode(node)
  }

  // 读者 → 图书馆
  g.addEdge({ from: 'xiaoming', to: 'main_library', type: 'member_of' })
  g.addEdge({ from: 'zhangsan', to: 'main_library', type: 'member_of' })
  g.addEdge({ from: 'lisi', to: 'main_library', type: 'member_of' })
  g.addEdge({ from: 'wangwu', to: 'main_library', type: 'member_of' })

  // 图书馆 → 图书
  g.addEdge({
    from: 'main_library',
    to: 'book_design_patterns',
    type: 'holds',
  })
  g.addEdge({ from: 'main_library', to: 'book_new_ai', type: 'holds' })
  g.addEdge({ from: 'main_library', to: 'book_clean_code', type: 'holds' })
  g.addEdge({
    from: 'main_library',
    to: 'book_reference_manual',
    type: 'holds',
  })

  // 读者 → 借阅记录
  g.addEdge({ from: 'xiaoming', to: 'record_xiaoming_1', type: 'has_record' })
  g.addEdge({ from: 'xiaoming', to: 'record_xiaoming_2', type: 'has_record' })
  g.addEdge({ from: 'lisi', to: 'record_lisi_overdue_1', type: 'has_record' })
  g.addEdge({ from: 'lisi', to: 'record_lisi_overdue_2', type: 'has_record' })

  // 借阅记录 → 图书
  g.addEdge({
    from: 'record_xiaoming_1',
    to: 'book_design_patterns',
    type: 'for_book',
  })
  g.addEdge({
    from: 'record_xiaoming_2',
    to: 'book_clean_code',
    type: 'for_book',
  })
  g.addEdge({
    from: 'record_lisi_overdue_1',
    to: 'book_design_patterns',
    type: 'for_book',
  })
  g.addEdge({
    from: 'record_lisi_overdue_2',
    to: 'book_clean_code',
    type: 'for_book',
  })

  // 当前借阅关系（谁借了什么）
  g.addEdge({ from: 'xiaoming', to: 'book_design_patterns', type: 'borrows' })
  g.addEdge({ from: 'xiaoming', to: 'book_clean_code', type: 'borrows' }) // 注意：book_clean_code 被 xiaoming 借了

  return g
}

// ── FactStore seed (predictive: current state snapshot) ──
// 设定当前时间为 2026-05-03

export function seedLibraryFactStore(): FactStore {
  const now = '2026-05-03T00:00:00.000Z'
  const bindings: FactBinding[] = [
    // Global context
    {
      entityId: 'global',
      property: 'currentTime',
      value: now,
      source: { kind: 'user_input' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    // Reader properties
    {
      entityId: 'xiaoming',
      property: 'borrowedCount',
      value: 2,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'xiaoming',
      property: 'hasOverdue',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'xiaoming',
      property: 'overdueCount',
      value: 0,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    {
      entityId: 'zhangsan',
      property: 'borrowedCount',
      value: 3,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'zhangsan',
      property: 'hasOverdue',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'zhangsan',
      property: 'overdueCount',
      value: 0,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    {
      entityId: 'lisi',
      property: 'borrowedCount',
      value: 1,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'lisi',
      property: 'hasOverdue',
      value: true,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'lisi',
      property: 'overdueCount',
      value: 2,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    {
      entityId: 'wangwu',
      property: 'borrowedCount',
      value: 0,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'wangwu',
      property: 'hasOverdue',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'wangwu',
      property: 'overdueCount',
      value: 0,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    // Book properties
    {
      entityId: 'book_design_patterns',
      property: 'title',
      value: '设计模式',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_design_patterns',
      property: 'category',
      value: 'textbook',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_design_patterns',
      property: 'isNew',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_design_patterns',
      property: 'shelvedAt',
      value: '2026-04-01T00:00:00.000Z',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_design_patterns',
      property: 'canCheckout',
      value: true,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_design_patterns',
      property: 'status',
      value: 'borrowed',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    }, // 被 xiaoming 借了
    {
      entityId: 'book_design_patterns',
      property: 'daysSinceShelved',
      value: 32,
      source: { kind: 'derived' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    {
      entityId: 'book_new_ai',
      property: 'title',
      value: '人工智能前沿技术',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'category',
      value: 'textbook',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'isNew',
      value: true,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'shelvedAt',
      value: '2026-05-01T00:00:00.000Z',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'canCheckout',
      value: true,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'status',
      value: 'available',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_new_ai',
      property: 'daysSinceShelved',
      value: 2,
      source: { kind: 'derived' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    }, // 新书！

    {
      entityId: 'book_clean_code',
      property: 'title',
      value: '代码整洁之道',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'category',
      value: 'textbook',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'isNew',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'shelvedAt',
      value: '2026-03-15T00:00:00.000Z',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'canCheckout',
      value: true,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'status',
      value: 'borrowed',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_clean_code',
      property: 'daysSinceShelved',
      value: 49,
      source: { kind: 'derived' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    {
      entityId: 'book_reference_manual',
      property: 'title',
      value: '技术参考手册',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'category',
      value: 'reference',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'isNew',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'shelvedAt',
      value: '2026-04-10T00:00:00.000Z',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'canCheckout',
      value: false,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'status',
      value: 'in_library_only',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'book_reference_manual',
      property: 'daysSinceShelved',
      value: 23,
      source: { kind: 'derived' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },

    // Library properties
    {
      entityId: 'main_library',
      property: 'name',
      value: '市中心图书馆',
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'main_library',
      property: 'borrowLimit',
      value: 3,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
    {
      entityId: 'main_library',
      property: 'newBookRestrictionDays',
      value: 7,
      source: { kind: 'graph_property' },
      confidence: 1.0,
      validFrom: now,
      observedAt: now,
    },
  ]
  return new FactStore(bindings)
}

// ── EventStore seed (diagnostic: borrow rejection timeline) ──
// 场景：小明想借新书，被拒绝的归因分析

export function seedLibraryEventStore(): EventStore {
  const store = new EventStore()

  // T-10d: 李四借了两本书
  store.addEvent({
    id: 'evt_lisi_borrow_1',
    type: 'book_borrowed',
    occurredAt: '2026-03-01T10:00:00.000Z',
    actorId: 'lisi',
    affectedEntities: ['lisi', 'book_design_patterns'],
    payload: { recordId: 'record_lisi_overdue_1', dueDate: '2026-04-01' },
  })

  store.addEvent({
    id: 'evt_lisi_borrow_2',
    type: 'book_borrowed',
    occurredAt: '2026-03-10T10:00:00.000Z',
    actorId: 'lisi',
    affectedEntities: ['lisi', 'book_clean_code'],
    payload: { recordId: 'record_lisi_overdue_2', dueDate: '2026-04-10' },
  })

  // T-4d: 李四逾期未还（应还日期已过）
  store.addEvent({
    id: 'evt_lisi_overdue_1',
    type: 'due_date_passed',
    occurredAt: '2026-04-01T23:59:00.000Z',
    actorId: 'system',
    affectedEntities: ['lisi', 'book_design_patterns'],
    payload: { recordId: 'record_lisi_overdue_1', overdueDays: 0 },
    derivedBindings: [
      {
        entityId: 'lisi',
        property: 'hasOverdue',
        value: true,
        source: { kind: 'derived', ref: 'evt_lisi_overdue_1' },
        confidence: 1.0,
        validFrom: '2026-04-01T23:59:00.000Z',
        observedAt: '2026-04-01T23:59:00.000Z',
      },
    ],
  })

  store.addEvent({
    id: 'evt_lisi_overdue_2',
    type: 'due_date_passed',
    occurredAt: '2026-04-10T23:59:00.000Z',
    actorId: 'system',
    affectedEntities: ['lisi', 'book_clean_code'],
    payload: { recordId: 'record_lisi_overdue_2', overdueDays: 0 },
  })

  // T-2d: 新书上架
  store.addEvent({
    id: 'evt_new_book_shelved',
    type: 'book_shelved',
    occurredAt: '2026-05-01T09:00:00.000Z',
    actorId: 'library_staff',
    affectedEntities: ['book_new_ai', 'main_library'],
    payload: { isNew: true, causalEdgeId: 'ce_new_book_restricted' },
    derivedBindings: [
      {
        entityId: 'book_new_ai',
        property: 'isNew',
        value: true,
        source: { kind: 'derived', ref: 'evt_new_book_shelved' },
        confidence: 1.0,
        validFrom: '2026-05-01T09:00:00.000Z',
        observedAt: '2026-05-01T09:00:00.000Z',
      },
      {
        entityId: 'book_new_ai',
        property: 'shelvedAt',
        value: '2026-05-01T09:00:00.000Z',
        source: { kind: 'derived', ref: 'evt_new_book_shelved' },
        confidence: 1.0,
        validFrom: '2026-05-01T09:00:00.000Z',
        observedAt: '2026-05-01T09:00:00.000Z',
      },
    ],
  })

  // T-0: 小明尝试借新书（被拒绝）
  store.addEvent({
    id: 'evt_borrow_rejected',
    type: 'borrow_rejected',
    occurredAt: '2026-05-03T14:00:00.000Z',
    actorId: 'xiaoming',
    affectedEntities: ['xiaoming', 'book_new_ai', 'main_library'],
    payload: {
      reason: 'new_book_restricted',
      blockedBy: ['new_book_restricted'],
      daysSinceShelved: 2,
    },
  })

  // T-0: 李四尝试借书（被拒绝，因为有逾期）
  store.addEvent({
    id: 'evt_lisi_rejected',
    type: 'borrow_rejected',
    occurredAt: '2026-05-03T15:00:00.000Z',
    actorId: 'lisi',
    affectedEntities: ['lisi', 'book_design_patterns', 'main_library'],
    payload: {
      reason: 'reader_overdue_block',
      blockedBy: ['reader_overdue_block'],
      overdueCount: 2,
    },
  })

  return store
}

// ── Full scenario setup ──

export function setupLibraryScenario(): {
  graph: Graph
  factStore: FactStore
  eventStore: EventStore
  causalGraph: ReturnType<typeof buildLibraryCausalGraph>
} {
  clearRules()
  registerLibraryRules()

  return {
    graph: seedLibraryGraph(),
    factStore: seedLibraryFactStore(),
    eventStore: seedLibraryEventStore(),
    causalGraph: buildLibraryCausalGraph(),
  }
}
