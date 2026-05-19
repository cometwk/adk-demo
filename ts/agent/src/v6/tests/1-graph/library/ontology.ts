import { z } from 'zod'
import { data } from './seed'
import { agentMethod, agentProperty, agentRelation, agentType } from '../../../runtime/decorator'
import { BaseNode } from '../../../runtime/graph'
import type { NodeId } from '../../../runtime/types'

// ─── 辅助：会员等级序数（basic < silver < gold）───

const LEVEL_RANK: Record<string, number> = { basic: 1, silver: 2, gold: 3 }

// ──────────────────────────────────────────────
// Reader（读者）
// ──────────────────────────────────────────────
// 持有会员证，可借阅、预约书籍，注册在某个分馆。

@agentType({ description: '图书馆读者，持有会员证，注册在某分馆，可借阅和预约书籍' })
export class Reader extends BaseNode {
  @agentProperty({ type: 'string', description: '读者姓名', agentVisible: true })
  name: string

  @agentProperty({
    type: 'string',
    description: "会员等级：'gold'（金卡）| 'silver'（银卡）| 'basic'（普通卡）",
  })
  membershipLevel: 'gold' | 'silver' | 'basic'

  @agentProperty({ type: 'number', description: '当前已借出且未归还的书籍数量' })
  currentBorrowCount: number

  @agentProperty({ type: 'number', description: '注册距今天数' })
  registeredDays: number

  constructor({
    id,
    name,
    membershipLevel,
    currentBorrowCount,
    registeredDays,
  }: {
    id: string
    name: string
    membershipLevel: 'gold' | 'silver' | 'basic'
    currentBorrowCount: number
    registeredDays: number
  }) {
    super(id)
    this.name = name
    this.membershipLevel = membershipLevel
    this.currentBorrowCount = currentBorrowCount
    this.registeredDays = registeredDays
  }

  @agentRelation({ type: 'borrows', toType: 'Book', description: '读者当前借阅（已借出、未归还）' })
  getBorrowedBooks(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'borrows').map((r) => r.to)
  }

  @agentRelation({ type: 'overdue', toType: 'Book', description: '读者持有的逾期未还书籍' })
  getOverdueBooks(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'overdue').map((r) => r.to)
  }

  @agentRelation({ type: 'reserves', toType: 'Book', description: '读者正在预约等待的书籍' })
  getReservedBooks(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'reserves').map((r) => r.to)
  }

  @agentRelation({ type: 'registered_at', toType: 'Branch', description: '读者注册所在的分馆' })
  getRegisteredBranch(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'registered_at').map((r) => r.to)
  }

  @agentMethod({
    params: z.object({
      branchMaxBorrow: z.number().describe('分馆允许的最大同时借阅数量（必须先从 Branch 节点获取）'),
    }),
    returns: '{ eligible: boolean; count: number; limit: number; reason?: string }',
    description:
      '检查读者是否满足借阅数量上限。branchMaxBorrow 参数必须通过 inspect_node(分馆节点) 获取 maxBorrowPerReader 后再传入，严禁盲传 0。',
    requiredFacts: ['currentBorrowCount'],
    relatedRuleIds: ['borrow_limit_exceeded'],
    preconditions: [
      {
        param: 'branchMaxBorrow',
        check: 'must_be_positive',
        description: 'branchMaxBorrow must be a positive integer fetched from the Branch node',
      },
    ],
  })
  checkBorrowEligibility(args: { branchMaxBorrow: number }): {
    eligible: boolean
    count: number
    limit: number
    reason?: string
  } {
    const { branchMaxBorrow } = args
    if (this.currentBorrowCount >= branchMaxBorrow) {
      return {
        eligible: false,
        count: this.currentBorrowCount,
        limit: branchMaxBorrow,
        reason: `已借 ${this.currentBorrowCount} 本，达到分馆上限 ${branchMaxBorrow} 本`,
      }
    }
    return { eligible: true, count: this.currentBorrowCount, limit: branchMaxBorrow }
  }

  @agentMethod({
    params: z.object({
      requiredMembershipLevel: z
        .enum(['gold', 'silver', 'basic'])
        .describe('目标类目要求的最低会员等级（必须先从 Category 节点获取 requiredMembershipLevel）'),
    }),
    returns: '{ allowed: boolean; readerLevel: string; requiredLevel: string }',
    description:
      '检查读者会员等级是否满足限制类目的访问要求。requiredMembershipLevel 必须通过 inspect_node(Category 节点) 获取后再传入。等级顺序：basic < silver < gold。',
    requiredFacts: ['membershipLevel'],
    relatedRuleIds: ['restricted_category_membership'],
  })
  checkCategoryAccess(args: { requiredMembershipLevel: 'gold' | 'silver' | 'basic' }): {
    allowed: boolean
    readerLevel: string
    requiredLevel: string
  } {
    const readerRank = LEVEL_RANK[this.membershipLevel] ?? 0
    const requiredRank = LEVEL_RANK[args.requiredMembershipLevel] ?? 0
    return {
      allowed: readerRank >= requiredRank,
      readerLevel: this.membershipLevel,
      requiredLevel: args.requiredMembershipLevel,
    }
  }
}

