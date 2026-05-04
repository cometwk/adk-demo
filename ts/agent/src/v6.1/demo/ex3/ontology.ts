import type { Ontology } from '../../ontology/schema'

// ── Library lending scenario ontology ──

export const libraryOntology: Ontology = {
  version: '1.0.0',
  types: [
    {
      name: 'Reader',
      description: '图书馆读者，拥有借阅记录和逾期状态',
      properties: [
        {
          name: 'borrowedCount',
          type: 'number',
          description: '当前已借阅数量',
          agentVisible: true,
        },
        {
          name: 'hasOverdue',
          type: 'boolean',
          description: '是否有逾期未还图书',
          agentVisible: true,
        },
        {
          name: 'overdueCount',
          type: 'number',
          description: '逾期图书数量',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'checkBorrowCapacity',
          description: '检查读者剩余借阅额度（最多 3 本）',
        },
        {
          name: 'checkOverdueBlock',
          description: '检查逾期状态是否阻止借新书',
        },
      ],
    },
    {
      name: 'Book',
      description: '图书馆藏书',
      properties: [
        {
          name: 'title',
          type: 'string',
          description: '图书标题',
          agentVisible: true,
        },
        {
          name: 'category',
          type: "'fiction' | 'nonfiction' | 'reference' | 'textbook'",
          description: '图书分类',
          agentVisible: true,
        },
        {
          name: 'isNew',
          type: 'boolean',
          description: '是否为新书',
          agentVisible: true,
        },
        {
          name: 'shelvedAt',
          type: 'string',
          description: '上架日期',
          agentVisible: true,
        },
        {
          name: 'canCheckout',
          type: 'boolean',
          description: '是否可外借',
          agentVisible: true,
        },
        {
          name: 'status',
          type: "'available' | 'borrowed' | 'in_library_only'",
          description: '当前状态',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'checkNewBookStatus',
          description: '检查是否为新书（上架 7 天内不可外借）',
        },
        { name: 'checkAvailability', description: '检查图书当前是否可借' },
      ],
    },
    {
      name: 'Library',
      description: '图书馆，定义借阅规则',
      properties: [
        {
          name: 'name',
          type: 'string',
          description: '图书馆名称',
          agentVisible: true,
        },
        {
          name: 'borrowLimit',
          type: 'number',
          description: '单读者最大借阅数量',
          agentVisible: true,
        },
        {
          name: 'newBookRestrictionDays',
          type: 'number',
          description: '新书限制天数',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'evaluateBorrowRequest',
          description: '综合评估借阅请求是否符合规则',
        },
      ],
    },
    {
      name: 'BorrowRecord',
      description: '借阅记录，关联读者与图书',
      properties: [
        {
          name: 'borrowedAt',
          type: 'string',
          description: '借阅日期',
          agentVisible: true,
        },
        {
          name: 'dueDate',
          type: 'string',
          description: '应还日期',
          agentVisible: true,
        },
        {
          name: 'returnedAt',
          type: 'string',
          description: '实际归还日期',
          agentVisible: true,
        },
        {
          name: 'isOverdue',
          type: 'boolean',
          description: '是否逾期',
          agentVisible: true,
        },
      ],
      methods: [{ name: 'checkOverdue', description: '检查记录是否逾期' }],
    },
  ],
  relations: [
    {
      type: 'borrows',
      from: 'Reader',
      to: 'Book',
      description: '读者借阅图书',
    },
    {
      type: 'borrowed_by',
      from: 'Book',
      to: 'Reader',
      description: '图书被读者借阅',
    },
    {
      type: 'has_record',
      from: 'Reader',
      to: 'BorrowRecord',
      description: '读者有借阅记录',
    },
    {
      type: 'for_book',
      from: 'BorrowRecord',
      to: 'Book',
      description: '记录对应某图书',
    },
    {
      type: 'member_of',
      from: 'Reader',
      to: 'Library',
      description: '读者是图书馆会员',
    },
    {
      type: 'holds',
      from: 'Library',
      to: 'Book',
      description: '图书馆收藏图书',
    },
  ],
}
