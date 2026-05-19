import { describe, expect, it } from 'vitest'
import { OPEN_POLICY } from '../../../policy/context'
import { GraphQueryEngine } from '../../../runtime/query-engine'
import type { GraphQuery } from '../../../runtime/query-types'
import { seedGraph } from './seed'

// 所有测试共享同一张图（21 节点，38 条边）
const graph = seedGraph()
const engine = new GraphQueryEngine(graph, OPEN_POLICY)

// ─── 辅助 ────────────────────────────────────────────────────────────────────

async function getData(result: Promise<Awaited<ReturnType<GraphQueryEngine['execute']>>>) {
  const r = await result
  if (!r.ok) throw new Error(`query failed: [${r.code}] ${r.message}`)
  return r.data as any
}

function ids(data: any): string[] {
  return data.rows.map((r: any) => r.nodeId)
}

// ─── 1. MATCH only ───────────────────────────────────────────────────────────

describe('graph_query: MATCH only', () => {
  it('返回全部 4 个 Reader', async () => {
    const q: GraphQuery = { match: { type: 'Reader' } }
    const d = await getData(engine.execute(q))
    expect(d.mode).toBe('nodes')
    expect(d.rows).toHaveLength(4)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'xiao_hong', 'lao_wang', 'xiao_li']))
  })

  it('按 membershipLevel=gold 过滤 Reader', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }] },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(2)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'xiao_li']))
  })

  it('按 currentBorrowCount=3 过滤 Reader（老王借满）', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'currentBorrowCount', op: 'eq', value: 3 }] },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].nodeId).toBe('lao_wang')
  })

  it('找所有新书（daysOnShelf < 7）：book_hp3 和 book_quantum', async () => {
    const q: GraphQuery = {
      match: { type: 'Book', where: [{ property: 'daysOnShelf', op: 'lt', value: 7 }] },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(2)
    expect(ids(d)).toEqual(expect.arrayContaining(['book_hp3', 'book_quantum']))
  })

  it('找无库存书（availableCopies=0）：book_tb2 和 book_hp2', async () => {
    const q: GraphQuery = {
      match: { type: 'Book', where: [{ property: 'availableCopies', op: 'eq', value: 0 }] },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(2)
    expect(ids(d)).toEqual(expect.arrayContaining(['book_tb2', 'book_hp2']))
  })

  it('按名字找 Reader（contains）', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'name', op: 'contains', value: '明' }] },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].nodeId).toBe('xiao_ming')
  })

  it('membershipLevel in [gold, silver] 过滤', async () => {
    const q: GraphQuery = {
      match: {
        type: 'Reader',
        where: [{ property: 'membershipLevel', op: 'in', value: ['gold', 'silver'] }],
      },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(3) // xiao_ming(gold), lao_wang(silver), xiao_li(gold)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'lao_wang', 'xiao_li']))
  })
})

// ─── 2. TRAVERSE 单跳 ────────────────────────────────────────────────────────

describe('graph_query: TRAVERSE 单跳', () => {
  it('xiao_ming 当前借阅的书', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'name', op: 'eq', value: '小明' }], alias: 'reader' },
      traverse: [{ relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' }],
      return: { alias: 'book' },
    }
    const d = await getData(engine.execute(q))
    expect(ids(d)).toEqual(expect.arrayContaining(['book_tb1', 'book_tb2']))
    expect(ids(d)).not.toContain('book_hp3')
  })

  it('lao_wang 借满 3 本：hp1、sapiens、tb1', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'name', op: 'eq', value: '老王' }], alias: 'reader' },
      traverse: [{ relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' }],
      return: { alias: 'book' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(3)
    expect(ids(d)).toEqual(expect.arrayContaining(['book_hp1', 'book_sapiens', 'book_tb1']))
  })

  it('找注册在 branch_west 的 Reader（require=exists + where 分馆名）', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', alias: 'reader' },
      traverse: [
        {
          relation: 'registered_at',
          direction: 'out',
          targetType: 'Branch',
          where: [{ property: 'name', op: 'eq', value: '西区分馆' }],
          require: 'exists',
        },
      ],
      return: { alias: 'reader' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(2)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_hong', 'xiao_li']))
  })
})

// ─── 3. require=exists / none ─────────────────────────────────────────────────

