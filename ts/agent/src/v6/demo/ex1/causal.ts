import { CausalGraph, type CausalEdge } from '../../ontology/causal'

// ── Engineering org causal graph ──
// Migrated from src/v6/ontology/causal.ts (buildProjectPortalCausalGraph).

export function buildEngineeringCausalGraph(): CausalGraph {
  const edges: CausalEdge[] = [
    {
      id: 'ce_workload_burnout',
      cause: {
        kind: 'fact_condition',
        matcher: 'Engineer.workload > threshold',
      },
      effect: { kind: 'state', matcher: 'productivity_drop' },
      mechanism: '持续超阈值工时导致疲劳累积，单位时间产出下降',
      typicalLag: '1-3 weeks',
      strength: 'moderate',
      relatedRuleIds: ['engineer_burnout_threshold'],
    },
    {
      id: 'ce_productivity_drop_milestone_miss',
      cause: { kind: 'state', matcher: 'productivity_drop' },
      effect: { kind: 'event_type', matcher: 'milestone_missed' },
      mechanism: '产出下降导致里程碑延期',
      typicalLag: 'weeks',
      strength: 'moderate',
      relatedRuleIds: ['project_team_load'],
    },
    {
      id: 'ce_dep_slip_portal_blocked',
      cause: { kind: 'event_type', matcher: 'delivery_slip' },
      effect: { kind: 'state', matcher: 'downstream_blocked' },
      mechanism: '依赖项目未按时交付，阻塞下游开发',
      typicalLag: '0 days',
      strength: 'strong',
      relatedRuleIds: ['dependency_risk_propagation'],
    },
    {
      id: 'ce_blocked_milestone_miss',
      cause: { kind: 'state', matcher: 'downstream_blocked' },
      effect: { kind: 'event_type', matcher: 'milestone_missed' },
      mechanism: '阻塞状态直接导致里程碑无法完成',
      typicalLag: 'immediate',
      strength: 'strong',
      relatedRuleIds: ['dependency_risk_propagation'],
    },
    {
      id: 'ce_scope_added_pressure',
      cause: { kind: 'event_type', matcher: 'scope_added' },
      effect: { kind: 'state', matcher: 'deadline_pressure_increase' },
      mechanism: '范围扩张但人力不变，截止日期压力升高',
      typicalLag: '0-7 days',
      strength: 'strong',
      relatedRuleIds: ['high_priority_pressure'],
    },
    {
      id: 'ce_deadline_pressure_milestone_miss',
      cause: { kind: 'state', matcher: 'deadline_pressure_increase' },
      effect: { kind: 'event_type', matcher: 'milestone_missed' },
      mechanism: '截止日期压力升高且资源不足时里程碑延期',
      typicalLag: '1-3 weeks',
      strength: 'moderate',
      relatedRuleIds: ['high_priority_pressure'],
    },
    {
      id: 'ce_team_overload_milestone_miss',
      cause: { kind: 'state', matcher: 'team_overloaded' },
      effect: { kind: 'event_type', matcher: 'milestone_missed' },
      mechanism: '团队超载直接降低整体交付能力',
      typicalLag: '1-2 weeks',
      strength: 'strong',
      relatedRuleIds: ['team_capacity_overload', 'project_team_load'],
    },
  ]
  return new CausalGraph(edges)
}
