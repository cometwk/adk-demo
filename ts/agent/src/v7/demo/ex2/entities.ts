import { z } from 'zod'
import { agentMethod, agentProperty } from '../../runtime/decorator'
import { BaseNode } from '../../runtime/graph'

// ── DataModel ──
// Represents a dbt model (table/view) in the data pipeline.

export class DataModel extends BaseNode {
  @agentProperty({
    returns: 'number',
    description: '数据 SLA 刷新时间窗口（小时），超过则视为过时',
  })
  freshnessSlaHours: number

  @agentProperty({
    returns: 'number',
    description: '测试覆盖率 0-1，低于 0.6 为质量风险',
  })
  testCoverage: number

  @agentProperty({ returns: 'boolean', description: '是否有数据负责人' })
  hasOwner: boolean

  @agentProperty({ returns: 'number', description: '模型当前行数（粗估）' })
  rowCount: number

  constructor(id: string, freshnessSlaHours: number, testCoverage: number, hasOwner: boolean, rowCount: number) {
    super(id)
    this.freshnessSlaHours = freshnessSlaHours
    this.testCoverage = testCoverage
    this.hasOwner = hasOwner
    this.rowCount = rowCount
  }

  @agentMethod({
    params: z.object({ hoursSinceLastRefresh: z.number() }),
    returns: '{ stale: boolean; overdueFactor: number }',
    description: '评估模型数据新鲜度风险：hoursSinceLastRefresh / freshnessSlaHours',
    requiredFacts: ['freshnessSlaHours'],
    relatedRuleIds: ['data_freshness_violation'],
    preconditions: [
      {
        param: 'hoursSinceLastRefresh',
        check: 'must_be_positive',
        description: 'hoursSinceLastRefresh must come from a real event timeline query',
      },
    ],
  })
  assessFreshnessRisk(args: { hoursSinceLastRefresh: number }): {
    stale: boolean
    overdueFactor: number
  } {
    const factor = args.hoursSinceLastRefresh / this.freshnessSlaHours
    return { stale: factor > 1, overdueFactor: Math.round(factor * 100) / 100 }
  }
}

// ── DataSource ──
// Represents an upstream data source (API, database, Kafka topic, etc.).

export class DataSource extends BaseNode {
  @agentProperty({
    returns: 'string',
    description: '数据源类型：api | database | streaming',
  })
  sourceType: 'api' | 'database' | 'streaming'

  @agentProperty({ returns: 'number', description: '平均数据更新间隔（小时）' })
  avgUpdateIntervalHours: number

  constructor(id: string, sourceType: 'api' | 'database' | 'streaming', avgUpdateIntervalHours: number) {
    super(id)
    this.sourceType = sourceType
    this.avgUpdateIntervalHours = avgUpdateIntervalHours
  }

  @agentMethod({
    params: z.object({ currentDelayHours: z.number() }),
    returns: '{ reliable: boolean; delayRatio: number }',
    description: '检查数据源当前延迟是否超过平均间隔的 2 倍',
    requiredFacts: ['avgUpdateIntervalHours'],
    relatedRuleIds: ['source_reliability_low'],
    preconditions: [
      {
        param: 'currentDelayHours',
        check: 'must_be_positive',
        description: 'currentDelayHours must come from a real incident event',
      },
    ],
  })
  checkReliability(args: { currentDelayHours: number }): {
    reliable: boolean
    delayRatio: number
  } {
    const ratio = args.currentDelayHours / this.avgUpdateIntervalHours
    return { reliable: ratio <= 2, delayRatio: Math.round(ratio * 100) / 100 }
  }
}

// ── Dashboard ──
// Represents a BI dashboard consuming data models.

export class Dashboard extends BaseNode {
  @agentProperty({
    returns: "'low' | 'medium' | 'high' | 'critical'",
    description: '业务关键度',
  })
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical'

  @agentProperty({
    returns: 'number',
    description: '直接依赖的 DataModel 数量',
  })
  dependencyCount: number

  constructor(id: string, criticalityLevel: 'low' | 'medium' | 'high' | 'critical', dependencyCount: number) {
    super(id)
    this.criticalityLevel = criticalityLevel
    this.dependencyCount = dependencyCount
  }
}

// ── DataOwner ──
// Represents the team responsible for a set of data models.

export class DataOwner extends BaseNode {
  @agentProperty({ returns: 'string', description: '负责团队名称' })
  teamName: string

  @agentProperty({ returns: 'number', description: '该 owner 负责的模型数量' })
  modelCount: number

  constructor(id: string, teamName: string, modelCount: number) {
    super(id)
    this.teamName = teamName
    this.modelCount = modelCount
  }
}