describe('graph_query: require=exists / none', () => {
  it('require=exists：有逾期书的 Reader（只有 xiao_li）', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'overdue', direction: 'out', require: 'exists' }],
      return: { alias: 'reader' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].nodeId).toBe('xiao_li')
  })

  it('require=none：没有逾期书的 Reader（3 个）', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'overdue', direction: 'out', require: 'none' }],
      return: { alias: 'reader' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(3)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'xiao_hong', 'lao_wang']))
    expect(ids(d)).not.toContain('xiao_li')
  })

  it('require=exists + where：借了科学类书（daysOnShelf >= 50）的 Reader', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', alias: 'reader' },
      traverse: [
        {
          relation: 'borrows',
          direction: 'out',
          targetType: 'Book',
          where: [{ property: 'daysOnShelf', op: 'gte', value: 50 }],
          require: 'exists',
        },
      ],
      return: { alias: 'reader' },
    }
    // xiao_ming 借了 tb1(100) tb2(80) ✓
    // lao_wang 借了 hp1(300) sapiens(90) tb1(100) ✓
    // xiao_li 借了 hp1(300) ✓
    // xiao_hong 没借书 ✗
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(3)
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'lao_wang', 'xiao_li']))
    expect(ids(d)).not.toContain('xiao_hong')
  })
})

// ─── 4. TRAVERSE 多跳 ────────────────────────────────────────────────────────

describe('graph_query: TRAVERSE 多跳', () => {
  it('2 跳：xiao_ming 借阅书的作者', async () => {
    // Reader(小明) → borrows → Book(tb1,tb2) → written_by → Author(刘慈欣)
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'name', op: 'eq', value: '小明' }], alias: 'reader' },
      traverse: [
        { relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' },
        { from: 'book', relation: 'written_by', direction: 'out', targetType: 'Author', alias: 'author' },
      ],
      return: { alias: 'author' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].nodeId).toBe('author_liu')
  })

  it('2 跳：gold 卡读者借阅书籍的作者（含两个作者）', async () => {
    // Reader(gold) → borrows → Book → written_by → Author
    // xiao_ming(gold) → tb1,tb2 → author_liu
    // xiao_li(gold)   → hp1     → author_rowling
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }], alias: 'reader' },
      traverse: [
        { relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' },
        { from: 'book', relation: 'written_by', direction: 'out', targetType: 'Author', alias: 'author' },
      ],
      return: { alias: 'author' },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows).toHaveLength(2)
    expect(ids(d)).toEqual(expect.arrayContaining(['author_liu', 'author_rowling']))
  })

  it('2 跳：branch_central 提供的书所属类目', async () => {
    // Branch(central) ← available_at ← Book → belongs_to → Category
    const q: GraphQuery = {
      match: { type: 'Branch', where: [{ property: 'name', op: 'eq', value: '中央图书馆' }], alias: 'branch' },
      traverse: [
        { relation: 'available_at', direction: 'in', targetType: 'Book', alias: 'book' },
        { from: 'book', relation: 'belongs_to', direction: 'out', targetType: 'Category', alias: 'cat' },
      ],
      return: { alias: 'cat' },
    }
    // central 有: tb1, tb2, hp1, hp2, quantum, sapiens, cosmos
    // 类目: cat_science(tb1,tb2,quantum), cat_fiction(hp1,hp2), cat_history(sapiens,cosmos)
    const d = await getData(engine.execute(q))
    expect(d.rows.length).toBeGreaterThanOrEqual(3)
    expect(ids(d)).toEqual(expect.arrayContaining(['cat_science', 'cat_fiction', 'cat_history']))
  })

  it('3 跳：Series → part_of(in) → Book → borrows(in) → Reader', async () => {
    // 找借阅过三体系列书的读者
    const q: GraphQuery = {
      match: { type: 'Series', where: [{ property: 'name', op: 'eq', value: '三体三部曲' }], alias: 'series' },
      traverse: [
        { relation: 'part_of', direction: 'in', targetType: 'Book', alias: 'book' },
        { from: 'book', relation: 'borrows', direction: 'in', targetType: 'Reader', alias: 'reader' },
      ],
      return: { alias: 'reader' },
    }
    // tb1 borrowed by: xiao_ming, lao_wang
    // tb2 borrowed by: xiao_ming
    // tb3 borrowed by: (nobody)
    const d = await getData(engine.execute(q))
    expect(ids(d)).toEqual(expect.arrayContaining(['xiao_ming', 'lao_wang']))
  })
})

// ─── 5. RETURN fields 投影 ───────────────────────────────────────────────────