// ──────────────────────────────────────────────
// Book（书籍）
// ──────────────────────────────────────────────
// 馆藏书籍，归属类目、系列、分馆，由作者撰写。

@agentType({ description: '图书馆馆藏书籍，可能属于某类目和系列，在多个分馆有库存' })
export class Book extends BaseNode {
  @agentProperty({ type: 'string', description: '书名', agentVisible: true })
  title: string

  @agentProperty({ type: 'string', description: 'ISBN 编号' })
  isbn: string

  @agentProperty({ type: 'number', description: '上架距今天数（天）' })
  daysOnShelf: number

  @agentProperty({ type: 'number', description: '馆藏总册数' })
  totalCopies: number

  @agentProperty({ type: 'number', description: '当前可借册数（未被借出的库存数）' })
  availableCopies: number

  @agentProperty({
    type: 'number',
    description: '在系列中的卷号（0 表示非系列书；1=第一卷，2=第二卷…）',
  })
  seriesVolume: number

  constructor({
    id,
    title,
    isbn,
    daysOnShelf,
    totalCopies,
    availableCopies,
    seriesVolume = 0,
  }: {
    id: string
    title: string
    isbn: string
    daysOnShelf: number
    totalCopies: number
    availableCopies: number
    seriesVolume?: number
  }) {
    super(id)
    this.title = title
    this.isbn = isbn
    this.daysOnShelf = daysOnShelf
    this.totalCopies = totalCopies
    this.availableCopies = availableCopies
    this.seriesVolume = seriesVolume
  }

  @agentRelation({ type: 'written_by', toType: 'Author', description: '书籍的作者' })
  getAuthors(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'written_by').map((r) => r.to)
  }

  @agentRelation({ type: 'belongs_to', toType: 'Category', description: '书籍所属类目（决定是否有借阅限制）' })
  getCategories(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'belongs_to').map((r) => r.to)
  }

  @agentRelation({ type: 'part_of', toType: 'Series', description: '书籍所属的系列丛书（若为系列书）' })
  getSeries(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'part_of').map((r) => r.to)
  }

  @agentRelation({ type: 'available_at', toType: 'Branch', description: '书籍在哪些分馆有库存' })
  getAvailableBranches(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'available_at').map((r) => r.to)
  }

  @agentMethod({
    returns: '{ available: boolean; availableCopies: number; totalCopies: number }',
    description: '检查书籍当前是否有可借库存',
    requiredFacts: ['availableCopies', 'totalCopies'],
    relatedRuleIds: ['no_copies_available'],
  })
  checkAvailability(_args: Record<string, never> = {}): {
    available: boolean
    availableCopies: number
    totalCopies: number
  } {
    return {
      available: this.availableCopies > 0,
      availableCopies: this.availableCopies,
      totalCopies: this.totalCopies,
    }
  }

  @agentMethod({
    params: z.object({
      protectionDays: z.number().describe('分馆新书保护期天数（必须先从 Branch 节点获取 newBookProtectionDays）'),
    }),
    returns: '{ isNew: boolean; daysOnShelf: number; protectionDays: number }',
    description:
      '判断书籍是否仍处于新书保护期（上架不足 N 天不允许外借）。protectionDays 必须通过 inspect_node(Branch 节点) 获取 newBookProtectionDays 后再传入。',
    requiredFacts: ['daysOnShelf'],
    relatedRuleIds: ['new_book_protection'],
    preconditions: [
      {
        param: 'protectionDays',
        check: 'must_be_positive',
        description: 'protectionDays must be a positive integer fetched from the Branch node',
      },
    ],
  })
  checkNewBookStatus(args: { protectionDays: number }): {
    isNew: boolean
    daysOnShelf: number
    protectionDays: number
  } {
    return {
      isNew: this.daysOnShelf < args.protectionDays,
      daysOnShelf: this.daysOnShelf,
      protectionDays: args.protectionDays,
    }
  }
}

