import type { RelationSchema } from '../../../ontology/schema'
import { RestGraphStore, type AccessContext, type RestAccessBindingMap } from '../../../provider/rest'
import { paymentAccessBindings } from './access-bindings'
import { sharedAccessContext, typeRegistry } from './access-executor'

// 将 PaymentAccessBindingMap 转换为 RestAccessBindingMap
const bindings: RestAccessBindingMap = paymentAccessBindings as unknown as RestAccessBindingMap

/** 基于 /admin{entity}/search 的 GraphStore 实现，完全由声明式 bindings 驱动 */
export class RestCrudGraphStore extends RestGraphStore {
  constructor(_opts: { relations?: RelationSchema[] } = {}) {
    super(
      bindings,
      {
        ...sharedAccessContext,
        typeRegistry,
      } as Partial<AccessContext>,
      {
        // AgentClosure 的 ID 生成器
        idGenerator: (type, row) => {
          if (type === 'AgentClosure') {
            return `${row.ancestor_id}_${row.descendant_id}`
          }
          return String(row.id ?? '')
        },
      },
    )
  }
}