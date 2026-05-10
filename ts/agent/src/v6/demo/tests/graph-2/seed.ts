import type { RelationSchema } from '../../../ontology/schema'
import { Graph } from '../../../runtime/graph'
import { Author, Book, Branch, Category, Reader, Series } from './ontology'

/*
## 增强版图书馆场景 — Graph-2

图结构包含 6 种实体类型、10 种关系、约 21 个节点、约 38 条边。

### 分馆拓扑（Branch 自引用）

  branch_central（主馆） ←─ partners_with ─→ branch_west（西区馆）

### 类目体系

  cat_science：限制类目，需金卡（gold）
  cat_fiction：开放类目，basic 即可
  cat_history：开放类目，basic 即可

### 作者 → 类目专长

  author_liu（刘慈欣）→ specializes_in → cat_science
  author_rowling（J.K.罗琳）→ specializes_in → cat_fiction

### 系列

  series_three_body（三体三部曲，3 卷）
  series_hp（哈利波特，7 卷，但本馆仅有前 3 卷）

### 书籍

  book_tb1（三体·卷1，科学类，100天，主馆+西馆）
  book_tb2（三体·卷2，科学类，80天，主馆）
  book_tb3（三体·卷3，科学类，50天，西馆）
  book_hp1（HP·卷1，文学类，300天，主馆+西馆，4册/2可借）
  book_hp2（HP·卷2，文学类，200天，主馆，2册/0可借←全借出）
  book_hp3（HP·卷3，文学类，5天，西馆，新书保护期内）
  book_quantum（量子纠缠导论，科学类，2天，主馆，新书+限制类目）
  book_sapiens（人类简史，历史类，90天，主馆+西馆）

### 读者状态

  xiao_ming：gold卡，已借2本（tb1+tb2），无逾期，主馆，注册365天
  xiao_hong：basic卡，0借，无逾期，西馆，注册30天
  lao_wang：silver卡，已借3本（hp1+sapiens+tb1），无逾期，主馆，注册720天
  xiao_li：gold卡，已借1本（hp1），有逾期（hp2到期未还），西馆，注册180天

### 测试场景对应关系（见 t1.test.ts）

  S1  全部通过：xiao_hong 借 book_sapiens（2跳检查分馆限额）
  S2  借阅上限：lao_wang 借 book_sapiens（3借满，需从 Branch 获取上限）
  S3  逾期阻断：xiao_li 借 book_sapiens（需遍历 overdue 边确认）
  S4  限制类目：xiao_hong(basic) 借 book_tb1（科学类需 gold，2跳+跨实体比较）
  S5  新书保护：xiao_ming 借 book_hp3（5天 < 7天保护期，需从 Branch 获取保护天数）
  S6  系列顺序：xiao_ming 借 book_tb3（已有卷1+卷2，可借卷3；3-4跳集合推理）
  S7  跨馆调拨：xiao_hong 借 book_cosmos（仅主馆有货，西馆需通过 partners_with 发现）
  S8  热门作者：聚合刘慈欣所有书的借阅量后判断是否热门（2跳+聚合）
  S9  预约上限：book_hp3 预约数 > 5 → 拒绝新预约（反向计数聚合）
  S10 综合：xiao_hong(basic) 借 book_quantum（新书+限制类目双规则叠加）
*/

