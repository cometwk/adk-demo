import { describe, it, expect } from 'vitest'
import { seedGraph } from '../seed'
import { OPEN_POLICY } from '../../../../policy/context'

/**
 * GraphStore.query 接口场景测试
 *
 * 数据来源：src/v8/demo/case/library/seed.ts
 * 场景对照：src/v8/guide/engine/graph-store.md § query 接口场景示例
 */

describe('GraphStore.query 场景测试', () => {
  const store = seedGraph()

  // ── 场景 1：简单匹配（无遍历）──

  it('S1-1: 查找所有 gold 卡读者', async () => {
    const result = await store.query({
      match: {
        type: 'Reader',
        where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }],
      },
      return: { fields: ['name', 'membershipLevel'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.mode).toBe('nodes')
    expect(result.data.rows.length).toBe(2) // xiao_ming, xiao_li
    expect(result.data.rows.map(r => r.properties.name)).toContain('小明')
    expect(result.data.rows.map(r => r.properties.name)).toContain('小李')
  })

  it('S1-2: 查找上架天数少于 7 天的书', async () => {
    const result = await store.query({
      match: {
        type: 'Book',
        where: [{ property: 'daysOnShelf', op: 'lt', value: 7 }],
      },
      return: { fields: ['title', 'daysOnShelf'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(2) // book_hp3(5天), book_quantum(2天)
    expect(result.data.rows.map(r => r.properties.daysOnShelf)).toContain(5)
    expect(result.data.rows.map(r => r.properties.daysOnShelf)).toContain(2)
  })

  // ── 场景 2：单跳遍历 ──

  it('S2-1: 查找小明借阅的所有书', async () => {
    const result = await store.query({
      match: {
        type: 'Reader',
        where: [{ property: 'name', op: 'eq', value: '小明' }],
        alias: 'reader',
      },
      traverse: [{ relation: 'borrows', direction: 'out', alias: 'book' }],
      return: { alias: 'book', fields: ['title'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(2) // book_tb1, book_tb2
    const titles = result.data.rows.map(r => r.properties.title)
    expect(titles).toContain('三体（第一部）')
    expect(titles).toContain('三体·黑暗森林（第二部）')
  })

  it('S2-2: 反向遍历 - 查找三体1被谁借阅', async () => {
    const result = await store.query({
      match: {
        type: 'Book',
        where: [{ property: 'title', op: 'contains', value: '三体' }],
        alias: 'book',
      },
      traverse: [{ relation: 'borrows', direction: 'in', alias: 'reader' }],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 三体系列共3本：tb1被小明和老王借，tb2被小明借，tb3无人借
    // 匹配 "三体" 会找到 3 本书，反向遍历 borrows 会找到 3 个借阅者
    const names = result.data.rows.map(r => r.properties.name)
    expect(names).toContain('小明')
    expect(names).toContain('老王')
  })

  it('S2-3: 双向遍历 - 查找书籍的所有关联节点', async () => {
    const result = await store.query({
      match: { type: 'Book', alias: 'book' },
      traverse: [{ relation: 'available_at', direction: 'both', alias: 'related' }],
      return: { alias: 'related' },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 书籍通过 available_at 连接到分馆
    expect(result.data.rows.some(r => r.type === 'Branch')).toBe(true)
  })

  // ── 场景 3：多跳遍历 ──

  it('S3-1: 读者 → 借阅书 → 作者（两跳）', async () => {
    const result = await store.query({
      match: {
        type: 'Reader',
        where: [{ property: 'name', op: 'eq', value: '小明' }],
        alias: 'reader',
      },
      traverse: [
        { relation: 'borrows', direction: 'out', alias: 'book' },
        { relation: 'written_by', direction: 'out', alias: 'author' },
      ],
      return: { alias: 'author', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 小明借了三体1和三体2，都是刘慈欣写的
    expect(result.data.rows.length).toBe(1)
    expect(result.data.rows[0].properties.name).toBe('刘慈欣')
  })

  it('S3-2: 读者 → 借阅书 → 分馆（两跳）', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [
        { relation: 'borrows', direction: 'out', alias: 'book' },
        { relation: 'available_at', direction: 'out', alias: 'branch' },
      ],
      return: { alias: 'branch', fields: ['name', 'maxBorrowPerReader'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.some(r => r.type === 'Branch')).toBe(true)
    expect(result.data.rows[0].properties.maxBorrowPerReader).toBe(3)
  })

  // ── 场景 4：from 跨步骤引用 ──

  it('S4: 从 book 分别遍历到 author 和 branch', async () => {
    const result = await store.query({
      match: { type: 'Book', alias: 'book' },
      traverse: [
        { relation: 'written_by', direction: 'out', alias: 'author' },
        { from: 'book', relation: 'available_at', direction: 'out', alias: 'branch' },
      ],
      return: { alias: 'author' },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.some(r => r.type === 'Author')).toBe(true)
  })

  // ── 场景 5：存在性断言（require: exists）──

  it('S5-1: 找出有逾期书的读者', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'overdue', direction: 'out', require: 'exists' }],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(1) // 只有小李有逾期
    expect(result.data.rows[0].properties.name).toBe('小李')
  })

  it('S5-2: 找出借了科学类书的读者', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [
        {
          relation: 'borrows',
          direction: 'out',
          targetType: 'Book',
          where: [{ property: 'title', op: 'contains', value: '三体' }],
          require: 'exists',
        },
      ],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 小明借了三体1+2，老王借了三体1
    expect(result.data.rows.length).toBe(2)
    expect(result.data.rows.map(r => r.properties.name)).toContain('小明')
    expect(result.data.rows.map(r => r.properties.name)).toContain('老王')
  })

  // ── 场景 6：反向断言（require: none）──

  it('S6-1: 找出没有逾期书的读者', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'overdue', direction: 'out', require: 'none' }],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(3) // 小明、小红、老王
    const names = result.data.rows.map(r => r.properties.name)
    expect(names).toContain('小明')
    expect(names).toContain('小红')
    expect(names).toContain('老王')
    expect(names).not.toContain('小李')
  })

  it('S6-2: 找出从未被借阅的书', async () => {
    const result = await store.query({
      match: { type: 'Book', alias: 'book' },
      traverse: [{ relation: 'borrows', direction: 'in', require: 'none' }],
      return: { alias: 'book', fields: ['title'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // tb3, hp3, quantum, cosmos 未被借阅（hp3 有预约但无借阅）
    const titles = result.data.rows.map(r => r.properties.title)
    expect(titles).toContain('三体·死神永生（第三部）')
    expect(titles).toContain('量子纠缠导论')
    expect(titles).toContain('宇宙的奇迹')
  })

  // ── 场景 7：目标类型过滤（targetType）──

  it('S7: 限制遍历目标的节点类型', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'borrows', direction: 'out', targetType: 'Book', alias: 'book' }],
      return: { alias: 'book' },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.every(r => r.type === 'Book')).toBe(true)
  })

  // ── 场景 8：目标属性过滤（where in traverse）──

  it('S8-1: 查找读者借阅的、上架天数超过 30 天的书', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [
        {
          relation: 'borrows',
          direction: 'out',
          where: [{ property: 'daysOnShelf', op: 'gt', value: 30 }],
          alias: 'oldBook',
        },
      ],
      return: { alias: 'oldBook', fields: ['title', 'daysOnShelf'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 小明借的 tb1(100天) tb2(80天) 都超过30天
    // 老王借的 hp1(300天) sapiens(90天) tb1(100天) 都超过30天
    // 小李借的 hp1(300天) 超过30天
    expect(result.data.rows.length).toBeGreaterThan(0)
    expect(result.data.rows.every(r => (r.properties.daysOnShelf as number) > 30)).toBe(true)
  })

  it('S8-2: 查找上架天数在 50-100 之间的书', async () => {
    // 用 findNodes 验证范围过滤（query 的 where 支持多条件 AND）
    const filtered = await store.findNodes({
      type: 'Book',
      where: [
        { property: 'daysOnShelf', op: 'gte', value: 50 },
        { property: 'daysOnShelf', op: 'lte', value: 100 },
      ],
    })

    // tb1(100), tb2(80), tb3(50), sapiens(90) 在范围内
    expect(filtered.items.length).toBe(4)
  })

  // ── 场景 9：属性投影（fields）──

  it('S9: 只返回需要的属性字段', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'borrows', direction: 'out', alias: 'book' }],
      return: { alias: 'book', fields: ['title'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 只返回 title 字段
    expect(result.data.rows.every(r => Object.keys(r.properties).length === 1)).toBe(true)
    expect(result.data.rows.every(r => 'title' in r.properties)).toBe(true)
  })

  // ── 场景 10：分页（limit / offset）──

  it('S10-1: 分页第一页', async () => {
    const result = await store.query({
      match: { type: 'Book' },
      return: { fields: ['title'], limit: 3, offset: 0 },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(3)
    // truncated 是工作集超过 maxWorkingSet(500) 时触发，不是返回行数少于总数时触发
  })

  it('S10-2: 分页第二页', async () => {
    const result = await store.query({
      match: { type: 'Book' },
      return: { fields: ['title'], limit: 3, offset: 3 },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(3)
    // 验证分页有效：offset=3 返回的是不同的书
    const page1 = await store.query({
      match: { type: 'Book' },
      return: { fields: ['title'], limit: 3, offset: 0 },
    }, OPEN_POLICY)
    if (!page1.ok) return
    const page1Ids = page1.data.rows.map(r => r.nodeId)
    const page2Ids = result.data.rows.map(r => r.nodeId)
    // 两页的 nodeId 应不同（分页生效）
    expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false)
  })

  // ── 场景 11：组合场景（多条件 + 多跳 + 存在性）──

  it('S11: 找出 gold 卡、有逾期书、且逾期书上架少于 10 天的读者', async () => {
    const result = await store.query({
      match: {
        type: 'Reader',
        where: [{ property: 'membershipLevel', op: 'eq', value: 'gold' }],
        alias: 'reader',
      },
      traverse: [
        {
          relation: 'overdue',
          direction: 'out',
          targetType: 'Book',
          where: [{ property: 'daysOnShelf', op: 'lt', value: 10 }],
          require: 'exists',
          alias: 'newOverdueBook',
        },
      ],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 小李是 gold 卡，逾期了 hp2(200天) - 不满足 <10天条件
    // 所以结果应为空
    expect(result.data.rows.length).toBe(0)
  })

  // ── 场景 12：返回起点（遍历后仍返回源节点）──

  it('S12: 遍历用于存在性断言，返回起点而非终点', async () => {
    const result = await store.query({
      match: { type: 'Reader', alias: 'reader' },
      traverse: [{ relation: 'overdue', direction: 'out', require: 'exists', alias: '_ignored' }],
      return: { alias: 'reader', fields: ['name'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows[0].type).toBe('Reader')
    expect(result.data.rows[0].properties.name).toBe('小李')
  })

  // ── 场景 13：多值过滤（op: 'in'）──

  it('S13: 查找 gold 或 silver 卡读者', async () => {
    const result = await store.query({
      match: {
        type: 'Reader',
        where: [{ property: 'membershipLevel', op: 'in', value: ['gold', 'silver'] }],
      },
      return: { fields: ['name', 'membershipLevel'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(3) // 小明、老王、小李
    const levels = result.data.rows.map(r => r.properties.membershipLevel)
    expect(levels).toContain('gold')
    expect(levels).toContain('silver')
  })

  // ── 场景 14：字符串包含匹配（op: 'contains'）──

  it('S14: 查找书名包含「三体」的书', async () => {
    const result = await store.query({
      match: {
        type: 'Book',
        where: [{ property: 'title', op: 'contains', value: '三体' }],
      },
      return: { fields: ['title', 'isbn'] },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(3) // tb1, tb2, tb3
    expect(result.data.rows.every(r => (r.properties.title as string).includes('三体'))).toBe(true)
  })

  // ── 场景 15：返回所有属性（不指定 fields）──

  it('S15: 省略 fields 时返回完整属性', async () => {
    const result = await store.query({
      match: { type: 'Branch', alias: 'lib' },
      return: { alias: 'lib' },
    }, OPEN_POLICY)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows.length).toBe(2) // branch_central, branch_west
    // 返回完整属性
    expect(result.data.rows[0].properties.name).toBeDefined()
    expect(result.data.rows[0].properties.maxBorrowPerReader).toBeDefined()
    expect(result.data.rows[0].properties.newBookProtectionDays).toBeDefined()
  })
})