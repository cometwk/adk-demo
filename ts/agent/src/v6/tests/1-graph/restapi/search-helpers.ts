import { parseGlobalId as baseParseGlobalId, toGlobalId } from '../../../provider/rest'
import type { GraphEntityType } from './types'

// ── 业务专用: TYPE_API_PREFIX ──

/** 实体类型 → REST search 路径前缀 */
export const TYPE_API_PREFIX: Record<GraphEntityType, string> = {
  Agent: '/agent',
  Merch: '/merch',
  Apply: '/apply',
  AgentRel: '/agent_rel',
  AgentClosure: '/agent_closure',
  OrderDaily: '/order_daily',
  ProfitDaily: '/profit_daily',
}

// ── 业务专用: parseGlobalId (使用 TYPE_API_PREFIX) ──

export function parseGlobalId(id: string): { type: GraphEntityType; rawId: string } {
  return baseParseGlobalId(id, TYPE_API_PREFIX) as { type: GraphEntityType; rawId: string }
}

// ── 向后兼容导出 ──

export { toGlobalId }
