import { CausalGraph } from '../../../ontology/causal'
import type { RelationSchema } from '../../../ontology/schema'
import { EventStore, FactStore } from '../../../runtime/eventStore'
import { Graph } from '../../../runtime/graph'
import { Book, Library, Reader } from './ontology'

/*
## 场景

> **小明想借《人工智能简史》**

图书馆规定：

| 编号 | 规则                                              | 类型            |
| ---- | ------------------------------------------------- | --------------- |
| R1   | 每个读者最多只能借 **3 本书**                     | hard_constraint |
| R2   | **新书（上架不到 7 天）**不能外借，只能在馆内阅读 | hard_constraint |
| R3   | 如果读者**有逾期未还的书**，就不能再借新书        | hard_constraint |

当前小明的状态：

- 已借 2 本（《飘》《三体》）→ R1 **未触发**（未满上限）
- 有 1 本逾期未还（《老人与海》借期超 3 天）→ R3 **触发**
- 目标书《人工智能简史》上架仅 3 天 → R2 **触发**

── 场景说明 ──

小明（xiao_ming）想借《人工智能简史》（book_ai_history）

当前状态：
  - 小明已借 2 本书（book_gone_with_wind, book_three_body）
  - 小明有 1 本书逾期未还（book_old_man_and_sea，借期已过 3 天）
  - 《人工智能简史》3 天前刚上架（处于 7 天新书保护期）

规则触发情况：
  Rule 1 borrow_limit_exceeded : 已借 2 本，未满 3 本 → 不触发
  Rule 2 new_book_not_lendable : 书上架仅 3 天，< 7 天 → 触发（VETO ALLOWED）
  Rule 3 overdue_blocks_borrow : 小明有逾期书籍 → 触发（VETO ALLOWED）

*/

export const data = {
  library: [{ id: 'city_library', maxBorrowPerReader: 3, newBookProtectionDays: 7 }],
  reader: [{ id: 'xiao_ming', name: '小明', currentBorrowCount: 2, hasOverdueBook: true }],
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

export function seedGraph(relations?: RelationSchema[]): Graph {
  const g = new Graph({ relations })

  // Library
  for (const library of data.library) {
    g.addNode(new Library(library))
  }

  // Reader — 小明
  for (const reader of data.reader) {
    g.addNode(new Reader(reader))
  }

  // Books
  for (const book of data.books) {
    g.addNode(new Book(book))
  }

  // Relations
  // for (const relation of data.relations) {
  //   g.addEdge(relation)
  // }

  return g
}
