import { z } from 'zod'
import { agentMethod, agentProperty } from '../../runtime/decorator'
import { BaseNode } from '../../runtime/graph'

// ── Reader (读者) ──

export class Reader extends BaseNode {
  @agentProperty({ returns: 'number', description: '当前已借阅的图书数量' })
  borrowedCount: number

  @agentProperty({ returns: 'boolean', description: '是否有逾期未还的图书' })
  hasOverdue: boolean

  @agentProperty({ returns: 'number', description: '逾期图书数量' })
  overdueCount: number

  constructor(id: string, borrowedCount: number, hasOverdue: boolean, overdueCount: number) {
    super(id)
    this.borrowedCount = borrowedCount
    this.hasOverdue = hasOverdue
    this.overdueCount = overdueCount
  }

  @agentMethod({
    returns: '{ canBorrow: boolean; remainingSlots: number }',
    description: '检查读者是否可以继续借书（最多 3 本）',
    requiredFacts: ['borrowedCount'],
    relatedRuleIds: ['reader_borrow_limit'],
  })
  checkBorrowCapacity(_args: Record<string, never> = {}): {
    canBorrow: boolean
    remainingSlots: number
  } {
    const limit = 3
    const remaining = limit - this.borrowedCount
    return { canBorrow: remaining > 0, remainingSlots: remaining }
  }

  @agentMethod({
    returns: '{ blocked: boolean; reason: string | null }',
    description: '检查读者是否有逾期未还的图书（阻止借新书）',
    requiredFacts: ['hasOverdue', 'overdueCount'],
    relatedRuleIds: ['reader_overdue_block'],
  })
  checkOverdueBlock(_args: Record<string, never> = {}): {
    blocked: boolean
    reason: string | null
  } {
    if (this.hasOverdue) {
      return { blocked: true, reason: `有 ${this.overdueCount} 本逾期未还` }
    }
    return { blocked: false, reason: null }
  }
}

// ── Book (图书) ──

export class Book extends BaseNode {
  @agentProperty({ returns: 'string', description: '图书标题' })
  title: string

  @agentProperty({
    returns: 'string',
    description: '图书分类：fiction | nonfiction | reference | textbook',
  })
  category: 'fiction' | 'nonfiction' | 'reference' | 'textbook'

  @agentProperty({
    returns: 'boolean',
    description: '是否为新书（上架不到 7 天）',
  })
  isNew: boolean

  @agentProperty({ returns: 'string', description: '上架日期 (ISO format)' })
  shelvedAt: string

  @agentProperty({ returns: 'boolean', description: '是否可外借' })
  canCheckout: boolean

  @agentProperty({
    returns: "'available' | 'borrowed' | 'in_library_only'",
    description: '当前状态',
  })
  status: 'available' | 'borrowed' | 'in_library_only'

  constructor(
    id: string,
    title: string,
    category: 'fiction' | 'nonfiction' | 'reference' | 'textbook',
    isNew: boolean,
    shelvedAt: string,
    canCheckout: boolean,
    status: 'available' | 'borrowed' | 'in_library_only'
  ) {
    super(id)
    this.title = title
    this.category = category
    this.isNew = isNew
    this.shelvedAt = shelvedAt
    this.canCheckout = canCheckout
    this.status = status
  }

  @agentMethod({
    params: z.object({ currentTime: z.string() }),
    returns: '{ isNewBook: boolean; daysSinceShelved: number; canCheckout: boolean }',
    description: '检查图书是否为新书（上架 7 天内不可外借）',
    requiredFacts: ['shelvedAt', 'isNew'],
    relatedRuleIds: ['new_book_restricted'],
  })
  checkNewBookStatus(args: { currentTime: string }): {
    isNewBook: boolean
    daysSinceShelved: number
    canCheckout: boolean
  } {
    const shelvedDate = new Date(this.shelvedAt)
    const currentDate = new Date(args.currentTime)
    const daysSinceShelved = Math.floor((currentDate.getTime() - shelvedDate.getTime()) / (1000 * 60 * 60 * 24))
    const isNewBook = daysSinceShelved < 7
    // 新书只能在馆内阅读，不可外借
    const canCheckout = !isNewBook && this.canCheckout
    return { isNewBook, daysSinceShelved, canCheckout }
  }