// ──────────────────────────────────────────────
// Author（作者）
// ──────────────────────────────────────────────
// 书籍的创作者，专长于某类目。

@agentType({ description: '书籍作者，专长于特定类目，持有多本在馆书籍' })
export class Author extends BaseNode {
  @agentProperty({ type: 'string', description: '作者姓名', agentVisible: true })
  name: string

  @agentProperty({ type: 'string', description: '国籍' })
  nationality: string

  @agentProperty({ type: 'number', description: '当前在馆的作品数量' })
  activeBookCount: number

  constructor({
    id,
    name,
    nationality,
    activeBookCount,
  }: {
    id: string
    name: string
    nationality: string
    activeBookCount: number
  }) {
    super(id)
    this.name = name
    this.nationality = nationality
    this.activeBookCount = activeBookCount
  }

  @agentRelation({ type: 'specializes_in', toType: 'Category', description: '作者的专长类目' })
  getSpecialtyCategories(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'specializes_in').map((r) => r.to)
  }

  @agentMethod({
    params: z.object({
      borrowThreshold: z
        .number()
        .describe('判断"热门"的借阅量阈值（使用 aggregate_facts 聚合该作者所有书的借阅量后，将结果作为此参数传入）'),
    }),
    returns: '{ popular: boolean; activeBookCount: number; borrowThreshold: number }',
    description:
      '判断作者是否为热门作者。借阅量阈值需先通过 aggregate_facts 聚合该作者旗下所有书籍的 borrowCount，再将聚合结果传入此方法。',
    requiredFacts: ['activeBookCount'],
    relatedRuleIds: ['popular_author_priority'],
  })
  isPopular(args: { borrowThreshold: number }): {
    popular: boolean
    activeBookCount: number
    borrowThreshold: number
  } {
    // In a real system, totalBorrowCount would be fetched from FactStore.
    // The method signature forces the agent to aggregate first before calling.
    return {
      popular: this.activeBookCount >= 2 && args.borrowThreshold >= 5,
      activeBookCount: this.activeBookCount,
      borrowThreshold: args.borrowThreshold,
    }
  }
}

// ──────────────────────────────────────────────
// Category（类目）
// ──────────────────────────────────────────────
// 书籍分类节点，控制哪些会员等级可以借阅。

@agentType({ description: '图书类目，部分类目对会员等级有限制（如科学类目需金卡）' })
export class Category extends BaseNode {
  @agentProperty({ type: 'string', description: '类目名称', agentVisible: true })
  name: string

  @agentProperty({ type: 'boolean', description: '是否为限制类目（true 表示有会员等级要求）' })
  isRestricted: boolean

  @agentProperty({
    type: 'string',
    description: "借阅此类目所需的最低会员等级：'gold' | 'silver' | 'basic'",
  })
  requiredMembershipLevel: 'gold' | 'silver' | 'basic'

  constructor({
    id,
    name,
    isRestricted,
    requiredMembershipLevel,
  }: {
    id: string
    name: string
    isRestricted: boolean
    requiredMembershipLevel: 'gold' | 'silver' | 'basic'
  }) {
    super(id)
    this.name = name
    this.isRestricted = isRestricted
    this.requiredMembershipLevel = requiredMembershipLevel
  }
}

// ──────────────────────────────────────────────
// Series（系列）
// ──────────────────────────────────────────────
// 丛书系列，用于检查读者是否按顺序阅读。

@agentType({ description: '系列丛书（如三体三部曲），包含多卷按顺序排列的书籍' })
export class Series extends BaseNode {
  @agentProperty({ type: 'string', description: '系列名称', agentVisible: true })
  name: string