describe('graph_query: RETURN fields projection', () => {
  it('只返回 Reader 的 name 和 membershipLevel', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', where: [{ property: 'name', op: 'eq', value: '小明' }] },
      return: { fields: ['name', 'membershipLevel'] },
    }
    const d = await getData(engine.execute(q))
    const props = d.rows[0].properties
    expect(props).toHaveProperty('name', '小明')
    expect(props).toHaveProperty('membershipLevel', 'gold')
    expect(props).not.toHaveProperty('currentBorrowCount')
    expect(props).not.toHaveProperty('registeredDays')
  })

  it('limit/offset 分页', async () => {
    const q1: GraphQuery = { match: { type: 'Book' }, return: { limit: 3, offset: 0 } }
    const q2: GraphQuery = { match: { type: 'Book' }, return: { limit: 3, offset: 3 } }
    const d1 = await getData(engine.execute(q1))
    const d2 = await getData(engine.execute(q2))
    expect(d1.rows).toHaveLength(3)
    expect(d1.total).toBe(9)
    // 第二页与第一页无重叠
    const ids1 = new Set(ids(d1))
    for (const id of ids(d2)) {
      expect(ids1.has(id)).toBe(false)
    }
  })
})

// ─── 6. 聚合 ─────────────────────────────────────────────────────────────────

describe('graph_query: aggregate', () => {
  it('count 全部 Book：9 本', async () => {
    const q: GraphQuery = {
      match: { type: 'Book' },
      return: { aggregate: { metrics: [{ field: '*', fn: 'count', as: 'total' }] } },
    }
    const d = await getData(engine.execute(q))
    expect(d.mode).toBe('aggregate')
    expect(d.rows[0].total).toBe(9)
  })

  it('avg daysOnShelf of Book ≈ 105.2', async () => {
    // (100+80+50+300+200+5+2+90+120) / 9 = 947/9 ≈ 105.22
    const q: GraphQuery = {
      match: { type: 'Book' },
      return: { aggregate: { metrics: [{ field: 'daysOnShelf', fn: 'avg', as: 'avg_days' }] } },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows[0].avg_days).toBeCloseTo(105.2, 0)
  })

  it('sum availableCopies of Book = 12', async () => {
    // tb1:1 tb2:0 tb3:2 hp1:2 hp2:0 hp3:1 quantum:1 sapiens:3 cosmos:2 = 12
    const q: GraphQuery = {
      match: { type: 'Book' },
      return: { aggregate: { metrics: [{ field: 'availableCopies', fn: 'sum', as: 'total_available' }] } },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows[0].total_available).toBe(12)
  })

  it('groupBy isRestricted：限制类目 1 个，非限制 2 个', async () => {
    const q: GraphQuery = {
      match: { type: 'Category' },
      return: {
        aggregate: {
          groupBy: 'isRestricted',
          metrics: [{ field: '*', fn: 'count', as: 'cnt' }],
        },
      },
    }
    const d = await getData(engine.execute(q))
    expect(d.mode).toBe('aggregate')
    const restricted = d.rows.find((r: any) => r.group === true)
    const open = d.rows.find((r: any) => r.group === false)
    expect(restricted?.cnt).toBe(1)
    expect(open?.cnt).toBe(2)
  })

  it('2 跳 + 聚合：刘慈欣所有书的 availableCopies 之和', async () => {
    // author_liu ← written_by ← Book(tb1,tb2,tb3,quantum)
    // available: 1+0+2+1 = 4
    const q: GraphQuery = {
      match: { type: 'Author', where: [{ property: 'name', op: 'eq', value: '刘慈欣' }], alias: 'author' },
      traverse: [{ relation: 'written_by', direction: 'in', targetType: 'Book', alias: 'book' }],
      return: {
        alias: 'book',
        aggregate: { metrics: [{ field: 'availableCopies', fn: 'sum', as: 'total_avail' }] },
      },
    }
    const d = await getData(engine.execute(q))
    expect(d.rows[0].total_avail).toBe(4)
  })
})

// ─── 7. 错误处理 ──────────────────────────────────────────────────────────────

describe('graph_query: error handling', () => {
  it('TRAVERSE from 引用不存在的 alias → INVALID_ARGS', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ from: 'ghost_alias', relation: 'borrows' }],
    }
    const result = await engine.execute(q)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_ARGS')
  })

  it('RETURN alias 不存在 → INVALID_ARGS', async () => {
    const q: GraphQuery = {
      match: { type: 'Reader' },
      return: { alias: 'no_such_alias' },
    }
    const result = await engine.execute(q)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_ARGS')
  })
})
