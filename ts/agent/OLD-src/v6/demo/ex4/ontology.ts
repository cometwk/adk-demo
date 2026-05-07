import { buildOntology } from '../../runtime/ontology-builder'
import type { RelationSchema } from '../../ontology/schema'
import './entities' // 触发 @agentType / @agentProperty / @agentMethod 注册

// ── Library Borrow Request Decision Ontology ──
// 场景：小明想借一本书 — 评估借阅申请是否符合图书馆规定
//
// types 从 AgentRegistry 自动生成（entities.ts 装饰器填充）
// relations 描述图结构层面的边类型，无法从单个实体类推导，保留手动声明

const relations: RelationSchema[] = [
  { type: 'borrows',    fromType: 'Reader', toType: 'Book',    description: '读者当前借阅（已借出、未归还）' },
  { type: 'overdue',    fromType: 'Reader', toType: 'Book',    description: '读者持有的逾期未还书籍' },
  { type: 'requests',   fromType: 'Reader', toType: 'Book',    description: '读者正在申请借阅的书籍' },
  { type: 'managed_by', fromType: 'Book',   toType: 'Library', description: '书籍归属于某个图书馆管理' },
]

export const libraryOntology = buildOntology({ version: '1.0.0', relations })
