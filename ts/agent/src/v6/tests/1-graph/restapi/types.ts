/** REST search 返回的行类型（字段与 DDL 一致） */

export type AgentRow = {
  id: string
  agent_no: string
  name: string
  contact_name?: string
  contact_phone: string
  disabled: number
  rate: number
  notify: number
  parent_id: string
  sort?: string | number
  created_at?: string
  updated_at?: string
  children?: unknown
}

export type MerchRow = {
  id: string
  merch_no: string
  rate: number
  name: string
  contact_name?: string
  contact_phone?: string
  address?: string
  apply_date: string
  chan_merch_id?: string
  chan_merch_no?: string
  chan_merch_name?: string
  disabled: number
  created_at?: string
  updated_at?: string
}

export type ApplyRow = {
  id: string
  agent_no: string
  apply_no: string
  merch_no: string
  merch_name: string
  status: number
  rate: number
  disabled: number
  created_at?: string
  updated_at?: string
}

export type AgentRelRow = {
  id: string
  agent_no: string
  agent_type: string
  agent_id: string
  obj_no: string
  obj_name: string
  obj_id: string
  rate: number
  mode: number
  apply: number
  created_at?: string
  updated_at?: string
}

export type AgentClosureRow = {
  ancestor_id: string
  descendant_id: string
  depth: number
}

export type OrderDailyRow = {
  id: string
  report_date: string
  merch_id: string
  merch_no: string
  merch_name: string
  chan_no: string
  total_count: number
  total_amount: number
  created_at?: string
  updated_at?: string
}

export type ProfitDailyRow = {
  id: string
  stat_date: string
  agent_no: string
  agent_type: string
  rate: number
  total_trade_amt: number
  total_profit: number
  net_profit: number
  own_net_profit: number
  status: number
  created_at?: string
  updated_at?: string
}

export const GRAPH_ENTITY_TYPES = [
  'Agent',
  'Merch',
  'Apply',
  'AgentRel',
  'AgentClosure',
  'OrderDaily',
  'ProfitDaily',
] as const

export type GraphEntityType = (typeof GRAPH_ENTITY_TYPES)[number]
