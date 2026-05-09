import type { RelationSchema } from '../../../ontology/schema'
import { Graph } from '../../../runtime/graph'
import { Book, Library, Reader } from './ontology'

/*
扩展场景 seed：为 LLM-Agent 推理有效性验证提供多种典型场景。

新增读者：
  - xiao_hong: 无逾期、已借 0 本 → 理想状态，任何旧书都可借
  - lao_wang: 无逾期、已借 3 本 → 达到借阅上限
  - xiao_li: 有逾期、已借 1 本 → 仅逾期阻断

新增书籍：
  - book_erta: 上架 60 天，常规可借书籍
  - book_quantum: 上架 2 天，新书保护期内

场景覆盖矩阵：
  | 场景 | 读者 | 目标书 | R1(上限) | R2(新书) | R3(逾期) | 预期 |
  |------|------|--------|---------|---------|---------|------|
  | S1 - 全部通过 | xiao_hong | book_erta | ✗ | ✗ | ✗ | ALLOW |
  | S2 - 仅上限触发 | lao_wang | book_erta | ✓ | ✗ | ✗ | DENY |
  | S3 - 仅逾期触发 | xiao_li | book_erta | ✗ | ✗ | ✓ | DENY |
  | S4 - 仅新书触发 | xiao_hong | book_quantum | ✗ | ✓ | ✗ | DENY |
  | S5 - 双规则触发 | xiao_li | book_quantum | ✗ | ✓ | ✓ | DENY |
  | S6 - 原始场景(三规则中两条触发) | xiao_ming | book_ai_history | ✗ | ✓ | ✓ | DENY |
*/

export const data2 = {
  library: [{ id: 'city_library', maxBorrowPerReader: 3, newBookProtectionDays: 7 }],
  readers: [
    { id: 'xiao_ming', name: '小明', currentBorrowCount: 2, hasOverdueBook: true },
    { id: 'xiao_hong', name: '小红', currentBorrowCount: 0, hasOverdueBook: false },
    { id: 'lao_wang', name: '老王', currentBorrowCount: 3, hasOverdueBook: false },
    { id: 'xiao_li', name: '小李', currentBorrowCount: 1, hasOverdueBook: true },
  ],
  books: [
    { id: 'book_gone_with_wind', title: '飘', isbn: '978-0-7432-7356-5', daysOnShelf: 120, lendable: true },
    { id: 'book_three_body', title: '三体', isbn: '978-0-7653-2293-1', daysOnShelf: 45, lendable: true },
    { id: 'book_old_man_and_sea', title: '老人与海', isbn: '978-0-684-80122-3', daysOnShelf: 90, lendable: true },
    { id: 'book_ai_history', title: '人工智能简史', isbn: '978-7-115-54672-0', daysOnShelf: 3, lendable: true },
    { id: 'book_sapiens', title: '人类简史', isbn: '978-0-06-231609-7', daysOnShelf: 60, lendable: true },
    { id: 'book_erta', title: '相对论导读', isbn: '978-7-03-041234-5', daysOnShelf: 60, lendable: true },
    { id: 'book_quantum', title: '量子力学前沿', isbn: '978-7-03-099876-1', daysOnShelf: 2, lendable: true },
  ],
  relations: [
    // xiao_ming 的关系
    { from: 'xiao_ming', to: 'book_gone_with_wind', type: 'borrows' },
    { from: 'xiao_ming', to: 'book_three_body', type: 'borrows' },
    { from: 'xiao_ming', to: 'book_old_man_and_sea', type: 'overdue' },
    { from: 'xiao_ming', to: 'book_ai_history', type: 'requests' },
    // lao_wang 借了 3 本书（达到上限）
    { from: 'lao_wang', to: 'book_gone_with_wind', type: 'borrows' },
    { from: 'lao_wang', to: 'book_sapiens', type: 'borrows' },
    { from: 'lao_wang', to: 'book_old_man_and_sea', type: 'borrows' },
    { from: 'lao_wang', to: 'book_erta', type: 'requests' },
    // xiao_li 有逾期
    { from: 'xiao_li', to: 'book_three_body', type: 'borrows' },
    { from: 'xiao_li', to: 'book_sapiens', type: 'overdue' },
    { from: 'xiao_li', to: 'book_quantum', type: 'requests' },
    // xiao_hong 无借阅记录
    { from: 'xiao_hong', to: 'book_erta', type: 'requests' },
    // 书籍归属
    { from: 'book_gone_with_wind', to: 'city_library', type: 'managed_by' },
    { from: 'book_three_body', to: 'city_library', type: 'managed_by' },
    { from: 'book_old_man_and_sea', to: 'city_library', type: 'managed_by' },
    { from: 'book_ai_history', to: 'city_library', type: 'managed_by' },
    { from: 'book_sapiens', to: 'city_library', type: 'managed_by' },
    { from: 'book_erta', to: 'city_library', type: 'managed_by' },
    { from: 'book_quantum', to: 'city_library', type: 'managed_by' },
  ],
}

export function seedGraph2(relations?: RelationSchema[]): Graph {
  const g = new Graph({ relations })

  for (const library of data2.library) {
    g.addNode(new Library(library))
  }
  for (const reader of data2.readers) {
    g.addNode(new Reader(reader))
  }
  for (const book of data2.books) {
    g.addNode(new Book(book))
  }

  for (const rel of data2.relations) {
    g.addEdge(rel)
  }

  return g
}
