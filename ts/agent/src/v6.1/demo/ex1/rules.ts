import { registerRule } from '../../ontology/rules'

// ── Engineering org delivery-risk rules ──
// Migrated from src/v6/ontology/rules.ts (registerProjectPortalRules).

export function registerEngineeringRules(): void {
  // ── inference_rule: engineer burnout threshold ──
  registerRule({
    id: 'engineer_burnout_threshold',
    version: '1.0.0',
    kind: 'inference_rule',
    appliesTo: ['Engineer'],
    description: '工程师倦怠风险：senior > 80h, mid > 70h, junior > 55h',
    requiredFacts: [
      { property: 'workload', scope: 'entity' },
      { property: 'seniority', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 0.75,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const workload = ctx.facts.getValue(entityId, 'workload') as number | undefined
      const seniority = ctx.facts.getValue(entityId, 'seniority') as string | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (workload === undefined) missing.push({ entityId, property: 'workload' })
      if (seniority === undefined) missing.push({ entityId, property: 'seniority' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const thresholds: Record<string, number> = {
        senior: 80,
        mid: 70,
        junior: 55,
      }
      const threshold = thresholds[seniority!] ?? 70
      const triggered = (workload as number) > threshold
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `${entityId} 工作负载 ${workload}h 超过 ${seniority} 阈值 ${threshold}h`
          : `${entityId} 工作负载 ${workload}h 在阈值 ${threshold}h 以内`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── hard_constraint: team capacity overload ──
  registerRule({
    id: 'team_capacity_overload',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['Team'],
    description: '团队成员数超过容量即为超载',
    requiredFacts: [
      { property: 'memberCount', scope: 'entity' },
      { property: 'capacity', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['LOW'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const memberCount = ctx.facts.getValue(entityId, 'memberCount') as number | undefined
      const capacity = ctx.facts.getValue(entityId, 'capacity') as number | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (memberCount === undefined) missing.push({ entityId, property: 'memberCount' })
      if (capacity === undefined) missing.push({ entityId, property: 'capacity' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const triggered = (memberCount as number) > (capacity as number)
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `团队超载：${memberCount} 人超过容量 ${capacity}`
          : `团队未超载：${memberCount} 人，容量 ${capacity}`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── inference_rule: project team load ──
  registerRule({
    id: 'project_team_load',
    version: '1.0.0',
    kind: 'inference_rule',
    appliesTo: ['Project'],
    description: '项目关联工程师的总工作负载超过 200h 表示团队超载',
    requiredFacts: [{ property: 'teamLoad', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.6,
    subsumedBy: ['engineer_burnout_threshold'],
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const teamLoad = ctx.facts.getValue(entityId, 'teamLoad') as number | undefined
      if (teamLoad === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'teamLoad' }],
        }
      const triggered = (teamLoad as number) > 200
      return {
        triggered,
        severity: triggered ? 'high' : 'medium',
        explanation: triggered ? `团队总负载 ${teamLoad}h 超过 200h 阈值` : `团队总负载 ${teamLoad}h 在 200h 以内`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: senior coverage (risk-down) ──
  registerRule({
    id: 'senior_coverage',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Project'],
    description: '项目至少需要一名高级工程师以降低交付风险',
    requiredFacts: [{ property: 'seniorCount', scope: 'entity' }],
    direction: 'risk_down',
    weight: 0.8,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const seniorCount = ctx.facts.getValue(entityId, 'seniorCount') as number | undefined
      if (seniorCount === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'seniorCount' }],
        }
      const triggered = (seniorCount as number) >= 1
      return {
        triggered,
        severity: triggered ? 'low' : 'high',
        explanation: triggered
          ? `项目有 ${seniorCount} 名高级工程师，降低交付风险`
          : '项目没有高级工程师，缺乏技术把关',
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: dependency risk propagation ──
  registerRule({
    id: 'dependency_risk_propagation',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Project'],
    description: '依赖项目的风险会传导到被依赖项目',
    requiredFacts: [{ property: 'dependencyRisk', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.7,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const depRisk = ctx.facts.getValue(entityId, 'dependencyRisk') as string | undefined
      if (depRisk === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'dependencyRisk' }],
        }
      const triggered = depRisk === 'HIGH' || depRisk === 'MEDIUM'
      return {
        triggered,
        severity: depRisk === 'HIGH' ? 'high' : 'medium',
        explanation: triggered ? `依赖项目风险为 ${depRisk}，传导交付风险` : '依赖项目风险为 LOW，不影响交付',
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: high priority pressure ──
  registerRule({
    id: 'high_priority_pressure',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['Project'],
    description: '高优先级项目对交付不确定性的容忍度更低',
    requiredFacts: [{ property: 'priority', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.6,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const priority = ctx.facts.getValue(entityId, 'priority') as string | undefined
      if (priority === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'priority' }],
        }
      const triggered = priority === 'high'
      return {
        triggered,
        severity: triggered ? 'medium' : 'low',
        explanation: triggered ? '高优先级项目对交付延迟敏感' : `项目优先级为 ${priority}，容忍度较高`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── explanation_policy: missing high-impact fact ──
  registerRule({
    id: 'missing_high_impact_fact',
    version: '1.0.0',
    kind: 'explanation_policy',
    appliesTo: ['Project', 'Engineer', 'Team'],
    description: '当关键事实缺失时，应标注不确定性而非给出虚假结论',
    requiredFacts: [],
    direction: 'neutral',
    evaluator() {
      return { triggered: false }
    },
    explanation() {
      return '关键事实缺失，该结论的可信度降低'
    },
  })
}
