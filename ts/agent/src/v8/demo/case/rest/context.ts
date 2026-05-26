import type { AccessContext, RestNodeClassRegistry } from '../../../provider/rest-query'
import { Agent, AgentClosure, AgentRel, Apply, Merch, OrderDaily, ProfitDaily } from './ontology'

export const typeRegistry: RestNodeClassRegistry = {
  Agent: { class: Agent, prefix: '/agent' },
  Merch: { class: Merch, prefix: '/merch' },
  Apply: { class: Apply, prefix: '/apply' },
  AgentRel: { class: AgentRel, prefix: '/agent_rel' },
  AgentClosure: { class: AgentClosure, prefix: '/agent_closure' },
  OrderDaily: { class: OrderDaily, prefix: '/order_daily' },
  ProfitDaily: { class: ProfitDaily, prefix: '/profit_daily' },
}

export const paymentAccessContext: Partial<AccessContext> = {
  typeRegistry,
}