  @agentMethod({
    returns: '{ available: boolean; reason: string | null }',
    description: '检查图书当前是否可借',
    requiredFacts: ['status', 'canCheckout'],
    relatedRuleIds: ['book_availability'],
  })
  checkAvailability(_args: Record<string, never> = {}): {
    available: boolean
    reason: string | null
  } {
    if (this.status === 'borrowed') {
      return { available: false, reason: '已被借出' }
    }
    if (this.status === 'in_library_only') {
      return { available: false, reason: '仅限馆内阅读' }
    }
    if (!this.canCheckout) {
      return { available: false, reason: '不可外借' }
    }
    return { available: true, reason: null }
  }
}

// ── Library (图书馆) ──

export class Library extends BaseNode {
  @agentProperty({ returns: 'string', description: '图书馆名称' })
  name: string

  @agentProperty({ returns: 'number', description: '单读者最大借阅数量' })
  borrowLimit: number

  @agentProperty({
    returns: 'number',
    description: '新书限制天数（上架 N 天内不可外借）',
  })
  newBookRestrictionDays: number

  constructor(id: string, name: string, borrowLimit: number, newBookRestrictionDays: number) {
    super(id)
    this.name = name
    this.borrowLimit = borrowLimit
    this.newBookRestrictionDays = newBookRestrictionDays
  }

  @agentMethod({
    params: z.object({ readerId: z.string(), bookId: z.string() }),
    returns: '{ allowed: boolean; blockedBy: string[]; reasons: string[] }',
    description: '综合检查借阅请求是否符合所有规则',
    requiredFacts: ['borrowLimit', 'newBookRestrictionDays'],
    relatedRuleIds: ['reader_borrow_limit', 'new_book_restricted', 'reader_overdue_block'],
  })
  evaluateBorrowRequest(_args: { readerId: string; bookId: string }): {
    allowed: boolean
    blockedBy: string[]
    reasons: string[]
  } {
    // 此方法需要配合 FactStore 使用，实际检查在规则系统中完成
    return { allowed: true, blockedBy: [], reasons: [] }
  }
}

// ── BorrowRecord (借阅记录) ──

export class BorrowRecord extends BaseNode {
  @agentProperty({ returns: 'string', description: '借阅日期 (ISO format)' })
  borrowedAt: string

  @agentProperty({ returns: 'string', description: '应还日期 (ISO format)' })
  dueDate: string

  @agentProperty({
    returns: 'string',
    description: '实际归还日期 (ISO format 或 null)',
  })
  returnedAt: string | null

  @agentProperty({ returns: 'boolean', description: '是否逾期' })
  isOverdue: boolean

  constructor(id: string, borrowedAt: string, dueDate: string, returnedAt: string | null, isOverdue: boolean) {
    super(id)
    this.borrowedAt = borrowedAt
    this.dueDate = dueDate
    this.returnedAt = returnedAt
    this.isOverdue = isOverdue
  }

  @agentMethod({
    params: z.object({ currentTime: z.string() }),
    returns: '{ overdue: boolean; daysOverdue: number }',
    description: '检查借阅记录是否逾期',
    requiredFacts: ['dueDate', 'returnedAt'],
    relatedRuleIds: ['reader_overdue_block'],
  })
  checkOverdue(args: { currentTime: string }): {
    overdue: boolean
    daysOverdue: number
  } {
    if (this.returnedAt !== null) {
      return { overdue: false, daysOverdue: 0 }
    }
    const dueDate = new Date(this.dueDate)
    const currentDate = new Date(args.currentTime)
    const daysOverdue = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return { overdue: daysOverdue > 0, daysOverdue: Math.max(0, daysOverdue) }
  }
}
