import type { RelationSchema } from '../../../ontology/schema'
import { RestGraphStore, type AccessContext, type RestAccessBindingMap, type NodeClassRegistry } from '../../../provider/rest'
import { BaseNode } from '../../../runtime/graph'
import { paymentAccessBindings } from './access-bindings'
import { sharedAccessContext } from './access-executor'
import { TYPE_API_PREFIX } from './search-helpers'
import { Agent, Merch, Apply, AgentRel, AgentClosure, OrderDaily, ProfitDaily } from './ontology'

// 将 PaymentAccessBindingMap 转换为 RestAccessBindingMap
const bindings: RestAccessBindingMap = paymentAccessBindings as unknown as RestAccessBindingMap

// NodeClassRegistry: type → BaseNode class 映射
const nodeClassRegistry: NodeClassRegistry = {
  Agent,
  Merch,
  Apply,
  AgentRel,
  AgentClosure,
  OrderDaily,
  ProfitDaily,
}

/** 基于 /admin{entity}/search 的 GraphStore 实现，完全由声明式 bindings 驱动 */
export class RestCrudGraphStore extends RestGraphStore {
  constructor(_opts: { relations?: RelationSchema[] } = {}) {
    super(
      bindings,
      TYPE_API_PREFIX,
      sharedAccessContext as Partial<AccessContext>,
      {
        // AgentClosure 的 ID 生成器
        idGenerator: (type, row) => {
          if (type === 'AgentClosure') {
            return `${row.ancestor_id}_${row.descendant_id}`
          }
          return String(row.id ?? '')
        },
        nodeClassRegistry,
      },
    )
  }
}