  @agentProperty({ type: 'number', description: '系列总卷数' })
  totalVolumes: number

  constructor({ id, name, totalVolumes }: { id: string; name: string; totalVolumes: number }) {
    super(id)
    this.name = name
    this.totalVolumes = totalVolumes
  }

  @agentMethod({
    params: z.object({
      readerBorrowedVolumeNumbers: z
        .array(z.number())
        .describe(
          '读者已借阅（或历史借过）的系列卷号列表（先用 query_neighbors 获取读者借阅记录，再提取各书的 seriesVolume）'
        ),
    }),
    returns:
      '{ completedCount: number; totalVolumes: number; canReadNext: boolean; nextVolumeNumber: number; missingPrior: number[] }',
    description:
      '检查读者的系列阅读进度，判断是否可以借阅下一卷。readerBorrowedVolumeNumbers 必须通过 query_neighbors(reader, borrows) 遍历已借书的 seriesVolume 属性来构建，不能凭空传入。',
    requiredFacts: ['totalVolumes'],
    relatedRuleIds: ['series_order_required'],
  })
  checkReaderProgress(args: { readerBorrowedVolumeNumbers: number[] }): {
    completedCount: number
    totalVolumes: number
    canReadNext: boolean
    nextVolumeNumber: number
    missingPrior: number[]
  } {
    const borrowed = new Set(args.readerBorrowedVolumeNumbers)
    const nextVol = Math.max(0, ...args.readerBorrowedVolumeNumbers) + 1 || 1
    const missingPrior: number[] = []
    for (let v = 1; v < nextVol; v++) {
      if (!borrowed.has(v)) missingPrior.push(v)
    }
    return {
      completedCount: borrowed.size,
      totalVolumes: this.totalVolumes,
      canReadNext: missingPrior.length === 0 && nextVol <= this.totalVolumes,
      nextVolumeNumber: nextVol,
      missingPrior,
    }
  }
}

// ──────────────────────────────────────────────
// Branch（分馆）
// ──────────────────────────────────────────────
// 图书馆分馆，持有借阅规则配置，与其他分馆建立馆际合作。

@agentType({ description: '图书馆分馆，持有借阅上限和新书保护期配置，可与合作分馆调拨书籍' })
export class Branch extends BaseNode {
  @agentProperty({ type: 'string', description: '分馆名称', agentVisible: true })
  name: string

  @agentProperty({ type: 'number', description: '每位读者在此分馆可同时借阅的书籍数量上限' })
  maxBorrowPerReader: number

  @agentProperty({ type: 'number', description: '新书保护期（天）：上架不足此天数的书不允许外借' })
  newBookProtectionDays: number

  @agentProperty({ type: 'boolean', description: '是否支持馆际互借（借助合作分馆的库存）' })
  allowInterLibraryLoan: boolean

  constructor({
    id,
    name,
    maxBorrowPerReader,
    newBookProtectionDays,
    allowInterLibraryLoan,
  }: {
    id: string
    name: string
    maxBorrowPerReader: number
    newBookProtectionDays: number
    allowInterLibraryLoan: boolean
  }) {
    super(id)
    this.name = name
    this.maxBorrowPerReader = maxBorrowPerReader
    this.newBookProtectionDays = newBookProtectionDays
    this.allowInterLibraryLoan = allowInterLibraryLoan
  }

  @agentRelation({
    type: 'partners_with',
    toType: 'Branch',
    description: '本馆的合作分馆（支持馆际互借）',
  })
  getPartnerBranches(): NodeId[] {
    return data.relations.filter((r) => r.from === this.id && r.type === 'partners_with').map((r) => r.to)
  }

  @agentMethod({
    returns: '{ partnerBranchIds: string[]; count: number }',
    description: '返回本分馆所有合作分馆的 ID 列表，用于馆际互借路径查找',
    requiredFacts: ['allowInterLibraryLoan'],
    relatedRuleIds: ['inter_library_loan'],
  })
  findPartnerBranches(_args: Record<string, never> = {}): { partnerBranchIds: string[]; count: number } {
    const partnerIds = data.relations.filter((r) => r.from === this.id && r.type === 'partners_with').map((r) => r.to)
    return { partnerBranchIds: partnerIds, count: partnerIds.length }
  }
}
