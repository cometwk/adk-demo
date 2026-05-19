import type { RelationBindingMap } from '../../../ontology/relation-binding'

/** 支付域：关系类型 → 物理表映射（供未来 SqlGraphStore 使用） */
export const paymentRelationBindings: RelationBindingMap = {
  child_of: {
    kind: 'fk',
    onType: 'Agent',
    column: 'parent_id',
    toType: 'Agent',
  },
  descendant_of: {
    kind: 'junction',
    table: 'agent_closure',
    fromColumn: 'ancestor_id',
    toColumn: 'descendant_id',
    where: 'depth > 0',
  },
  ancestor_of: {
    kind: 'junction',
    table: 'agent_closure',
    fromColumn: 'descendant_id',
    toColumn: 'ancestor_id',
    where: 'depth > 0',
  },
  binds_merch: {
    kind: 'junction',
    table: 'agent_rel',
    fromColumn: 'agent_no',
    toColumn: 'obj_no',
    where: "agent_type = 'MERCH'",
  },
  submitted_apply: {
    kind: 'fk',
    onType: 'Apply',
    column: 'agent_no',
    toType: 'Agent',
  },
  has_order_daily: {
    kind: 'fk',
    onType: 'OrderDaily',
    column: 'merch_no',
    toType: 'Merch',
  },
  has_profit_daily: {
    kind: 'fk',
    onType: 'ProfitDaily',
    column: 'agent_no',
    toType: 'Agent',
  },
}
