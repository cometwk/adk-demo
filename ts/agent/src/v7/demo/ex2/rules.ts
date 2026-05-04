import { registerRule } from '../../ontology/rules'

// ── dbt data pipeline quality rules ──

export function registerDbtRules(): void {
  // ── hard_constraint: data freshness violation ──
  // Triggers when a model hasn't been refreshed within its SLA window.
  registerRule({
    id: 'data_freshness_violation',
    version: '1.0.0',
    kind: 'hard_constraint',
    appliesTo: ['DataModel'],
    description: '数据超过 SLA 未刷新 → 下游 dashboard 数据错误风险',
    requiredFacts: [
      { property: 'freshnessSlaHours', scope: 'entity' },
      { property: 'hoursSinceLastRefresh', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 1.0,
    veto: { candidatesByLabel: ['LOW'] },
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const sla = ctx.facts.getValue(entityId, 'freshnessSlaHours') as number | undefined
      const elapsed = ctx.facts.getValue(entityId, 'hoursSinceLastRefresh') as number | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (sla === undefined) missing.push({ entityId, property: 'freshnessSlaHours' })
      if (elapsed === undefined) missing.push({ entityId, property: 'hoursSinceLastRefresh' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const triggered = (elapsed as number) > (sla as number)
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `模型 ${entityId} 已 ${elapsed}h 未刷新，超过 SLA ${sla}h`
          : `模型 ${entityId} 刷新延迟 ${elapsed}h，在 SLA ${sla}h 以内`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: low test coverage ──
  registerRule({
    id: 'low_test_coverage',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['DataModel'],
    description: '测试覆盖率 < 0.6 → 数据质量风险上升',
    requiredFacts: [{ property: 'testCoverage', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.65,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const coverage = ctx.facts.getValue(entityId, 'testCoverage') as number | undefined
      if (coverage === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'testCoverage' }],
        }
      const triggered = (coverage as number) < 0.6
      return {
        triggered,
        severity: triggered ? 'medium' : 'low',
        explanation: triggered
          ? `模型 ${entityId} 测试覆盖率 ${coverage} 低于阈值 0.6`
          : `模型 ${entityId} 测试覆盖率 ${coverage} 达标`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: unowned model ──
  registerRule({
    id: 'unowned_model',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['DataModel'],
    description: '无 owner 的模型 → 治理风险',
    requiredFacts: [{ property: 'hasOwner', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.55,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const hasOwner = ctx.facts.getValue(entityId, 'hasOwner') as boolean | undefined
      if (hasOwner === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'hasOwner' }],
        }
      const triggered = !hasOwner
      return {
        triggered,
        severity: triggered ? 'medium' : 'low',
        explanation: triggered ? `模型 ${entityId} 无负责人，存在治理风险` : `模型 ${entityId} 已分配负责人`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── inference_rule: high downstream impact ──
  registerRule({
    id: 'high_downstream_impact',
    version: '1.0.0',
    kind: 'inference_rule',
    appliesTo: ['DataModel'],
    description: '下游 dashboard 数量 > 3 → 故障影响面扩大',
    requiredFacts: [{ property: 'downstreamDashboardCount', scope: 'entity' }],
    direction: 'risk_up',
    weight: 0.7,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const count = ctx.facts.getValue(entityId, 'downstreamDashboardCount') as number | undefined
      if (count === undefined)
        return {
          triggered: false,
          missingFacts: [{ entityId, property: 'downstreamDashboardCount' }],
        }
      const triggered = (count as number) > 3
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `模型 ${entityId} 被 ${count} 个看板引用，影响面广`
          : `模型 ${entityId} 下游看板数量 ${count}，影响面可控`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })

  // ── soft_criterion: source reliability low ──
  registerRule({
    id: 'source_reliability_low',
    version: '1.0.0',
    kind: 'soft_criterion',
    appliesTo: ['DataSource'],
    description: '上游数据源平均延迟超阈值 → 数据管道稳定性风险',
    requiredFacts: [
      { property: 'avgUpdateIntervalHours', scope: 'entity' },
      { property: 'currentDelayHours', scope: 'entity' },
    ],
    direction: 'risk_up',
    weight: 0.75,
    evaluator(ctx) {
      const entityId = ctx.entityId
      if (!entityId) return { triggered: false, missingFacts: [] }
      const avg = ctx.facts.getValue(entityId, 'avgUpdateIntervalHours') as number | undefined
      const delay = ctx.facts.getValue(entityId, 'currentDelayHours') as number | undefined
      const missing: Array<{ entityId: string; property: string }> = []
      if (avg === undefined) missing.push({ entityId, property: 'avgUpdateIntervalHours' })
      if (delay === undefined) missing.push({ entityId, property: 'currentDelayHours' })
      if (missing.length > 0) return { triggered: false, missingFacts: missing }
      const ratio = (delay as number) / (avg as number)
      const triggered = ratio > 2
      return {
        triggered,
        severity: triggered ? 'high' : 'low',
        explanation: triggered
          ? `数据源 ${entityId} 当前延迟 ${delay}h 超过均值 ${avg}h 的 2 倍`
          : `数据源 ${entityId} 延迟比率 ${ratio.toFixed(2)}，在阈值以内`,
        missingFacts: [],
      }
    },
    explanation(result) {
      return result.explanation ?? ''
    },
  })
}