export const data = {
  branches: [
    { id: 'branch_central', name: '中央图书馆', maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true },
    { id: 'branch_west', name: '西区分馆', maxBorrowPerReader: 3, newBookProtectionDays: 7, allowInterLibraryLoan: true },
  ],
  categories: [
    { id: 'cat_science', name: '自然科学', isRestricted: true, requiredMembershipLevel: 'gold' as const },
    { id: 'cat_fiction', name: '文学虚构', isRestricted: false, requiredMembershipLevel: 'basic' as const },
    { id: 'cat_history', name: '历史人文', isRestricted: false, requiredMembershipLevel: 'basic' as const },
  ],
  authors: [
    { id: 'author_liu', name: '刘慈欣', nationality: '中国', activeBookCount: 4 },
    { id: 'author_rowling', name: 'J.K.罗琳', nationality: '英国', activeBookCount: 3 },
    { id: 'author_harari', name: '尤瓦尔·赫拉利', nationality: '以色列', activeBookCount: 1 },
  ],
  series: [
    { id: 'series_three_body', name: '三体三部曲', totalVolumes: 3 },
    { id: 'series_hp', name: '哈利波特', totalVolumes: 7 },
  ],
  books: [
    // 三体系列（科学类，刘慈欣）
    { id: 'book_tb1', title: '三体（第一部）', isbn: '978-7-229-03093-3', daysOnShelf: 100, totalCopies: 4, availableCopies: 1, seriesVolume: 1 },
    { id: 'book_tb2', title: '三体·黑暗森林（第二部）', isbn: '978-7-229-03094-0', daysOnShelf: 80, totalCopies: 3, availableCopies: 0, seriesVolume: 2 },
    { id: 'book_tb3', title: '三体·死神永生（第三部）', isbn: '978-7-229-03095-7', daysOnShelf: 50, totalCopies: 2, availableCopies: 2, seriesVolume: 3 },
    // 哈利波特系列（文学类，罗琳）
    { id: 'book_hp1', title: '哈利·波特与魔法石', isbn: '978-7-5327-4356-2', daysOnShelf: 300, totalCopies: 4, availableCopies: 2, seriesVolume: 1 },
    { id: 'book_hp2', title: '哈利·波特与密室', isbn: '978-7-5327-4357-9', daysOnShelf: 200, totalCopies: 2, availableCopies: 0, seriesVolume: 2 },
    { id: 'book_hp3', title: '哈利·波特与阿兹卡班的囚徒', isbn: '978-7-5327-4358-6', daysOnShelf: 5, totalCopies: 2, availableCopies: 1, seriesVolume: 3 },
    // 独立书目
    { id: 'book_quantum', title: '量子纠缠导论', isbn: '978-7-03-061234-8', daysOnShelf: 2, totalCopies: 1, availableCopies: 1, seriesVolume: 0 },
    { id: 'book_sapiens', title: '人类简史', isbn: '978-0-06-231609-7', daysOnShelf: 90, totalCopies: 5, availableCopies: 3, seriesVolume: 0 },
    // ILL 测试专用：只在主馆有库存，西区读者需通过馆际互借
    { id: 'book_cosmos', title: '宇宙的奇迹', isbn: '978-7-5327-9876-3', daysOnShelf: 120, totalCopies: 2, availableCopies: 2, seriesVolume: 0 },
  ],
  readers: [
    { id: 'xiao_ming', name: '小明', membershipLevel: 'gold' as const, currentBorrowCount: 2, registeredDays: 365 },
    { id: 'xiao_hong', name: '小红', membershipLevel: 'basic' as const, currentBorrowCount: 0, registeredDays: 30 },
    { id: 'lao_wang', name: '老王', membershipLevel: 'silver' as const, currentBorrowCount: 3, registeredDays: 720 },
    { id: 'xiao_li', name: '小李', membershipLevel: 'gold' as const, currentBorrowCount: 1, registeredDays: 180 },
  ],
  relations: [
    // ── 分馆互联 ──
    { from: 'branch_central', to: 'branch_west', type: 'partners_with' },
    { from: 'branch_west', to: 'branch_central', type: 'partners_with' },

    // ── 作者专长 ──
    { from: 'author_liu', to: 'cat_science', type: 'specializes_in' },
    { from: 'author_rowling', to: 'cat_fiction', type: 'specializes_in' },
    { from: 'author_harari', to: 'cat_history', type: 'specializes_in' },
    { from: 'book_cosmos', to: 'author_harari', type: 'written_by' },
    { from: 'book_cosmos', to: 'cat_history', type: 'belongs_to' },
    { from: 'book_cosmos', to: 'branch_central', type: 'available_at' },

    // ── 书籍 → 作者 ──
    { from: 'book_tb1', to: 'author_liu', type: 'written_by' },
    { from: 'book_tb2', to: 'author_liu', type: 'written_by' },
    { from: 'book_tb3', to: 'author_liu', type: 'written_by' },
    { from: 'book_quantum', to: 'author_liu', type: 'written_by' },
    { from: 'book_hp1', to: 'author_rowling', type: 'written_by' },
    { from: 'book_hp2', to: 'author_rowling', type: 'written_by' },
    { from: 'book_hp3', to: 'author_rowling', type: 'written_by' },
    { from: 'book_sapiens', to: 'author_harari', type: 'written_by' },

    // ── 书籍 → 类目 ──
    { from: 'book_tb1', to: 'cat_science', type: 'belongs_to' },
    { from: 'book_tb2', to: 'cat_science', type: 'belongs_to' },
    { from: 'book_tb3', to: 'cat_science', type: 'belongs_to' },
    { from: 'book_quantum', to: 'cat_science', type: 'belongs_to' },
    { from: 'book_hp1', to: 'cat_fiction', type: 'belongs_to' },
    { from: 'book_hp2', to: 'cat_fiction', type: 'belongs_to' },
    { from: 'book_hp3', to: 'cat_fiction', type: 'belongs_to' },
    { from: 'book_sapiens', to: 'cat_history', type: 'belongs_to' },

    // ── 书籍 → 系列 ──
    { from: 'book_tb1', to: 'series_three_body', type: 'part_of' },
    { from: 'book_tb2', to: 'series_three_body', type: 'part_of' },
    { from: 'book_tb3', to: 'series_three_body', type: 'part_of' },
    { from: 'book_hp1', to: 'series_hp', type: 'part_of' },
    { from: 'book_hp2', to: 'series_hp', type: 'part_of' },
    { from: 'book_hp3', to: 'series_hp', type: 'part_of' },

    // ── 书籍 → 分馆库存 ──
    { from: 'book_tb1', to: 'branch_central', type: 'available_at' },
    { from: 'book_tb1', to: 'branch_west', type: 'available_at' },
    { from: 'book_tb2', to: 'branch_central', type: 'available_at' },
    { from: 'book_tb3', to: 'branch_west', type: 'available_at' },
    { from: 'book_hp1', to: 'branch_central', type: 'available_at' },
    { from: 'book_hp1', to: 'branch_west', type: 'available_at' },
    { from: 'book_hp2', to: 'branch_central', type: 'available_at' },
    { from: 'book_hp3', to: 'branch_west', type: 'available_at' },
    { from: 'book_quantum', to: 'branch_central', type: 'available_at' },
    { from: 'book_sapiens', to: 'branch_central', type: 'available_at' },
    { from: 'book_sapiens', to: 'branch_west', type: 'available_at' },

    // ── 读者 → 分馆注册 ──
    { from: 'xiao_ming', to: 'branch_central', type: 'registered_at' },
    { from: 'xiao_hong', to: 'branch_west', type: 'registered_at' },
    { from: 'lao_wang', to: 'branch_central', type: 'registered_at' },
    { from: 'xiao_li', to: 'branch_west', type: 'registered_at' },

    // ── 读者 → 书籍借阅 ──
    // 小明：借了三体1+三体2（金卡，可借限制类目）
    { from: 'xiao_ming', to: 'book_tb1', type: 'borrows' },
    { from: 'xiao_ming', to: 'book_tb2', type: 'borrows' },
    // 老王：借了 hp1 + sapiens + tb1（silver卡，已借3本达上限）
    { from: 'lao_wang', to: 'book_hp1', type: 'borrows' },
    { from: 'lao_wang', to: 'book_sapiens', type: 'borrows' },
    { from: 'lao_wang', to: 'book_tb1', type: 'borrows' },
    // 小李：借了hp1（已还期但 hp2 逾期未还）
    { from: 'xiao_li', to: 'book_hp1', type: 'borrows' },
    { from: 'xiao_li', to: 'book_hp2', type: 'overdue' },

    // ── 预约（book_hp3 有 6 个预约，超过 5 个上限）──
    { from: 'xiao_hong', to: 'book_hp3', type: 'reserves' },
    { from: 'xiao_ming', to: 'book_hp3', type: 'reserves' },
    { from: 'lao_wang', to: 'book_hp3', type: 'reserves' },
    { from: 'xiao_li', to: 'book_hp3', type: 'reserves' },
    // 虚拟用户占满预约位
    { from: 'user_a', to: 'book_hp3', type: 'reserves' },
    { from: 'user_b', to: 'book_hp3', type: 'reserves' },
  ],
}

export function seedGraph(relations?: RelationSchema[]): Graph {
  const g = new Graph({ relations })

  for (const b of data.branches) {
    g.addNode(new Branch(b))
  }
  for (const c of data.categories) {
    g.addNode(new Category(c))
  }
  for (const a of data.authors) {
    g.addNode(new Author(a))
  }
  for (const s of data.series) {
    g.addNode(new Series(s))
  }
  for (const book of data.books) {
    g.addNode(new Book(book))
  }
  for (const reader of data.readers) {
    g.addNode(new Reader(reader))
  }

  for (const rel of data.relations) {
    g.addEdge(rel)
  }

  return g
}
