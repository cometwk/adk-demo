import type { Ontology } from '../../ontology/schema'

// ── Library Borrow Request Decision Ontology ──
// 场景：小明想借一本书 — 评估借阅申请是否符合图书馆规定

export const libraryOntology: Ontology = {
  version: '1.0.0',
  types: [
    {
      name: 'Reader',
      description: '图书馆读者，持有借阅证，可以申请借阅书籍',
      properties: [
        {
          name: 'name',
          type: 'string',
          description: '读者姓名',
          agentVisible: true,
        },
        {
          name: 'currentBorrowCount',
          type: 'number',
          description: '当前已借出且未归还的书籍数量',
          agentVisible: true,
        },
        {
          name: 'hasOverdueBook',
          type: 'boolean',
          description: '是否有逾期未还的书籍',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'checkBorrowEligibility',
          description: '检查读者是否满足基本借阅资格：未超借阅上限且无逾期书籍',
        },
      ],
    },
    {
      name: 'Book',
      description: '图书馆馆藏书籍，可能有新书保护期限制',
      properties: [
        {
          name: 'title',
          type: 'string',
          description: '书名',
          agentVisible: true,
        },
        {
          name: 'isbn',
          type: 'string',
          description: 'ISBN 编号',
          agentVisible: true,
        },
        {
          name: 'daysOnShelf',
          type: 'number',
          description: '上架距今天数',
          agentVisible: true,
        },
        {
          name: 'lendable',
          type: 'boolean',
          description: '馆员手动标注的外借许可',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'checkNewBookStatus',
          description: '判断是否为新书（上架不足 7 天），新书不允许外借',
        },
      ],
    },
    {
      name: 'Library',
      description: '图书馆管理机构，持有借阅规则配置',
      properties: [
        {
          name: 'maxBorrowPerReader',
          type: 'number',
          description: '每位读者最多可同时借阅的书籍数量',
          agentVisible: true,
        },
        {
          name: 'newBookProtectionDays',
          type: 'number',
          description: '新书保护期（天）',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'evaluateBorrowRequest',
          description: '综合评估读者是否可以借阅指定书籍，返回所有阻断原因',
        },
      ],
    },
  ],
  relations: [
    {
      type: 'borrows',
      from: 'Reader',
      to: 'Book',
      description: '读者当前借阅（已借出、未归还）',
    },
    {
      type: 'overdue',
      from: 'Reader',
      to: 'Book',
      description: '读者持有的逾期未还书籍',
    },
    {
      type: 'requests',
      from: 'Reader',
      to: 'Book',
      description: '读者正在申请借阅的书籍',
    },
    {
      type: 'managed_by',
      from: 'Book',
      to: 'Library',
      description: '书籍归属于某个图书馆管理',
    },
  ],
}
