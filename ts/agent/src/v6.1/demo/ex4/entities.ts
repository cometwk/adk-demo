import { z } from 'zod'
import { AgentMethodRegistry, agentMethod, agentProperty, type MethodSchema } from '../../runtime/decorator'
import { BaseNode } from '../../runtime/graph'

// ── Reader（读者）──
// 代表图书馆的一名读者，记录当前借书状态。

export class Reader extends BaseNode {
  @agentProperty({
    returns: 'number',
    description: '当前已借出且未归还的书籍数量',
  })
  currentBorrowCount: number

  @agentProperty({ returns: 'boolean', description: '是否有逾期未还的书籍' })
  hasOverdueBook: boolean

  @agentProperty({ returns: 'string', description: '读者姓名' })
  name: string

  constructor(id: string, name: string, currentBorrowCount: number, hasOverdueBook: boolean) {
    super(id)
    this.name = name
    this.currentBorrowCount = currentBorrowCount
    this.hasOverdueBook = hasOverdueBook
  }

  @agentMethod({
    returns: '{ eligible: boolean; reason?: string }',
    description: '检查读者是否满足基本借阅资格：未超借阅上限且无逾期书籍',
    requiredFacts: ['currentBorrowCount', 'hasOverdueBook'],
    relatedRuleIds: ['borrow_limit_exceeded', 'overdue_blocks_borrow'],
  })
  checkBorrowEligibility(_args: Record<string, never> = {}): {
    eligible: boolean
    reason?: string
  } {
    if (this.currentBorrowCount >= 3) {
      return {
        eligible: false,
        reason: `已借 ${this.currentBorrowCount} 本，达到上限 3 本`,
      }
    }
    if (this.hasOverdueBook) {
      return { eligible: false, reason: '有逾期未还书籍，借阅权限暂停' }
    }
    return { eligible: true }
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Reader')
  }
}

// ── Book（书籍）──
// 代表图书馆馆藏中的一本书。

export class Book extends BaseNode {
  @agentProperty({ returns: 'string', description: '书名' })
  title: string

  @agentProperty({ returns: 'string', description: 'ISBN 编号' })
  isbn: string

  @agentProperty({ returns: 'number', description: '上架距今天数（天）' })
  daysOnShelf: number

  @agentProperty({
    returns: 'boolean',
    description: '是否允许外借（馆员手动标注）',
  })
  lendable: boolean

  constructor(id: string, title: string, isbn: string, daysOnShelf: number, lendable: boolean) {
    super(id)
    this.title = title
    this.isbn = isbn
    this.daysOnShelf = daysOnShelf
    this.lendable = lendable
  }

  @agentMethod({
    params: z.object({ newBookThresholdDays: z.number().default(7) }),
    returns: '{ isNew: boolean; daysOnShelf: number; thresholdDays: number }',
    description: '判断是否为新书（上架不足 N 天），新书不允许外借',
    requiredFacts: ['daysOnShelf'],
    relatedRuleIds: ['new_book_not_lendable'],
    preconditions: [
      {
        param: 'newBookThresholdDays',
        check: 'must_be_positive',
        description: 'newBookThresholdDays must be a positive integer',
      },
    ],
  })
  checkNewBookStatus(args: { newBookThresholdDays: number } = { newBookThresholdDays: 7 }): {
    isNew: boolean
    daysOnShelf: number
    thresholdDays: number
  } {
    return {
      isNew: this.daysOnShelf < args.newBookThresholdDays,
      daysOnShelf: this.daysOnShelf,
      thresholdDays: args.newBookThresholdDays,
    }
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Book')
  }
}

// ── Library（图书馆）──
// 代表图书馆整体，持有借阅规则配置。

export class Library extends BaseNode {
  @agentProperty({
    returns: 'number',
    description: '每位读者最多可同时借阅的书籍数量（上限）',
  })
  maxBorrowPerReader: number

  @agentProperty({
    returns: 'number',
    description: '新书保护期（天）：上架不足此天数不可外借',
  })
  newBookProtectionDays: number

  constructor(id: string, maxBorrowPerReader: number, newBookProtectionDays: number) {
    super(id)
    this.maxBorrowPerReader = maxBorrowPerReader
    this.newBookProtectionDays = newBookProtectionDays
  }

  @agentMethod({
    params: z.object({ readerId: z.string(), bookId: z.string() }),
    returns: '{ allowed: boolean; blockedReasons: string[] }',
    description: '综合评估指定读者是否可以借阅指定书籍，返回所有阻断原因',
    requiredFacts: ['maxBorrowPerReader', 'newBookProtectionDays'],
    relatedRuleIds: ['borrow_limit_exceeded', 'new_book_not_lendable', 'overdue_blocks_borrow'],
    preconditions: [
      {
        param: 'readerId',
        check: 'must_be_in_facts',
        description: 'readerId must reference an existing reader node',
      },
    ],
  })
  evaluateBorrowRequest(args: { readerId: string; bookId: string }): {
    allowed: boolean
    blockedReasons: string[]
  } {
    // This is a stub — real evaluation happens via the rule engine using FactStore.
    // The method signature serves as documentation for the agent.
    void args
    return {
      allowed: false,
      blockedReasons: ['evaluation delegated to rule engine'],
    }
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Library')
  }
}
