import type { FieldSchema } from '../../../../engine/stores/compute-store'

// ── OrderDaily Schema ──
// Based on DDL: order_daily.sql

export const OrderDailySchema: FieldSchema[] = [
  { name: 'report_date', type: 'date', aggregatable: false },
  { name: 'merch_no', type: 'string', aggregatable: false },
  { name: 'merch_name', type: 'string', aggregatable: false },
  { name: 'chan_no', type: 'string', aggregatable: false },
  { name: 'total_count', type: 'number', aggregatable: true },
  { name: 'total_amount', type: 'number', aggregatable: true },
]

// ── OrderDaily Seed Data ──

export const OrderDailySeed: Record<string, unknown>[] = [
  // May 2026 data for merchants M001, M002, M003
  { report_date: '2026-05-01', merch_no: 'M001', merch_name: 'Merchant 1', chan_no: 'C001', total_count: 10, total_amount: 100000 },
  { report_date: '2026-05-01', merch_no: 'M002', merch_name: 'Merchant 2', chan_no: 'C001', total_count: 5, total_amount: 50000 },
  { report_date: '2026-05-02', merch_no: 'M001', merch_name: 'Merchant 1', chan_no: 'C001', total_count: 12, total_amount: 120000 },
  { report_date: '2026-05-02', merch_no: 'M002', merch_name: 'Merchant 2', chan_no: 'C001', total_count: 3, total_amount: 30000 },
  // M003 has NO transactions in May (testing "no transaction" scenario)
  { report_date: '2026-05-15', merch_no: 'M001', merch_name: 'Merchant 1', chan_no: 'C002', total_count: 8, total_amount: 80000 },
  { report_date: '2026-05-20', merch_no: 'M002', merch_name: 'Merchant 2', chan_no: 'C002', total_count: 7, total_amount: 70000 },
]

// ── ProfitDaily Schema ──
// Based on DDL: profit_daily.sql

export const ProfitDailySchema: FieldSchema[] = [
  { name: 'stat_date', type: 'date', aggregatable: false },
  { name: 'agent_no', type: 'string', aggregatable: false },
  { name: 'agent_type', type: 'string', aggregatable: false },
  { name: 'total_trade_amt', type: 'number', aggregatable: true },
  { name: 'order_cnt', type: 'number', aggregatable: true },
  { name: 'total_profit', type: 'number', aggregatable: true },
  { name: 'net_profit', type: 'number', aggregatable: true },
  { name: 'own_trade_amt', type: 'number', aggregatable: true },
  { name: 'own_order_cnt', type: 'number', aggregatable: true },
  { name: 'own_profit', type: 'number', aggregatable: true },
  { name: 'own_net_profit', type: 'number', aggregatable: true },
]

// ── ProfitDaily Seed Data ──

export const ProfitDailySeed: Record<string, unknown>[] = [
  // May 2026 profit data for agent A001
  { stat_date: '2026-05-01', agent_no: 'A001', agent_type: 'MERCH', total_trade_amt: 150000, order_cnt: 15, total_profit: 1500, net_profit: 1500, own_trade_amt: 100000, own_order_cnt: 10, own_profit: 1000, own_net_profit: 1000 },
  { stat_date: '2026-05-02', agent_no: 'A001', agent_type: 'MERCH', total_trade_amt: 150000, order_cnt: 15, total_profit: 1500, net_profit: 1500, own_trade_amt: 120000, own_order_cnt: 12, own_profit: 1200, own_net_profit: 1200 },
  { stat_date: '2026-05-15', agent_no: 'A001', agent_type: 'MERCH', total_trade_amt: 80000, order_cnt: 8, total_profit: 800, net_profit: 800, own_trade_amt: 80000, own_order_cnt: 8, own_profit: 800, own_net_profit: 800 },
  { stat_date: '2026-05-20', agent_no: 'A001', agent_type: 'MERCH', total_trade_amt: 100000, order_cnt: 10, total_profit: 1000, net_profit: 1000, own_trade_amt: 70000, own_order_cnt: 7, own_profit: 700, own_net_profit: 700 },
]

// ── Seed function ──

import { InMemoryComputeStore } from '../../in-memory-compute'

export function seedComputeStore(store: InMemoryComputeStore): void {
  store.seedSource('OrderDaily', OrderDailySeed, OrderDailySchema)
  store.seedSource('ProfitDaily', ProfitDailySeed, ProfitDailySchema)
}