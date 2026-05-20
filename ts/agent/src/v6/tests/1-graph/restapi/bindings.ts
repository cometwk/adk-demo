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

  // 补全所有 L1 Ontology 声明的关系的物理映射
  bound_by: {
    kind: 'junction',
    table: 'agent_rel',
    fromColumn: 'obj_no',
    toColumn: 'agent_no',
    where: "agent_type = 'MERCH'",
  },
  created_from: {
    kind: 'inverse_fk',
    onType: 'Apply',
    column: 'merch_no',
    fromType: 'Merch',
  },
  submitted_by: {
    kind: 'fk',
    onType: 'Apply',
    column: 'agent_no',
    toType: 'Agent',
  },
  creates: {
    kind: 'fk',
    onType: 'Apply',
    column: 'merch_no',
    toType: 'Merch',
  },
  for_agent: {
    kind: 'fk',
    onType: 'AgentRel',
    column: 'agent_no',
    toType: 'Agent',
  },
  for_merch: {
    kind: 'fk',
    onType: 'AgentRel',
    column: 'obj_id',
    toType: 'Merch',
  },
  ancestor: {
    kind: 'fk',
    onType: 'AgentClosure',
    column: 'ancestor_id',
    toType: 'Agent',
  },
  descendant: {
    kind: 'fk',
    onType: 'AgentClosure',
    column: 'descendant_id',
    toType: 'Agent',
  },
}
